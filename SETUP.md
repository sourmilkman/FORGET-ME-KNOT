# One-time setup for Tom

The app frontend can be installed from GitHub Pages. Supabase provides verified accounts and stores encrypted vault data. GitHub Pages alone cannot sync passwords.

## 1. Create your sync project

1. Sign in at https://supabase.com/dashboard and create a **new** project for Forget Me Knot. Choose a nearby region and retain its database password privately.
2. The free plan can be used for initial evaluation. Review the plan's current limits and inactivity/pausing policy before relying on it; no paid plan is required by this code.
3. Open SQL Editor and execute the complete contents of [supabase/schema.sql](supabase/schema.sql) once. It is intended for a new project. Do not rerun it over an existing installation.

The schema deliberately denies direct table reads/writes, including to signed-in users. The application uses narrowly scoped database functions with explicit account checks. Empty results in the normal table REST API are expected.

## 2. Configure email verification

1. In Authentication, enable email sign-in and allow new users to sign up for initial setup.
2. Set Site URL to `https://sourmilkman.github.io/FORGET-ME-KNOT/`.
3. Configure a production SMTP provider. Supabase's built-in sender is restricted and is not suitable for ordinary emails to Mum; provider signup/domain verification may be required. See the official [SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).
4. In the **Magic Link** email template include the token itself, e.g.:

```html
<h2>Your Forget Me Knot sign-in code</h2>
<p>Enter this code in the app: {{ .Token }}</p>
<p>If you did not request it, ignore this email.</p>
```

5. Set a short OTP expiry (for example 10 minutes). Retain the service's rate limiting. Once both accounts exist, optionally disable further signups in Supabase.

The app uses `signInWithOtp` followed by `verifyOtp({ type: 'email' })`. An email-only login verifies account access but cannot decrypt the vault. A master password or prearranged recovery is still required. [Official email OTP documentation](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## 3. Connect the frontend

From the project's Connect/API settings, obtain:

- Project URL: `https://your-project.supabase.co`
- **Publishable key** (`sb_publishable_...`) or legacy public **anon** key.

Never copy the secret/service-role key into this app, source repository or chat.

**Simplest for both devices:** in GitHub repository Settings → Secrets and variables → Actions → Variables, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Run the **Test and deploy password vault** workflow again. These values are intentionally public in the built app; access protection is in the database functions.

Alternatively, select **Connect sync service** in the welcome screen and enter the two public values on each device. This does not require a rebuild.

For local development, copy `.env.example` to `.env.local` and fill in the same public values. `.env.local` is ignored by Git.

## 4. Create Tom's and Mum's accounts

1. Tom enters his email, receives a code, then creates his vault with his name and a strong master password of at least 14 characters. Prefer four or more unrelated words.
2. Mum repeats the process using **her own email address** and master password. She can use the name `Mum`.
3. Tom connects his Android app with the **same email** he used on PC and unlocks with the same master password. His existing vault appears.
4. Keep access to both email accounts available outside this vault so you can connect a new device. Do not store the only means of reaching the sign-in email inside a locked vault.

## 5. Give Tom access to Mum's vault

1. In **Tom's account → Family access**, select **Copy my helper code**. He can also display its fingerprint.
2. In **Mum's account → Family access**, paste Tom's code and select **Check helper**.
3. Verify the name and fingerprint against Tom's app. On Mum's device, select **Give full access & recovery**.
4. Refresh Tom's vaults. His selector now includes **My vault** and **Mum's vault**.

Mum retains only her own vault. Tom can manage all of Mum's logins and generate a recovery kit for her. This first release does **not** implement revocation/key rotation; grant this only to someone you trust permanently. Removing a database membership alone is not cryptographic revocation.

## 6. Recovery

Tom opens **Family access → Mum's vault → Help recover**, downloads the encrypted recovery file and gives the separate code directly to Mum.

Mum connects her own account through email verification, selects **Forgot your master password?**, supplies the recovery file and code, then chooses a new master password. The vault contents and Tom's existing grant are retained.

The recovery file and code are a reusable recovery credential, **not a one-time link**. Together they can recover the account's encryption identity. They remain usable after a master-password change. Delete copies after use and keep them away from anyone else. Full rotation/revocation is not implemented.

## 7. Install and check with sample data

- **Windows:** in Chrome or Edge, use the address-bar installation button or menu → Install app.
- **Galaxy S21 Ultra:** in Chrome, menu → Add to Home screen / Install app.
- **Settings → Set up device unlock:** only succeeds if the browser/authenticator supports WebAuthn PRF with user verification. Windows Hello/fingerprint support is not guaranteed merely because the device has a sensor. The master password is the fallback.
- The PWA is scoped to `/FORGET-ME-KNOT/`. Passkeys are scoped to the hosting origin, so switching domains requires enrolling them again.

Before real passwords, complete an independent security review and check:

1. Tom creates/edits a **made-up** login on PC; it appears on Android after Refresh (automatic refresh runs every 30 seconds while unlocked).
2. Mum's account cannot see Tom's vault. A third test account cannot see either vault.
3. After Mum grants access, Tom's edit appears in Mum's vault.
4. Concurrent edits report a conflict, preserving the second device's draft until it is closed. Close, refresh and reapply it; there is no automatic merge.
5. Wrong master passwords and wrong recovery codes fail; helper recovery with a new password works.
6. Offline access after an online unlock shows the last saved encrypted snapshot, read only. The app cannot create accounts offline.
7. Backups export/import correctly. Keep the backup password separately.
8. Device unlock, installation, copy/paste and automatic locking work on your actual PC and phone.

## What is stored where?

The backend stores account identity/name, membership metadata, encrypted private keys, wrapped keys and encrypted vault ciphertext. Service names, usernames, passwords and notes are inside that ciphertext. Supabase Auth also holds the sign-in email.

The browser stores an authentication session and encrypted snapshot. It never deliberately persists plaintext login contents or the master password. Optional device unlock stores an encrypted account key bound to a passkey's PRF output.

**Sign out & forget this device** removes this browser's encrypted snapshot and device-unlock wrapper and signs out the local authentication session. It does not erase clipboard history, downloaded backups, other browsers, other devices, or the OS's passkey entry.
