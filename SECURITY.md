# Security model and review notes

This implementation has not had an independent security audit. Use synthetic data until the live service and actual devices have been verified and the implementation reviewed.

## Cryptography

- AES-256-GCM, fresh random 96-bit IV per encryption, versioned additional authenticated data bound to purpose and account/vault ID.
- Master-password key derivation: PBKDF2-HMAC-SHA-256, 600,000 iterations, random 128-bit salt. This is the Web Crypto-compatible PBKDF2 setting described by [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). It does not make a weak master password safe. A memory-hard KDF may be appropriate in a reviewed future version.
- A random 256-bit account key encrypts a 3072-bit RSA-OAEP-SHA-256 private key. The password-derived key encrypts the account key. RSA is used only to wrap short random keys, with purpose/recipient-bound labels.
- A distinct random 256-bit key encrypts each vault. Each authorized account receives an RSA-wrapped copy.
- A helper also receives an RSA-wrapped copy of the owner's account key, enabling recovery of the existing identity (Tom's **Reset password** rewraps Mum's account key under a new master password). **Helper access therefore grants the owner's full encryption identity, including any other vaults shared with that owner**, not merely one password list. This is consistent with the full-account assistance model; helpers must be completely trusted.
- Password reset rewraps the same account key. It does not rotate the identity, erase previously downloaded data, or invalidate device-unlock wrappers on other devices. Online open apps check for changed master wrapping on refresh and lock, but this is not a revocation boundary.
- Device unlock requires WebAuthn PRF output, user verification and HKDF-SHA-256 derivation of a local AES key. It does not treat an ordinary WebAuthn assertion as a decryption secret. The OS may use a device PIN rather than a fingerprint. [PRF extension documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions).

## Authorization and storage

Storage is a private GitHub repository holding JSON files: `profiles/<account>.json` and `vaults/<account>.json`. They contain names, public keys, encrypted private keys, master-password wrappings, wrapped vault keys and vault ciphertext — never plaintext logins or master passwords.

Authorization is the GitHub token on each device, not server-side code:

- Tom's tokens: fine-grained, `fmk-vaults` only, Contents read/write. Anyone holding one can **change or delete** files (an integrity/availability risk), but still cannot decrypt without a master password. Git history allows restoring earlier versions.
- Mum's token: fine-grained, `fmk-vaults` only, Contents **read-only**. A leak exposes ciphertext and names only.
- Because confidentiality comes from the cryptography, Mum's token can technically fetch Tom's encrypted files; she cannot decrypt them, as her account holds no wrapped key for Tom's vault.
- Tokens live in each browser's localStorage (per app: Tom's and Mum's apps use separate keys). Same-origin script compromise could read them. Revoke a lost device's token on GitHub.
- Setup links carry a token in the URL fragment (`#setup=…`), which is not sent to servers, and the app removes it from the address bar and history immediately. Messaging apps may still keep a copy; send the master password separately.

Vault and profile writes include the file's last-seen blob SHA. GitHub rejects the write if the file has changed, so a stale device fails instead of overwriting newer ciphertext.

Key distribution trusts the repository contents: someone with a write token could replace a public key. Tom's tokens are therefore as sensitive as admin access to the vaults. There is no key-transparency system.

Local snapshots contain ciphertext and metadata. Offline access is read only. Browser storage is not a substitute for a backup.

## Web/app boundaries

No analytics, advertising, remote fonts, third-party content, HTML injection or automatic credential filling. React renders user text as text. External links are HTTPS-only and open with `noreferrer`. A restrictive CSP blocks arbitrary scripts and limits connections to `api.github.com`. The service worker precaches the app shell, not API calls.

There is no secure zeroization guarantee in JavaScript. Locking removes decrypted state, editor/recovery dialogs and identity references. Hidden passwords hide after 15 seconds; the vault locks after 5 minutes of inactivity or 60 seconds hidden. Clipboard contents are controlled by the OS; the app does not promise to erase clipboard history or overwrite unrelated clipboard contents.

The app assumes trusted devices, browser, OS, repository/build pipeline, and host. Compromised same-origin JavaScript can read unlocked contents. GitHub Pages is a shared origin with other projects owned by the same GitHub account; localStorage and passkey RP boundaries are origin-wide, not path-isolated. A dedicated origin is preferable before production use. Never publish untrusted active content on the same origin as a password vault.

The current first version lacks cryptographic helper revocation, identity rotation, independent audit, key transparency, breach monitoring, native autofill and guaranteed biometric compatibility. The first four matter especially when evaluating it for production use.

## Tests

`npm test` verifies encryption/decryption, wrong passwords, tamper detection, cross-context rejection, setup-link handling, account isolation, read-only token write denial, stale-write conflicts, helper access, helper password reset, expired/revoked tokens, ciphertext-only offline cache, and that no GitHub token or Supabase reference is committed. The GitHub API is simulated in memory; live checks on the real repository and devices are still required.

No private vulnerability information or real credentials should be posted to the public GitHub repository.
