import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { aes, random, seal, open, createIdentity, unlockAccount, unwrapFor, validateEntries, generatePassword } from '../src/crypto.js';

// ---- browser globals the sync layer expects ----
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.location = { pathname: '/FORGET-ME-KNOT/', search: '', hash: '' };
globalThis.history = { replaceState: (_s, _t, url) => { globalThis.location.hash = ''; globalThis.lastReplaced = url; } };
Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, get: () => online });
let online = true;

// ---- in-memory stand-in for the GitHub contents API ----
const TOM = 'github_pat_' + 'T'.repeat(40);
const MUM = 'github_pat_' + 'M'.repeat(40);
const STRANGER = 'github_pat_' + 'S'.repeat(40);
const files = new Map();
const commits = [];
let counter = 0;
const reply = (status, body) => ({ status, ok: status < 300, json: async () => body });
globalThis.fetch = async (url, { method = 'GET', headers = {}, body } = {}) => {
  const token = headers.Authorization?.replace('Bearer ', '');
  const match = /^https:\/\/api\.github\.com\/repos\/sourmilkman\/fmk-vaults\/contents\/(.+)$/.exec(url);
  if (![TOM, MUM].includes(token)) return reply(token === STRANGER ? 404 : 401, { message: 'Bad credentials' });
  if (url === 'https://api.github.com/repos/sourmilkman/fmk-vaults') return reply(200, { private: true });
  if (!match) return reply(404, { message: 'Not Found' });
  const path = match[1];
  if (method === 'GET') {
    if (files.has(path)) return reply(200, { type: 'file', encoding: 'base64', content: files.get(path).content.replace(/(.{60})/g, '$1\n'), sha: files.get(path).sha });
    const children = [...files.keys()].filter(p => p.startsWith(path + '/')).map(p => ({ type: 'file', name: p.split('/').pop(), path: p, sha: files.get(p).sha }));
    return children.length ? reply(200, children) : reply(404, { message: 'Not Found' });
  }
  if (method === 'PUT') {
    if (token !== TOM) return reply(403, { message: 'Resource not accessible by personal access token' });
    const { content, sha, message } = JSON.parse(body);
    const current = files.get(path);
    if (current && !sha) return reply(422, { message: 'Invalid request. "sha" wasn\'t supplied.' });
    if (current && sha !== current.sha) return reply(409, { message: `${path} does not match ${sha}` });
    if (!current && sha) return reply(422, { message: 'sha does not match' });
    const next = { content, sha: `sha${++counter}` };
    files.set(path, next); commits.push(message);
    return reply(current ? 200 : 201, { content: { sha: next.sha } });
  }
  return reply(405, { message: 'Method not allowed' });
};

const data = await import('../src/data.js');
const connect = (account, token) => data.saveConfig({ repo: 'sourmilkman/fmk-vaults', account, token });
const plain = path => JSON.parse(Buffer.from(files.get(path).content, 'base64').toString('utf8'));

test('Mum satellite exposes no vault editing, sharing or account creation', async () => {
  const source = await readFile(new URL('../src/MumApp.jsx', import.meta.url), 'utf8');
  for (const forbidden of ['saveVault', 'createAccount', 'createFamilyAccount', 'changeMaster', 'resetFamilyMaster', 'makeSetupLink', 'Delete login', 'Edit login']) {
    assert.equal(source.includes(forbidden), false, `Mum satellite must not contain ${forbidden}`);
  }
  for (const required of ['Copy username', 'Copy password', 'Open {entry.service}', 'setInterval(refresh, 30000)', 'snapshot.profile.id !== config.account']) {
    assert.equal(source.includes(required), true, `Mum satellite should contain ${required}`);
  }
});

test('Tom and Mum apps keep separate stored connections', async () => {
  const source = await readFile(new URL('../src/data.js', import.meta.url), 'utf8');
  assert.equal(source.includes("location.pathname.endsWith('/mum.html') ? 'mum' : 'main'"), true);
  assert.equal(source.includes('`fmk-github-v1:${APP_SCOPE}`'), true);
});

test('no Supabase code and no GitHub tokens are committed to the source', async () => {
  const roots = ['src', 'public', '.github/workflows'];
  const paths = ['index.html', 'mum.html', 'package.json', 'vite.config.js', '.env.example'];
  for (const root of roots) for (const name of await readdir(new URL(`../${root}`, import.meta.url), { recursive: true })) paths.push(`${root}/${name}`);
  for (const path of paths) {
    if (/\.(png|ico)$/.test(path)) continue;
    let text; try { text = await readFile(new URL(`../${path}`, import.meta.url), 'utf8'); } catch { continue; }
    assert.equal(/(github_pat_|ghp_)[A-Za-z0-9_]{20,}/.test(text), false, `${path} looks like it contains a GitHub token`);
    assert.equal(/supabase/i.test(text), false, `${path} still mentions Supabase`);
  }
});

