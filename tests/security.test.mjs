import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { aes, random, seal, open, createIdentity, unlockAccount, wrapFor, unwrapFor, makeRecovery, readRecovery, wrapAccount, fingerprint, validateEntries, generatePassword } from '../src/crypto.js';

test('encryption rejects wrong passwords, tampering and cross-vault substitution', async () => {
  const id = crypto.randomUUID();
  const { profile, identity } = await createIdentity('four unrelated words sunset lantern', id, 'Tom');
  assert.equal(JSON.stringify(profile).includes('sunset lantern'), false);
  const again = await unlockAccount('four unrelated words sunset lantern', profile);
  assert.deepEqual(again.rawAccountKey, identity.rawAccountKey);
  await assert.rejects(unlockAccount('definitely the wrong password', profile));
  const key = await aes(random());
  const entry = { id: 'test', service: 'LINE', username: 'mum@example.com', password: '私の秘密 🔒', url: '', notes: '' };
  const box = await seal(key, [entry], 'vault:one');
  assert.equal(JSON.stringify(box).includes('mum@example.com'), false);
  assert.deepEqual(validateEntries(await open(key, box, 'vault:one')), [entry]);
  await assert.rejects(open(key, box, 'vault:two'));
  const changed = { ...box, data: (box.data[0] === 'A' ? 'B' : 'A') + box.data.slice(1) };
  await assert.rejects(open(key, changed, 'vault:one'));
  assert.notEqual((await seal(key, [entry], 'vault:one')).iv, box.iv);
  assert.throws(() => validateEntries([entry, entry]));
  assert.throws(() => validateEntries([{ ...entry, password: null }]));
  assert.equal(generatePassword().length, 22);
  assert.notEqual(generatePassword(), generatePassword());
});

