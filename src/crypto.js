// All secrets are encrypted on the device. No master password is sent to the server.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const ITERATIONS = 600_000;
export const random = (length = 32) => crypto.getRandomValues(new Uint8Array(length));
export const b64 = bytes => btoa(Array.from(new Uint8Array(bytes), b => String.fromCharCode(b)).join(''));
export const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export async function aes(raw) { return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function seal(key, value, context) {
  const iv = random(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`fmk:v1:${context}`) }, key, enc.encode(JSON.stringify(value)));
  return { v: 1, iv: b64(iv), data: b64(ciphertext) };
}
export async function open(key, box, context) {
  if (box?.v !== 1 || typeof box.data !== 'string' || box.data.length > 8_000_000 || unb64(box.iv).length !== 12) throw new Error('This encrypted file is not supported.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: enc.encode(`fmk:v1:${context}`) }, key, unb64(box.data));
  return JSON.parse(dec.decode(plain));
}
async function passwordKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(salt), iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function wrapAccount(password, rawAccountKey, userId) {
  if (password.length < 14) throw new Error('Use at least 14 characters. Four or more unrelated words are easier to remember.');
  const salt = b64(random(16));
  return { salt, iterations: ITERATIONS, wrapped: await seal(await passwordKey(password, salt), b64(rawAccountKey), `master:${userId}`) };
}
export async function unlockAccount(password, profile) {
  if (profile.master.iterations !== ITERATIONS) throw new Error('Unsupported key settings.');
  const raw = unb64(await open(await passwordKey(password, profile.master.salt), profile.master.wrapped, `master:${profile.id}`));
  return identityFromKey(raw, profile);
}
export async function identityFromKey(rawAccountKey, profile) {
  const accountKey = await aes(rawAccountKey);
  const pkcs8 = await open(accountKey, profile.private_key, `identity:${profile.id}`);
  const privateKey = await crypto.subtle.importKey('pkcs8', unb64(pkcs8), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  return { rawAccountKey, accountKey, privateKey };
}
export async function createIdentity(password, id, name) {
  const rawAccountKey = random();
  const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const profile = {
    id, name,
    public_key: b64(await crypto.subtle.exportKey('spki', pair.publicKey)),
    private_key: await seal(await aes(rawAccountKey), b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey)), `identity:${id}`),
    master: await wrapAccount(password, rawAccountKey, id),
  };
  return { profile, identity: await identityFromKey(rawAccountKey, profile) };
}
export async function wrapFor(publicKey, raw, context) {
  const key = await crypto.subtle.importKey('spki', unb64(publicKey), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  return b64(await crypto.subtle.encrypt({ name: 'RSA-OAEP', label: enc.encode(`fmk:v1:${context}`) }, key, raw));
}
export async function unwrapFor(privateKey, wrapped, context) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP', label: enc.encode(`fmk:v1:${context}`) }, privateKey, unb64(wrapped)));
}
export async function fingerprint(publicKey) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', unb64(publicKey))).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('').match(/.{4}/g).join(' ');
}
export function generatePassword(length = 22) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_';
  let result = '';
  const ceiling = 256 - (256 % alphabet.length);
  while (result.length < length) for (const byte of random(32)) {
    if (byte < ceiling && result.length < length) result += alphabet[byte % alphabet.length];
  }
  return result;
}
export async function makeRecovery(rawAccountKey, ownerId) {
  const code = b64(random()).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const box = await seal(await aes(unb64(code.replaceAll('-', '+').replaceAll('_', '/'))), b64(rawAccountKey), `recovery:${ownerId}`);
  return { code, file: { format: 'fmk-recovery-v1', ownerId, box } };
}
export async function readRecovery(file, code, profile) {
  if (file.format !== 'fmk-recovery-v1' || file.ownerId !== profile.id) throw new Error('This recovery file belongs to a different account.');
  const raw = unb64(await open(await aes(unb64(code.trim().replaceAll('-', '+').replaceAll('_', '/'))), file.box, `recovery:${profile.id}`));
  return identityFromKey(raw, profile);
}
export function validateEntries(value) {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('The vault data is not supported.');
  const ids = new Set();
  for (const item of value) {
    if (!item || ['id', 'service', 'username', 'password', 'url', 'notes'].some(k => typeof item[k] !== 'string' || item[k].length > 20000) || !item.service.trim() || ids.has(item.id)) throw new Error('The vault contains an invalid login.');
    ids.add(item.id);
  }
  return value;
}
