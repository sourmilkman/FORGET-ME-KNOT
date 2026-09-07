# Security model and review notes

This implementation has not had an independent security audit. Use synthetic data until the live service and actual devices have been verified and the implementation reviewed.

## Cryptography

- AES-256-GCM, fresh random 96-bit IV per encryption, versioned additional authenticated data bound to purpose and account/vault ID.
- Master-password key derivation: PBKDF2-HMAC-SHA-256, 600,000 iterations, random 128-bit salt. This is the Web Crypto-compatible PBKDF2 setting described by [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). It does not make a weak master password safe. A memory-hard KDF may be appropriate in a reviewed future version.
- A random 256-bit account key encrypts a 3072-bit RSA-OAEP-SHA-256 private key. The password-derived key encrypts the account key. RSA is used only to wrap short random keys, with purpose/recipient-bound labels.
- A distinct random 256-bit key encrypts each vault. Each authorized account receives an RSA-wrapped copy.
- A helper also receives an RSA-wrapped copy of the owner's account key, enabling recovery of the existing identity. **Helper access therefore grants the owner's full encryption identity, including any other vaults shared with that owner**, not merely one password list. This is consistent with the full-account assistance model; helpers must be completely trusted.
- Recovery exports encrypt the owner's account key under a separate 256-bit random code. The file and code together are long-lived secrets, not one-time tokens.
- Password reset rewraps the same account key. It does not rotate the identity, revoke old recovery kits, erase previously downloaded data, or invalidate device-unlock wrappers on other devices. Online open apps check for changed master wrapping on refresh and lock, but this is not a revocation boundary.
- Device unlock requires WebAuthn PRF output, user verification and HKDF-SHA-256 derivation of a local AES key. It does not treat an ordinary WebAuthn assertion as a decryption secret. The OS may use a device PIN rather than a fingerprint. [PRF extension documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions).

## Authorization and storage

All direct table access by `anon` and `authenticated` is revoked and RLS is enabled. Only the specific `SECURITY DEFINER` functions are executable by authenticated users. They have empty search paths, qualified object names, and check `auth.uid()` before reads/writes. The profile and account creation operation is atomic.

Vault updates compare a monotonic version inside a row lock. A stale writer fails instead of overwriting newer ciphertext. Master-key updates also use compare-and-swap.

Only exact-ID helper lookups are supported; there is no email enumeration endpoint. The helper code includes a public-key fingerprint, checked by both the client and the grant transaction. Key distribution still trusts the served client and the managed backend. It is not a key-transparency system.

Local snapshots contain ciphertext and metadata. Supabase sessions persist to enable routine master-password-only unlock on an already connected device. Offline access is read only. Browser storage is not a substitute for a backup.

## Web/app boundaries

No analytics, advertising, remote fonts, third-party content, HTML injection or automatic credential filling. React renders user text as text. External links are HTTPS-only and open with `noreferrer`. A restrictive CSP blocks arbitrary scripts and limits connections to Supabase. The service worker precaches the app shell, not API calls.

There is no secure zeroization guarantee in JavaScript. Locking removes decrypted state, editor/recovery dialogs and identity references. Hidden passwords hide after 15 seconds; the vault locks after 5 minutes of inactivity or 60 seconds hidden. Clipboard contents are controlled by the OS; the app does not promise to erase clipboard history or overwrite unrelated clipboard contents.

The app assumes trusted devices, browser, OS, repository/build pipeline, and host. Compromised same-origin JavaScript can read unlocked contents. GitHub Pages is a shared origin with other projects owned by the same GitHub account; localStorage and passkey RP boundaries are origin-wide, not path-isolated. A dedicated origin is preferable before production use. Never publish untrusted active content on the same origin as a password vault.

The current first version lacks cryptographic helper revocation, identity rotation, independent audit, key transparency, breach monitoring, native autofill and guaranteed biometric compatibility. The first four matter especially when evaluating it for production use.

## Tests

`npm test` verifies encryption/decryption, wrong passwords, tamper detection, cross-context rejection, account isolation, anonymous denial, direct-table denial, owner-only grants, recipient-key checks, helper decryption, write conflict detection and helper recovery in an embedded real PostgreSQL instance. Live Supabase Auth, SMTP, real network failure cases and physical authenticators need separate verification.

No private vulnerability information or real credentials should be posted to the public GitHub repository.