test('real PostgreSQL authorization, family sharing, recovery and optimistic concurrency', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
    await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    const people = {};
    for (const name of ['Tom', 'Mum', 'Stranger']) {
      const id = crypto.randomUUID(); const vaultId = crypto.randomUUID(); const raw = random();
      const created = await createIdentity(`${name} has four unrelated words here`, id, name);
      people[name] = { ...created, id, vaultId, raw };
      await db.query('insert into auth.users values ($1)', [id]);
    }
    const call = async (person, fn, args = [], casts = []) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [person?.id || '']);
      await db.exec(`set role ${person ? 'authenticated' : 'anon'}`);
      try { return (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}${casts[i] ? '::' + casts[i] : ''}`).join(',')}) as result`, args)).rows[0].result; }
      finally { await db.exec('reset role'); }
    };
    for (const person of Object.values(people)) {
      const body = await seal(await aes(person.raw), [], `vault:${person.vaultId}`);
      const wrapped = await wrapFor(person.profile.public_key, person.raw, `vault:${person.vaultId}:${person.id}`);
      await call(person, 'fmk_create_account', [person.profile.name, person.profile.public_key, person.profile.private_key, person.profile.master, person.vaultId, body, wrapped], ['text','text','jsonb','jsonb','uuid','jsonb','text']);
    }
    const { Tom, Mum, Stranger } = people;
    await t.test('each account sees only its own vault; anonymous has no access', async () => {
      for (const person of Object.values(people)) {
        const data = await call(person, 'fmk_snapshot'); assert.equal(data.profile.id, person.id); assert.deepEqual(data.vaults.map(v => v.id), [person.vaultId]);
      }
      await assert.rejects(call(null, 'fmk_snapshot'), /permission denied/);
      await db.exec('set role authenticated');
      await assert.rejects(db.query('select * from public.fmk_vaults'), /permission denied/);
      await assert.rejects(db.query('update public.fmk_profiles set name = $1', ['Bad']), /permission denied/);
      await db.exec('reset role');
    });
    const tomWrap = await wrapFor(Tom.profile.public_key, Mum.raw, `vault:${Mum.vaultId}:${Tom.id}`);
    const recoverWrap = await wrapFor(Tom.profile.public_key, Mum.identity.rawAccountKey, `recovery:${Mum.id}:${Tom.id}`);
    const sharingArgs = [Mum.vaultId, Tom.id, Tom.profile.public_key, tomWrap, recoverWrap];
    const sharingCasts = ['uuid', 'uuid', 'text', 'text', 'text'];
    await t.test('only Mum can authorize Tom; incorrect recipient key is rejected', async () => {
      await assert.rejects(call(Tom, 'fmk_grant_helper', sharingArgs, sharingCasts), /Only the vault owner/);
      await assert.rejects(call(Stranger, 'fmk_grant_helper', sharingArgs, sharingCasts), /Only the vault owner/);
      await assert.rejects(call(Mum, 'fmk_grant_helper', [Mum.vaultId, Tom.id, Stranger.profile.public_key, tomWrap, recoverWrap], sharingCasts), /helper key has changed/);
      await call(Mum, 'fmk_grant_helper', sharingArgs, sharingCasts);
      assert.equal((await call(Mum, 'fmk_snapshot')).helpers[0].id, Tom.id);
      assert.equal((await call(Mum, 'fmk_snapshot')).vaults.length, 1);
      assert.equal((await call(Stranger, 'fmk_snapshot')).vaults.length, 1);
    });
    await t.test('Tom decrypts Mum’s vault; Mum cannot decrypt Tom’s vault', async () => {
      const data = await call(Tom, 'fmk_snapshot'); assert.equal(data.vaults.length, 2);
      const shared = data.vaults.find(v => v.owner_id === Mum.id);
      const raw = await unwrapFor(Tom.identity.privateKey, shared.wrapped_key, `vault:${Mum.vaultId}:${Tom.id}`);
      assert.deepEqual(raw, Mum.raw);
      await assert.rejects(unwrapFor(Mum.identity.privateKey, shared.wrapped_key, `vault:${Mum.vaultId}:${Tom.id}`));
      await assert.rejects(unwrapFor(Tom.identity.privateKey, shared.wrapped_key, `vault:${Tom.vaultId}:${Tom.id}`));
      assert.notEqual(await fingerprint(Mum.profile.public_key), await fingerprint(Tom.profile.public_key));
    });
    await t.test('Tom can edit Mum’s vault; stale device writes cannot overwrite changes', async () => {
      const item = { id: 'google', service: 'Google', username: 'mum@example.com', password: 'Secret password 123', url: '', notes: '' };
      const body = await seal(await aes(Mum.raw), [item], `vault:${Mum.vaultId}`);
      assert.equal(await call(Tom, 'fmk_save_vault', [Mum.vaultId, 1, body], ['uuid', 'integer', 'jsonb']), 2);
      await assert.rejects(call(Mum, 'fmk_save_vault', [Mum.vaultId, 1, body], ['uuid', 'integer', 'jsonb']), /VERSION_CONFLICT/);
      await assert.rejects(call(Stranger, 'fmk_save_vault', [Mum.vaultId, 2, body], ['uuid', 'integer', 'jsonb']), /Access denied/);
      const snapshot = await call(Mum, 'fmk_snapshot');
      assert.deepEqual(await open(await aes(Mum.raw), snapshot.vaults[0].body, `vault:${Mum.vaultId}`), [item]);
      const empty = await seal(await aes(Mum.raw), [], `vault:${Mum.vaultId}`);
      assert.equal(await call(Tom, 'fmk_save_vault', [Mum.vaultId, 2, empty], ['uuid', 'integer', 'jsonb']), 3);
    });
    await t.test('helper recovery restores Mum’s account without revealing Tom’s vault', async () => {
      const recoveredRaw = await unwrapFor(Tom.identity.privateKey, recoverWrap, `recovery:${Mum.id}:${Tom.id}`);
      const kit = await makeRecovery(recoveredRaw, Mum.id);
      assert.equal(JSON.stringify(kit.file).includes(kit.code), false);
      await assert.rejects(readRecovery(kit.file, kit.code, Tom.profile), /different account/);
      await assert.rejects(readRecovery(kit.file, kit.code.slice(1), Mum.profile));
      const restored = await readRecovery(kit.file, kit.code, Mum.profile);
      assert.deepEqual(restored.rawAccountKey, Mum.identity.rawAccountKey);
      const master = await wrapAccount('a completely different master password', restored.rawAccountKey, Mum.id);
      // A helper cannot change the owner's profile using their own session.
      await assert.rejects(call(Tom, 'fmk_change_master', [Mum.profile.master, master], ['jsonb', 'jsonb']), /Account changed/);
      await call(Mum, 'fmk_change_master', [Mum.profile.master, master], ['jsonb', 'jsonb']);
      const fresh = await call(Mum, 'fmk_snapshot');
      await unlockAccount('a completely different master password', fresh.profile);
      await assert.rejects(unlockAccount('Mum has four unrelated words here', fresh.profile));
      assert.equal(fresh.vaults.length, 1);
      assert.deepEqual((await call(Tom, 'fmk_snapshot')).profile.master, Tom.profile.master);
    });
  } finally { await db.close(); }
});
