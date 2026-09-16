import { createClient } from '@supabase/supabase-js';
import { aes, random, seal, open, wrapFor, unwrapFor, createIdentity, validateEntries } from './crypto.js';

const CONFIG_KEY = 'fmk-connection-v1';
const CACHE_KEY = 'fmk-encrypted-cache:';
const APP_SCOPE = location.pathname.endsWith('/mum.html') ? 'mum' : 'main';
const LAST_ACCOUNT_KEY = `fmk-last-account:${APP_SCOPE}`;
export function offlineAccount() {
  if (navigator.onLine) return null;
  try {
    const id = localStorage.getItem(LAST_ACCOUNT_KEY);
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY + id) || 'null');
    return cached?.profile?.id === id ? { ...cached, offline: true } : null;
  } catch { return null; }
}
export function getConfig() {
  const env = { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY };
  if (env.url && env.key) return env;
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null; } catch { return null; }
}
export function saveConfig(url, key) {
  const parsed = new URL(url.trim());
  if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) || parsed.pathname !== '/' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Use your HTTPS Supabase project URL.');
  key = key.trim();
  if (key.startsWith('sb_secret_')) throw new Error('Use a public publishable key, never a secret key.');
  if (!key.startsWith('sb_publishable_')) {
    try { if (JSON.parse(atob(key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).role !== 'anon') throw Error(); }
    catch { throw new Error('Use a public publishable key or the legacy anon key.'); }
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: parsed.origin, key }));
}
const config = getConfig();
export const client = config ? createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: `fmk-auth-${APP_SCOPE}` } }) : null;
export async function rpc(name, params = {}) {
  if (!client) throw new Error('Sync is not connected yet.');
  const { data, error } = await client.rpc(name, params);
  if (error) {
    if (error.message.includes('VERSION_CONFLICT')) throw new Error('Another device changed this vault. Your edits are still here. Close this form, refresh the vault, then make your change again.');
    if (error.message.includes('schema cache') || error.code === 'PGRST202') throw new Error('The sync database needs its setup script. Open Connection help.');
    throw new Error(error.message);
  }
  return data;
}
export async function fetchSnapshot(userId, allowCache = false) {
  if (allowCache && !navigator.onLine) {
    const cached = offlineAccount();
    if (cached?.profile?.id === userId) return cached;
    throw new Error('Connect to the internet once to download your encrypted vault.');
  }
  try {
    const snapshot = await rpc('fmk_snapshot');
    if (snapshot.profile && snapshot.profile.id !== userId) throw new Error('Account mismatch. Please sign in again.');
    try { localStorage.setItem(CACHE_KEY + userId, JSON.stringify(snapshot)); localStorage.setItem(LAST_ACCOUNT_KEY, userId); } catch { /* online sync remains usable */ }
    return { ...snapshot, offline: false };
  } catch (error) {
    if (allowCache && !navigator.onLine) {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY + userId) || 'null');
      if (cached?.profile?.id === userId) return { ...cached, offline: true };
    }
    throw error;
  }
}
export function forgetCache(userId) { localStorage.removeItem(CACHE_KEY + userId); if (localStorage.getItem(LAST_ACCOUNT_KEY) === userId) localStorage.removeItem(LAST_ACCOUNT_KEY); }
export async function decryptVaults(snapshot, identity) {
  return Promise.all(snapshot.vaults.map(async vault => {
    const rawKey = await unwrapFor(identity.privateKey, vault.wrapped_key, `vault:${vault.id}:${snapshot.profile.id}`);
    return { ...vault, rawKey, entries: validateEntries(await open(await aes(rawKey), vault.body, `vault:${vault.id}`)) };
  }));
}
export async function createAccount(userId, name, password) {
  const { profile, identity } = await createIdentity(password, userId, name);
  const id = crypto.randomUUID();
  const rawKey = random();
  await rpc('fmk_create_account', {
    p_name: name, p_public_key: profile.public_key, p_private_key: profile.private_key, p_master: profile.master,
    p_vault_id: id, p_body: await seal(await aes(rawKey), [], `vault:${id}`),
    p_wrapped_key: await wrapFor(profile.public_key, rawKey, `vault:${id}:${userId}`),
  });
  return { profile, identity };
}
export async function saveVault(vault, entries) {
  validateEntries(entries);
  const body = await seal(await aes(vault.rawKey), entries, `vault:${vault.id}`);
  const version = await rpc('fmk_save_vault', { p_id: vault.id, p_version: vault.version, p_body: body });
  return { ...vault, body, version, entries, updated_at: new Date().toISOString() };
}
export function sampleVaults() {
  const services = ['Google', 'Facebook', 'Instagram', 'LINE', 'Outlook'];
  const make = (id, owner, mine) => ({
    id, owner_id: mine ? 'demo' : 'mum-demo', owner: { id: mine ? 'demo' : 'mum-demo', name: owner }, version: 1,
    entries: services.map((service, i) => ({ id: `${id}-${i}`, service, username: `${mine ? 'tom' : 'mum'}@example.com`, password: `Example-only-${i + 1}!`, url: ({ Google: 'https://accounts.google.com', Facebook: 'https://www.facebook.com', Instagram: 'https://www.instagram.com', LINE: 'https://line.me', Outlook: 'https://outlook.com' })[service], notes: '', updatedAt: new Date().toISOString() })),
  });
  return [make('sample-tom', 'Tom', true), make('sample-mum', 'Mum', false)];
}
