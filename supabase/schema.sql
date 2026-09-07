-- Run once in a NEW Supabase project's SQL editor. No secrets belong in this file.
begin;

create table public.fmk_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  public_key text not null,
  private_key jsonb not null,
  master jsonb not null
);
create table public.fmk_vaults (
  id uuid primary key,
  owner_id uuid not null unique references public.fmk_profiles(id),
  body jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.fmk_members (
  vault_id uuid references public.fmk_vaults(id) on delete cascade,
  user_id uuid references public.fmk_profiles(id) on delete cascade,
  wrapped_key text not null,
  recovery_key text,
  primary key (vault_id, user_id)
);
alter table public.fmk_profiles enable row level security;
alter table public.fmk_vaults enable row level security;
alter table public.fmk_members enable row level security;
-- No direct table access. Every operation below checks the verified auth.uid().
revoke all on public.fmk_profiles, public.fmk_vaults, public.fmk_members from anon, authenticated;

create function public.fmk_create_account(p_name text, p_public_key text, p_private_key jsonb, p_master jsonb, p_vault_id uuid, p_body jsonb, p_wrapped_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(p_public_key) > 2000 or octet_length(p_body::text) > 6000000 then raise exception 'Invalid data'; end if;
  insert into public.fmk_profiles values (auth.uid(), p_name, p_public_key, p_private_key, p_master);
  insert into public.fmk_vaults(id, owner_id, body) values (p_vault_id, auth.uid(), p_body);
  insert into public.fmk_members values (p_vault_id, auth.uid(), p_wrapped_key, null);
end $$;

create function public.fmk_snapshot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.fmk_profiles p where p.id = auth.uid()),
    'vaults', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'owner_id', v.owner_id, 'body', v.body, 'version', v.version, 'updated_at', v.updated_at,
      'wrapped_key', m.wrapped_key, 'recovery_key', m.recovery_key, 'owner', to_jsonb(p)
    ) order by (v.owner_id = auth.uid()) desc, p.name)
    from public.fmk_members m join public.fmk_vaults v on v.id = m.vault_id
    join public.fmk_profiles p on p.id = v.owner_id where m.user_id = auth.uid()), '[]'::jsonb),
    'helpers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name))
    from public.fmk_vaults v join public.fmk_members m on m.vault_id = v.id
    join public.fmk_profiles p on p.id = m.user_id
    where v.owner_id = auth.uid() and m.user_id <> auth.uid()), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create function public.fmk_save_vault(p_id uuid, p_version integer, p_body jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare current_version integer;
begin
  if auth.uid() is null or not exists (select 1 from public.fmk_members where vault_id = p_id and user_id = auth.uid()) then raise exception 'Access denied'; end if;
  if octet_length(p_body::text) > 6000000 then raise exception 'Vault is too large'; end if;
  select version into current_version from public.fmk_vaults where id = p_id for update;
  if current_version <> p_version then raise exception 'VERSION_CONFLICT'; end if;
  update public.fmk_vaults set body = p_body, version = version + 1, updated_at = now() where id = p_id returning version into current_version;
  return current_version;
end $$;

create function public.fmk_find_helper(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  return (select jsonb_build_object('id', id, 'name', name, 'public_key', public_key) from public.fmk_profiles where id = p_id);
end $$;

create function public.fmk_grant_helper(p_vault_id uuid, p_helper_id uuid, p_public_key text, p_wrapped_key text, p_recovery_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.fmk_vaults where id = p_vault_id and owner_id = auth.uid()) then raise exception 'Only the vault owner can share access'; end if;
  if auth.uid() = p_helper_id then raise exception 'You already own this vault'; end if;
  if not exists (select 1 from public.fmk_profiles where id = p_helper_id and public_key = p_public_key) then raise exception 'The helper key has changed. Check their code again'; end if;
  if p_recovery_key is null or length(p_recovery_key) = 0 then raise exception 'Recovery key required'; end if;
  insert into public.fmk_members values (p_vault_id, p_helper_id, p_wrapped_key, p_recovery_key);
end $$;

create function public.fmk_change_master(p_old_master jsonb, p_master jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update public.fmk_profiles set master = p_master where id = auth.uid() and master = p_old_master;
  if not found then raise exception 'Account changed on another device. Reconnect and try again'; end if;
end $$;

revoke all on function public.fmk_create_account(text,text,jsonb,jsonb,uuid,jsonb,text), public.fmk_snapshot(), public.fmk_save_vault(uuid,integer,jsonb), public.fmk_find_helper(uuid), public.fmk_grant_helper(uuid,uuid,text,text,text), public.fmk_change_master(jsonb,jsonb) from public, anon;
grant execute on function public.fmk_create_account(text,text,jsonb,jsonb,uuid,jsonb,text), public.fmk_snapshot(), public.fmk_save_vault(uuid,integer,jsonb), public.fmk_find_helper(uuid), public.fmk_grant_helper(uuid,uuid,text,text,text), public.fmk_change_master(jsonb,jsonb) to authenticated;
commit;