test('encryption rejects wrong passwords, tampering and cross-vault substitution', async () => {
  const { profile, identity } = await createIdentity('four unrelated words sunset lantern', 'tom', 'Tom');
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

test('connection checks and setup links', () => {
  assert.throws(() => data.checkConfig({ repo: 'sourmilkman/fmk-vaults', account: 'Tom!', token: TOM }), /account name/);
  assert.throws(() => data.checkConfig({ repo: 'nope', account: 'tom', token: TOM }), /owner\/name/);
  assert.throws(() => data.checkConfig({ repo: 'a/b', account: 'tom', token: 'sb_publishable_x' }), /github_pat_/);
  const link = data.makeSetupLink('https://sourmilkman.github.io/FORGET-ME-KNOT/mum.html', { account: 'mum', token: MUM });
  assert.equal(link.includes('?'), false, 'token must travel in the fragment, never the query string');
  assert.deepEqual(data.readSetupLink(new URL(link).hash), { repo: 'sourmilkman/fmk-vaults', account: 'mum', token: MUM });
  location.hash = new URL(link).hash;
  assert.equal(data.consumeSetupLink(), true);
  assert.equal(location.hash, '', 'setup link is removed from the address bar');
  assert.equal(data.getConfig().account, 'mum');
  data.clearConfig();
  assert.equal(data.getConfig(), null);
});

test('GitHub storage: accounts, family access, read-only devices, conflicts and recovery', async t => {
  const tomPw = 'Tom has four unrelated words here';
  const mumPw = 'Mum has four unrelated words here';
  connect('tom', TOM);
  assert.equal((await data.fetchSnapshot('tom')).profile, null, 'new account starts without a profile');
  const tom = await data.createAccount('tom', 'Tom', tomPw);
  await data.createFamilyAccount(tom, 'mum', 'Mum', mumPw);
  await assert.rejects(data.createFamilyAccount(tom, 'mum', 'Mum', mumPw), /already exists/);
  await assert.rejects(data.createFamilyAccount(tom, 'tom', 'Tom', mumPw), /different account name/);

  await t.test('only ciphertext, public keys and names are stored', () => {
    const everything = [...files.values()].map(f => Buffer.from(f.content, 'base64').toString('utf8')).join('\n');
    for (const secret of [tomPw, mumPw]) assert.equal(everything.includes(secret), false);
    assert.deepEqual([...files.keys()].sort(), ['profiles/mum.json', 'profiles/tom.json', 'vaults/mum.json', 'vaults/tom.json']);
    assert.deepEqual(Object.keys(plain('vaults/tom.json').members), ['tom']);
    assert.deepEqual(Object.keys(plain('vaults/mum.json').members).sort(), ['mum', 'tom']);
  });

  let tomVaults;
  await t.test('Tom sees both vaults; Mum sees only hers and cannot decrypt Tom’s', async () => {
    const snap = await data.fetchSnapshot('tom');
    tomVaults = await data.decryptVaults(snap, await unlockAccount(tomPw, snap.profile));
    assert.deepEqual(tomVaults.map(v => v.owner_id), ['tom', 'mum']);
    connect('mum', MUM);
    const mumSnap = await data.fetchSnapshot('mum');
    assert.deepEqual(mumSnap.vaults.map(v => v.owner_id), ['mum']);
    assert.deepEqual(mumSnap.helpers, [{ id: 'tom', name: 'Tom' }]);
    const mumId = await unlockAccount(mumPw, mumSnap.profile);
    const tomFile = plain('vaults/tom.json');
    await assert.rejects(unwrapFor(mumId.privateKey, tomFile.members.tom.wrapped_key, `vault:${tomFile.id}:tom`));
    await assert.rejects(unlockAccount(tomPw, mumSnap.profile));
  });

  await t.test('Tom edits Mum’s vault and Mum sees it; Mum’s read-only token cannot write', async () => {
    connect('tom', TOM);
    const mumVault = tomVaults.find(v => v.owner_id === 'mum');
    const item = { id: 'google', service: 'Google', username: 'mum@example.com', password: 'Secret password 123', url: '', notes: '' };
    const saved = await data.saveVault(mumVault, [item]);
    connect('mum', MUM);
    const mumSnap = await data.fetchSnapshot('mum');
    const [mine] = await data.decryptVaults(mumSnap, await unlockAccount(mumPw, mumSnap.profile));
    assert.deepEqual(mine.entries, [item]);
    await assert.rejects(data.saveVault(mine, []), /not allowed to make that change/);
    connect('tom', TOM);
    // a second Tom device still holding the old version is refused
    await assert.rejects(data.saveVault(mumVault, []), err => err.conflict === true);
    await data.saveVault(saved, [item, { ...item, id: 'line', service: 'LINE' }]);
  });

  await t.test('Tom resets Mum’s forgotten master password; her identity is unchanged', async () => {
    const snap = await data.fetchSnapshot('tom');
    const tomId = await unlockAccount(tomPw, snap.profile);
    const mumVault = snap.vaults.find(v => v.owner_id === 'mum');
    const before = (await data.fetchSnapshot('tom')).profile;
    await data.resetFamilyMaster(mumVault, snap.profile, tomId, 'a completely different master password');
    connect('mum', MUM);
    const fresh = await data.fetchSnapshot('mum');
    const restored = await unlockAccount('a completely different master password', fresh.profile);
    await assert.rejects(unlockAccount(mumPw, fresh.profile));
    const [mine] = await data.decryptVaults(fresh, restored);
    assert.equal(mine.entries.length, 2);
    connect('tom', TOM);
    assert.deepEqual((await data.fetchSnapshot('tom')).profile.master, before.master, 'Tom’s own profile is untouched');
    // Mum's own vault has no recovery entry for her, so she can never reset Tom.
    assert.equal(plain('vaults/tom.json').members.mum, undefined);
  });

  await t.test('expired, revoked or wrong tokens fail clearly; offline uses the encrypted cache', async () => {
    connect('tom', 'github_pat_' + 'X'.repeat(40));
    await assert.rejects(data.fetchSnapshot('tom'), /expired or been revoked/);
    connect('tom', STRANGER);
    await assert.rejects(data.fetchSnapshot('tom'), /could not be found/);
    connect('tom', TOM);
    await data.fetchSnapshot('tom');
    online = false;
    const cached = await data.fetchSnapshot('tom', true);
    assert.equal(cached.offline, true);
    assert.equal(JSON.stringify(cached).includes('Secret password 123'), false, 'cache holds ciphertext only');
    online = true;
  });

  assert.equal(commits.length >= 6, true, 'every write is a commit, so history is kept');
});
