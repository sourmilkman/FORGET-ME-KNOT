// Sync layer: encrypted files in a private GitHub repository.
// Only ciphertext, public keys and names are ever written. Nothing here can sleep or pause.
import { aes, random, seal, open, wrapFor, unwrapFor, createIdentity, identityFromKey, wrapAccount, validateEntries } from './crypto.js';

export const DEFAULT_REPO = import.meta.env?.VITE_VAULT_REPO || 'sourmilkman/fmk-vaults';
const API = 'https://api.github.com';
const APP_SCOPE = location.pathname.endsWith('/mum.html') ? 'mum' : 'main';
const CONFIG_KEY = `fmk-github-v1:${APP_SCOPE}`;
const CACHE_KEY = 'fmk-encrypted-cache:';
const LAST_ACCOUNT_KEY = `fmk-last-account:${APP_SCOPE}`;
const enc = new TextEncoder();
const dec = new TextDecoder();
// Family members (e.g. Mum) may use a shorter master password; they normally unlock by fingerprint
// and their helper can reset it. Account owners who manage others keep the 14-character minimum.
export const FAMILY_MIN = 5;
const ACCOUNT = /^[a-z0-9][a-z0-9-]{0,31}$/;
const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

// ---------- connection ----------
export function getConfig() {
  try {
    const value = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
    return value && REPO.test(value.repo) && ACCOUNT.test(value.account) && value.token ? value : null;
  } catch { return null; }
}
export function checkConfig({ repo = DEFAULT_REPO, token, account }) {
  repo = String(repo).trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
  token = String(token || '').trim();
  account = String(account || '').trim().toLowerCase();
  if (!REPO.test(repo)) throw new Error('Use the vault repository as owner/name, e.g. sourmilkman/fmk-vaults.');
  if (!ACCOUNT.test(account)) throw new Error('Use a short account name: lowercase letters, numbers or dashes, e.g. tom.');
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) throw new Error('Paste the whole GitHub token. It starts with github_pat_.');
  return { repo, token, account };
}
export function saveConfig(value) {
  const checked = checkConfig(value);
  localStorage.setItem(CONFIG_KEY, JSON.stringify(checked));
  return checked;
}
export function clearConfig() { localStorage.removeItem(CONFIG_KEY); }

