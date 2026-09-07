import { aes, b64, unb64, random, seal, open, identityFromKey } from './crypto.js';
const prefix = 'fmk-device-unlock:';
export const hasDeviceUnlock = id => !!localStorage.getItem(prefix + id);
export const removeDeviceUnlock = id => localStorage.removeItem(prefix + id);
export const deviceUnlockAvailable = () => !!window.PublicKeyCredential && !!navigator.credentials && window.isSecureContext;
async function prfKey(result) {
  const bytes = result.getClientExtensionResults()?.prf?.results?.first;
  if (!bytes) throw new Error('This device cannot securely unlock the vault with a passkey. Please use your master password.');
  const material = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveBits']);
  const raw = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('fmk-device-unlock-v1') }, material, 256);
  return aes(raw);
}
export async function enableDeviceUnlock(profile, identity) {
  const salt = random();
  const credential = await navigator.credentials.create({ publicKey: {
    challenge: random(), rp: { name: 'Forget Me Knot' },
    user: { id: new TextEncoder().encode(profile.id), name: profile.name, displayName: profile.name },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
    timeout: 60000, attestation: 'none', extensions: { prf: { eval: { first: salt } } },
  } });
  if (!credential?.getClientExtensionResults()?.prf?.enabled) throw new Error('Secure device unlock is not supported by this browser or passkey provider. Your master password still works.');
  const assertion = await navigator.credentials.get({ publicKey: { challenge: random(), allowCredentials: [{ id: credential.rawId, type: 'public-key' }], userVerification: 'required', extensions: { prf: { eval: { first: salt } } } } });
  const box = await seal(await prfKey(assertion), b64(identity.rawAccountKey), `device:${profile.id}`);
  localStorage.setItem(prefix + profile.id, JSON.stringify({ id: b64(credential.rawId), salt: b64(salt), box }));
}
export async function unlockWithDevice(profile) {
  const saved = JSON.parse(localStorage.getItem(prefix + profile.id) || 'null');
  if (!saved) throw new Error('Device unlock is not set up here.');
  const assertion = await navigator.credentials.get({ publicKey: { challenge: random(), allowCredentials: [{ id: unb64(saved.id), type: 'public-key' }], userVerification: 'required', extensions: { prf: { eval: { first: unb64(saved.salt) } } }, timeout: 60000 } });
  const raw = unb64(await open(await prfKey(assertion), saved.box, `device:${profile.id}`));
  return identityFromKey(raw, profile);
}
