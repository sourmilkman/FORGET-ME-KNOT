# One-time setup for Tom

Your encrypted vaults live as files in a **private** GitHub repository (`sourmilkman/fmk-vaults`). There is no server or database to keep awake. Each device gets its own GitHub token:

| Device | Token access |
|---|---|
| Tom's PC and phone | `fmk-vaults` only · **Contents: Read and write** |
| Mum's phone | `fmk-vaults` only · **Contents: Read-only** |

The app code repository (`FORGET-ME-KNOT`) stays public so GitHub Pages can host it. Never commit a token to either repository.

## 1. Vault repository

Create a **private** repository called `fmk-vaults`. Leave it empty — the app creates the files. Do not make it public.

To use a different name, set it in the app's **Vault repository** field, or set the Actions variable `VITE_VAULT_REPO` (e.g. `sourmilkman/other-name`) and re-run the deploy workflow.

## 2. Make the tokens

On github.com: your profile picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.

1. **Name:** e.g. `FMK – Tom PC`.
2. **Expiration:** the longest option offered. Put a reminder in your calendar a week before it ends. When a token expires the app says so; make a new one and reconnect that device.
3. **Repository access:** *Only select repositories* → `fmk-vaults`.
4. **Permissions → Repository permissions → Contents:** *Read and write* for your devices, *Read-only* for Mum's.
5. Generate, then copy the token (starts with `github_pat_`). GitHub shows it once.

Repeat for Mum with **Read-only**. One token per device is tidiest, because you can revoke a lost phone without touching anything else.

## 3. Connect your devices and create your account

1. Open <https://sourmilkman.github.io/FORGET-ME-KNOT/>.
2. Account name `tom`, paste your token, **Connect this device**.
3. The first time, choose your name and a master password (at least 14 characters; four unrelated words work well). This creates `profiles/tom.json` and `vaults/tom.json`.
4. On your phone, repeat steps 1–2 with the same account name and your phone's token, then unlock with the same master password.

Optional: **Settings → Set up device unlock** for fingerprint / Windows Hello where the browser supports it.

## 4. Create Mum's vault (from your own app)

1. **Family access → Create a new family vault.** Name `Mum`, account `mum`, and a master password for her.
2. You now see **My passwords / Mum's passwords**. Add her logins.
3. **Connect their phone:** paste Mum's *read-only* token and press **Copy setup link**.
4. Send Mum the link by text or WhatsApp. **Tell her the master password separately, by phone.**
5. On her phone she taps the link, then opens Chrome's menu → **Add to Home screen / Install app** to get *Mum's Passwords*, enters the master password, and can turn on fingerprint unlock.

The link puts the token after a `#`, which browsers never send to any server, and the app wipes it from the address bar once read. The token on her phone can only *read* ciphertext; it cannot change or delete anything.

## 5. If Mum forgets her master password

**Family access → Help someone get back in → Reset password.** Choose a new one and tell her by phone. Her logins, her fingerprint unlock and your access are unchanged.

If **you** forget yours, nobody can reset it. Keep an **encrypted backup** (Settings → Save backup) somewhere safe, with its own password.

## 6. Checks before real passwords

1. Add a **made-up** login on PC; it appears on your phone after Refresh (automatic every 30 seconds while unlocked).
2. Mum's app shows only her vault.
3. Edit the same login on two devices: the second save reports a conflict instead of overwriting.
4. Wrong master passwords fail; Reset password works.
5. Offline after one online unlock: the last encrypted copy is readable, read-only.
6. Backups export and import.
7. Device unlock, install, copy/paste and auto-lock work on your actual devices.

## What is stored where?

`fmk-vaults` holds `profiles/<account>.json` (name, public key, encrypted private key, master-password wrapping) and `vaults/<account>.json` (encrypted logins plus a wrapped key for each member). Service names, usernames, passwords and notes are only inside the ciphertext. Every save is a git commit, so earlier versions can be restored from the repository's history.

Each browser stores its token, an encrypted snapshot, and (optionally) an encrypted device-unlock key. **Sign out & forget this device** / **Disconnect this phone** removes those from that browser. Revoke the token on GitHub too if a device is lost.

## Limits worth knowing

- GitHub allows about 5,000 API requests per hour per GitHub account. All tokens are yours, so they share that allowance; normal use is well under 1,000.
- Tokens expire (see step 2). Nothing else needs renewing.
