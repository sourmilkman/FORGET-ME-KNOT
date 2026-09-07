# Forget Me Knot

A calm, accessible password-vault PWA for Windows and Android. Built from scratch for Tom and Mum.

**Preview:** https://sourmilkman.github.io/FORGET-ME-KNOT/

The unconfigured app opens a sample experience. Sample logins live in memory only. No real account or syncing is implied until Supabase has been configured.

## Included

- Separate accounts and encrypted vaults; one master password for everyday unlock.
- Search/select a service, copy username and password, show/hide, add/edit/delete logins.
- Tom can receive full access to Mum's vault through her explicit authorization; Mum does not receive access to Tom's vault.
- Encrypted helper-assisted account recovery, without an email-only decryption bypass.
- Secure device unlock using WebAuthn PRF when a compatible browser/authenticator is available.
- Encrypted backup export/import, random password generation, automatic locking.
- Optimistic concurrency: another device's changes cannot be silently overwritten.
- Read-only offline access to the last encrypted snapshot. App-shell-only service-worker caching.
- Installable PWA with app icons and visible version/commit/build model.

## Run

Node.js 24:

```sh
npm ci
npm test
npm run dev
```

Open `http://127.0.0.1:5173/FORGET-ME-KNOT/`. For the installable production build:

```sh
npm run build
npm run preview
```

## Connect real accounts

Follow [SETUP.md](SETUP.md). Only a public Supabase URL and publishable/anon key go in the frontend. Never supply a service-role key. The app does not need any OpenAI API key.

## Release status

This is a first implementation, not an independently audited password manager. The cryptography/authorization tests use Web Crypto and an embedded real PostgreSQL engine. They are not a substitute for a security review or live Supabase/Windows/Android checks. See [SECURITY.md](SECURITY.md) for the trust model and limitations.

Hosted email sign-in, physical-device PRF/fingerprint unlock and actual two-device sync require the configured project and devices to verify. No backend account has been created automatically.

## Deployment

GitHub Actions tests and builds `main`, then deploys to GitHub Pages. Public repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` can bake the shared connection into every device's build. With no variables the preview remains available, and connection details can be entered per browser.

Source layout: `src/crypto.js` (encryption), `src/biometric.js` (PRF unlock), `src/data.js` (sync), `src/App.jsx` (UI), `supabase/schema.sql` (authorization), `tests/security.test.mjs` (boundary tests).
