import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity, random } from '../src/crypto.js';
import { enableDeviceUnlock, unlockWithDevice, hasDeviceUnlock, removeDeviceUnlock } from '../src/biometric.js';

test('device unlock stores only a PRF-encrypted key and rejects unsupported authenticators', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const { profile, identity } = await createIdentity('four words plus another good word', crypto.randomUUID(), 'Test');
  let output = random();
  let supported = false;
  Object.defineProperty(globalThis.navigator, 'credentials', { configurable: true, value: {
    create: async options => { assert.equal(options.publicKey.authenticatorSelection.userVerification, 'required'); return { rawId: random(), getClientExtensionResults: () => ({ prf: { enabled: supported } }) }; },
    get: async options => { assert.equal(options.publicKey.userVerification, 'required'); return { getClientExtensionResults: () => ({ prf: { results: { first: output } } }) }; },
  } });
  await assert.rejects(enableDeviceUnlock(profile, identity), /not supported/);
  assert.equal(hasDeviceUnlock(profile.id), false);
  supported = true;
  await enableDeviceUnlock(profile, identity);
  assert.equal(hasDeviceUnlock(profile.id), true);
  const unlocked = await unlockWithDevice(profile);
  assert.deepEqual(unlocked.rawAccountKey, identity.rawAccountKey);
  output = random();
  await assert.rejects(unlockWithDevice(profile));
  removeDeviceUnlock(profile.id);
  assert.equal(hasDeviceUnlock(profile.id), false);
});