// Setup links carry the connection in the URL fragment (#setup=…), which browsers never send to a server.
export function makeSetupLink(baseUrl, value) {
  const checked = checkConfig(value);
  const packed = btoa(String.fromCharCode(...enc.encode(JSON.stringify(checked)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return `${baseUrl}#setup=${packed}`;
}
export function readSetupLink(hash) {
  const match = /^#setup=([A-Za-z0-9_-]+)$/.exec(hash || '');
  if (!match) return null;
  const text = dec.decode(Uint8Array.from(atob(match[1].replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)));
  return checkConfig(JSON.parse(text));
}
// Call once at start-up: stores a setup link's connection, then removes it from the address bar and history.
export function consumeSetupLink() {
  if (!location.hash.startsWith('#setup=')) return false;
  try { saveConfig(readSetupLink(location.hash)); return true; }
  finally { history.replaceState(null, '', location.pathname + location.search); }
}

// ---------- GitHub contents API ----------
const b64text = text => { const bytes = enc.encode(text); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const textb64 = value => dec.decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)));
function friendly(status, body) {
  const message = body?.message || '';
  if (status === 401) return 'This device’s GitHub token has expired or been revoked. Ask Tom for a new setup link.';
  if (status === 403 && /rate limit/i.test(message)) return 'GitHub is busy for a few minutes (rate limit). Please try again shortly.';
  if (status === 403) return 'This device’s token is not allowed to make that change. Only Tom’s devices can edit.';
  if (status === 404) return 'The vault repository could not be found. Check the repository name and that the token can access it.';
  return message || `GitHub error ${status}.`;
}
class Conflict extends Error { constructor() { super('Another device changed this vault. Your edits are still here. Close this form, refresh the vault, then make your change again.'); this.conflict = true; } }

async function gh(config, method, path, body) {
  let response;
  try {
    response = await fetch(`${API}/repos/${config.repo}/contents/${path}`, {
      method, cache: 'no-store',
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error('Could not reach GitHub. Check the internet connection.'); }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, data };
}
async function readJson(config, path) {
  const { status, data } = await gh(config, 'GET', path);
  if (status === 404) return null;
  if (status !== 200) throw new Error(friendly(status, data));
  if (Array.isArray(data)) throw new Error(`${path} is a folder, not a file.`);
  let text = data.encoding === 'base64' && data.content ? textb64(data.content) : null;
  if (text === null) { // files over 1 MB come back without inline content
    const blob = await fetch(`${API}/repos/${config.repo}/git/blobs/${data.sha}`, { cache: 'no-store', headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json' } });
    if (!blob.ok) throw new Error(friendly(blob.status, await blob.json().catch(() => null)));
    text = textb64((await blob.json()).content);
  }
  return { value: JSON.parse(text), sha: data.sha };
}
async function listFolder(config, folder) {
  const { status, data } = await gh(config, 'GET', folder);
  if (status === 404) return [];
  if (status !== 200) throw new Error(friendly(status, data));
  return data.filter(item => item.type === 'file' && item.name.endsWith('.json'));
}
// sha = the version we last saw; omit to create a new file. GitHub rejects the write if the file has changed since.
async function writeJson(config, path, value, sha, message) {
  const { status, data } = await gh(config, 'PUT', path, { message, content: b64text(JSON.stringify(value, null, 1)), ...(sha ? { sha } : {}) });
  if (status === 409 || (status === 422 && /sha/i.test(data?.message || ''))) throw new Conflict();
  if (status !== 200 && status !== 201) throw new Error(friendly(status, data));
  return data.content.sha;
}
const profilePath = id => `profiles/${id}.json`;
const vaultPath = id => `vaults/${id}.json`;

// ---------- snapshots ----------
export function offlineAccount() {
  if (navigator.onLine) return null;
  try {
    const id = localStorage.getItem(LAST_ACCOUNT_KEY);
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY + id) || 'null');
    return cached?.profile?.id === id ? { ...cached, offline: true } : null;
  } catch { return null; }
}
export function forgetCache(userId) { localStorage.removeItem(CACHE_KEY + userId); if (localStorage.getItem(LAST_ACCOUNT_KEY) === userId) localStorage.removeItem(LAST_ACCOUNT_KEY); }

async function buildSnapshot(config) {
  const me = config.account;
  const found = await readJson(config, profilePath(me));
  if (!found) { // a missing profile only means "new account" if this token can really see the repository
    let check;
    try { check = await fetch(`${API}/repos/${config.repo}`, { cache: 'no-store', headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json' } }); }
    catch { throw new Error('Could not reach GitHub. Check the internet connection.'); }
    if (!check.ok) throw new Error(friendly(check.status, await check.json().catch(() => null)));
    return { profile: null, vaults: [], helpers: [] };
  }
  const profile = { ...found.value, id: me, version: found.sha };
  const files = await listFolder(config, 'vaults');
  const vaults = [];
  const helpers = [];
  for (const file of files) {
    const item = await readJson(config, file.path);
    if (!item) continue;
    const vault = item.value;
    const member = vault.members?.[me];
    if (!member) continue;
    vaults.push({ id: vault.id, owner_id: vault.owner_id, owner: vault.owner, body: vault.body, members: vault.members, path: file.path, version: item.sha, updated_at: vault.updated_at, wrapped_key: member.wrapped_key, recovery_key: member.recovery_key || null });
    if (vault.owner_id === me) for (const [id, m] of Object.entries(vault.members)) if (id !== me) helpers.push({ id, name: m.name });
  }
  vaults.sort((a, b) => (b.owner_id === me) - (a.owner_id === me) || a.owner.name.localeCompare(b.owner.name));
  return { profile, vaults, helpers };
}
export async function fetchSnapshot(userId, allowCache = false) {
  const config = getConfig();
  if (allowCache && !navigator.onLine) {
    const cached = offlineAccount();
    if (cached?.profile?.id === userId) return cached;
    throw new Error('Connect to the internet once to download your encrypted vault.');
  }
  if (!config) throw new Error('This device is not connected yet.');
  try {
    const snapshot = await buildSnapshot(config);
    if (snapshot.profile && snapshot.profile.id !== userId) throw new Error('Account mismatch. Please connect again.');
    if (snapshot.profile) { try { localStorage.setItem(CACHE_KEY + userId, JSON.stringify(snapshot)); localStorage.setItem(LAST_ACCOUNT_KEY, userId); } catch { /* online sync remains usable */ } }
    return { ...snapshot, offline: false };
  } catch (error) {
    if (allowCache) {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY + userId) || 'null');
      if (cached?.profile?.id === userId && !navigator.onLine) return { ...cached, offline: true };
    }
    throw error;
  }
}
export async function decryptVaults(snapshot, identity) {
  return Promise.all(snapshot.vaults.map(async vault => {
    const rawKey = await unwrapFor(identity.privateKey, vault.wrapped_key, `vault:${vault.id}:${snapshot.profile.id}`);
    return { ...vault, rawKey, entries: validateEntries(await open(await aes(rawKey), vault.body, `vault:${vault.id}`)) };
  }));
}

// ---------- writes (need a token with write access) ----------
function publicProfile(profile) { const { id, name, public_key, private_key, master } = profile; return { format: 'fmk-profile-v1', id, name, public_key, private_key, master }; }
async function newAccountFiles(config, id, name, password, helper) {
  if (!ACCOUNT.test(id)) throw new Error('Use a short account name: lowercase letters, numbers or dashes.');
  if (await readJson(config, profilePath(id))) throw new Error(`An account called “${id}” already exists.`);
  const { profile, identity } = await createIdentity(password, id, name, helper ? FAMILY_MIN : 14);
  const vaultId = crypto.randomUUID();
  const rawKey = random();
  const members = { [id]: { name, wrapped_key: await wrapFor(profile.public_key, rawKey, `vault:${vaultId}:${id}`) } };
  if (helper) members[helper.profile.id] = {
    name: helper.profile.name,
    wrapped_key: await wrapFor(helper.profile.public_key, rawKey, `vault:${vaultId}:${helper.profile.id}`),
    recovery_key: await wrapFor(helper.profile.public_key, identity.rawAccountKey, `recovery:${id}:${helper.profile.id}`),
  };
  const vault = { format: 'fmk-vault-v1', id: vaultId, owner_id: id, owner: { id, name }, body: await seal(await aes(rawKey), [], `vault:${vaultId}`), members, updated_at: new Date().toISOString() };
  rawKey.fill(0);
  // A half-finished earlier attempt may have left a vault without a profile; replace it.
  const leftover = await readJson(config, vaultPath(id));
  await writeJson(config, vaultPath(id), vault, leftover?.sha, `Create vault for ${id}`);
  await writeJson(config, profilePath(id), publicProfile(profile), undefined, `Create account ${id}`);
  return { profile, identity };
}
export async function createAccount(userId, name, password) {
  const config = getConfig();
  if (config.account !== userId) throw new Error('Account mismatch. Please connect again.');
  return newAccountFiles(config, userId, name, password, null);
}
// A helper (Tom) creates someone else's account (Mum) with full access and recovery for himself.
export async function createFamilyAccount(helper, id, name, password) {
  const config = getConfig();
  if (id === helper.profile.id) throw new Error('Choose a different account name from your own.');
  const made = await newAccountFiles(config, id, name, password, helper);
  return made.profile;
}
export async function saveVault(vault, entries) {
  validateEntries(entries);
  const config = getConfig();
  const body = await seal(await aes(vault.rawKey), entries, `vault:${vault.id}`);
  const updated_at = new Date().toISOString();
  const file = { format: 'fmk-vault-v1', id: vault.id, owner_id: vault.owner_id, owner: vault.owner, body, members: vault.members, updated_at };
  const version = await writeJson(config, vault.path, file, vault.version, `Update ${vault.owner_id} vault`);
  return { ...vault, body, version, entries, updated_at };
}
// Rewrap the same account key under a new master password (compare-and-swap on the profile file).
export async function changeMaster(profile, rawAccountKey, password, minLength = 14) {
  const config = getConfig();
  const master = await wrapAccount(password, rawAccountKey, profile.id, minLength);
  const version = await writeJson(config, profilePath(profile.id), publicProfile({ ...profile, master }), profile.version, `Change master password for ${profile.id}`);
  return { ...profile, master, version };
}
// Helper resets a family member's forgotten master password using the recovery key they hold.
export async function resetFamilyMaster(vault, helperProfile, helperIdentity, password) {
  if (!vault.recovery_key) throw new Error('You do not hold recovery for this vault.');
  const config = getConfig();
  const found = await readJson(config, profilePath(vault.owner_id));
  if (!found) throw new Error('That account could not be found.');
  const target = { ...found.value, id: vault.owner_id, version: found.sha };
  const raw = await unwrapFor(helperIdentity.privateKey, vault.recovery_key, `recovery:${vault.owner_id}:${helperProfile.id}`);
  try { await identityFromKey(raw, target); return await changeMaster(target, raw, password, FAMILY_MIN); }
  finally { raw.fill(0); }
}

export function sampleVaults() {
  const services = ['Google', 'Facebook', 'Instagram', 'LINE', 'Outlook'];
  const make = (id, owner, mine) => ({
    id, owner_id: mine ? 'demo' : 'mum-demo', owner: { id: mine ? 'demo' : 'mum-demo', name: owner }, version: 1,
    entries: services.map((service, i) => ({ id: `${id}-${i}`, service, username: `${mine ? 'tom' : 'mum'}@example.com`, password: `Example-only-${i + 1}!`, url: ({ Google: 'https://accounts.google.com', Facebook: 'https://www.facebook.com', Instagram: 'https://www.instagram.com', LINE: 'https://line.me', Outlook: 'https://outlook.com' })[service], notes: '', updatedAt: new Date().toISOString() })),
  });
  return [make('sample-tom', 'Tom', true), make('sample-mum', 'Mum', false)];
}
