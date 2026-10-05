# Forget Me Knot

A calm, accessible password-vault PWA for Windows and Android. Built from scratch for Tom and Mum.

Two installable views are included: the full editor at `/FORGET-ME-KNOT/` for Tom, and Mum's read-only satellite at `/FORGET-ME-KNOT/mum.html`. Mum's daily view contains only a service picker plus copy username, copy password and open-service actions. Tom adds and maintains her logins from his own app.

Encrypted vault files sync through a **private GitHub repository** (`fmk-vaults`) — no database, nothing to keep awake. Tom's devices use a read/write token; Mum's phone uses a read-only token delivered by a one-tap setup link.

Tom's editor keeps the encrypted vaults separate and uses a prominent **My passwords / Mum's passwords** switch to choose which one he is managing. Mum's satellite uses its own purple colour scheme.

**Preview:** https://sourmilkman.github.io/FORGET-ME-KNOT/

Before a device is connected you can try sample logins, which live in memory only.

## Included

- Separate accounts and encrypted vaults; one master password for everyday unlock.
- Search/select a service, copy username and password, show/hide, add/edit/delete logins.
- Tom creates Mum's vault with full access for himself; Mum's app can never see or change Tom's vault.
- Tom can reset Mum's forgotten master password remotely.
- One-tap setup links connect Mum's phone without a visit.
- Secure device unlock using WebAuthn PRF when a compatible browser/authenticator is available.
- Encrypted backup export/import, random password generation, automatic locking.
- Optimistic concurrency: another device's changes cannot be silently overwritten (GitHub rejects stale writes).
- Full history: every save is a git commit in `fmk-vaults`.
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

Follow [SETUP.md](SETUP.md). Tokens are entered on each device and never belong in this repository.

## Release status

This is a first implementation, not an independently audited password manager. The tests use Web Crypto and an in-memory stand-in for the GitHub API. They are not a substitute for a security review or checks on your real repository and devices. See [SECURITY.md](SECURITY.md) for the trust model and limitations.

## Deployment

GitHub Actions tests and builds `main`, then deploys to GitHub Pages. The optional repository variable `VITE_VAULT_REPO` changes the default vault repository (default `sourmilkman/fmk-vaults`).

Source layout: `src/crypto.js` (encryption), `src/biometric.js` (PRF unlock), `src/data.js` (GitHub sync), `src/App.jsx` (UI), `src/MumApp.jsx` (Mum's app), `tests/security.test.mjs` (boundary tests).
