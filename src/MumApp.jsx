import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Fingerprint, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { unlockAccount } from './crypto.js';
import { client, fetchSnapshot, decryptVaults, createAccount, forgetCache, offlineAccount } from './data.js';
import { deviceUnlockAvailable, hasDeviceUnlock, enableDeviceUnlock, unlockWithDevice, removeDeviceUnlock } from './biometric.js';

const build = __BUILD__;
const fallbackUrls = {
  google: 'https://accounts.google.com', facebook: 'https://www.facebook.com', instagram: 'https://www.instagram.com',
  line: 'https://line.me', outlook: 'https://outlook.com', amazon: 'https://www.amazon.co.uk', apple: 'https://account.apple.com',
  netflix: 'https://www.netflix.com', paypal: 'https://www.paypal.com', whatsapp: 'https://web.whatsapp.com',
};

function Field({ label, children }) { return <label className="mum-field">{label}{children}</label>; }
function Action({ children, icon: Icon, className = '', ...props }) {
  return <button className={`mum-action ${className}`} {...props}>{Icon && <Icon size={24} />}<span>{children}</span></button>;
}

export default function MumApp() {
  const [phase, setPhase] = useState(client ? 'loading' : 'unavailable');
  const [session, setSession] = useState(null); const [profile, setProfile] = useState(null); const [identity, setIdentity] = useState(null);
  const [vault, setVault] = useState(null); const [entryId, setEntryId] = useState('');
  const [email, setEmail] = useState(''); const [code, setCode] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [copied, setCopied] = useState(''); const [offline, setOffline] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false); const [installEvent, setInstallEvent] = useState(null);
  const inFlight = useRef(false); const identityRef = useRef(null); const profileRef = useRef(null);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const entries = [...(vault?.entries || [])].sort((a, b) => a.service.localeCompare(b.service));
  const entry = entries.find(item => item.id === entryId) || entries[0];

  const lock = useCallback(() => { setIdentity(null); identityRef.current = null; setVault(null); setPassword(''); setCopied(''); setError(''); setPhase(p => p === 'vault' ? 'locked' : p); }, []);
  const run = async task => {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
    try { await task(); } catch (err) { setError(err.name === 'OperationError' ? 'That master password did not unlock the vault.' : err.name === 'NotAllowedError' ? 'Device unlock was cancelled. You can use the master password.' : err.message || 'Something went wrong. Please try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const accept = (snapshot, unlocked) => {
    if (snapshot.profile && snapshot.profile.name?.trim().toLowerCase() !== 'mum') throw new Error('This is Mum’s app. Sign in with Mum’s email address.');
    setProfile(snapshot.profile); profileRef.current = snapshot.profile; setOffline(Boolean(snapshot.offline));
    if (unlocked) {
      const own = unlocked.find(item => item.owner_id === snapshot.profile.id);
      if (!own) throw new Error('Mum’s vault could not be found.');
      setVault(own); setEntryId(current => own.entries.some(item => item.id === current) ? current : own.entries[0]?.id || '');
    }
  };

  useEffect(() => {
    if (!client) return;
    const cached = offlineAccount();
    if (cached) { setSession({ user: { id: cached.profile.id } }); accept(cached); setPhase('locked'); }
    let alive = true;
    if (!cached) client.auth.getSession().then(async ({ data, error: authError }) => {
      if (!alive) return;
      if (authError || !data.session) { setPhase('welcome'); return; }
      setSession(data.session);
      try { const snapshot = await fetchSnapshot(data.session.user.id, true); if (alive) { accept(snapshot); setPhase(snapshot.profile ? 'locked' : 'create'); } }
      catch (err) { if (alive) { setError(err.message); setPhase('welcome'); } }
    });
    const { data: subscription } = client.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') { lock(); setSession(null); setProfile(null); profileRef.current = null; setPhase('welcome'); }
      else if (event === 'TOKEN_REFRESHED') setSession(next);
    });
    return () => { alive = false; subscription.subscription.unsubscribe(); };
  }, [lock]);

  useEffect(() => { setDeviceReady(profile ? hasDeviceUnlock(profile.id) : false); }, [profile]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(''), 2500); return () => clearTimeout(timer); }, [copied]);
  useEffect(() => {
    const saveInstall = event => { event.preventDefault(); setInstallEvent(event); };
    window.addEventListener('beforeinstallprompt', saveInstall); return () => window.removeEventListener('beforeinstallprompt', saveInstall);
  }, []);
  useEffect(() => {
    if (phase !== 'vault') return;
    let hiddenAt = 0;
    const visibility = () => { if (document.hidden) hiddenAt = Date.now(); else if (hiddenAt && Date.now() - hiddenAt >= 60000) lock(); };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', lock);
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', lock); };
  }, [phase, lock]);
  useEffect(() => {
    if (phase !== 'vault' || !identity) return;
    let stopped = false;
    const refresh = async () => {
      if (document.hidden || !navigator.onLine || inFlight.current) return;
      try {
        const snapshot = await fetchSnapshot(profileRef.current.id);
        const unlocked = await decryptVaults(snapshot, identityRef.current);
        if (!stopped) accept(snapshot, unlocked);
      } catch { if (!stopped) setOffline(true); }
    };
    const timer = setInterval(refresh, 30000); window.addEventListener('online', refresh);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('online', refresh); };
  }, [phase, identity]);

  const unlock = device => run(async () => {
    const snapshot = await fetchSnapshot(session.user.id, true);
    const unlockedIdentity = device ? await unlockWithDevice(snapshot.profile) : await unlockAccount(password, snapshot.profile);
    const unlocked = await decryptVaults(snapshot, unlockedIdentity);
    identityRef.current = unlockedIdentity; setIdentity(unlockedIdentity); accept(snapshot, unlocked); setPassword(''); setPhase('vault');
  });
  const refresh = () => run(async () => {
    const snapshot = await fetchSnapshot(profile.id); const unlocked = await decryptVaults(snapshot, identity);
    accept(snapshot, unlocked); setOffline(false);
  });
  const copy = async (value, label) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); } catch { setError('Copy was blocked. Press and hold the value to copy it.'); }
  };
  const signOut = () => run(async () => {
    const id = profile?.id; const { error: authError } = await client.auth.signOut({ scope: 'local' }); if (authError) throw authError;
    if (id) { forgetCache(id); removeDeviceUnlock(id); } setSession(null); setProfile(null); profileRef.current = null; setPhase('welcome');
  });
  const openUrl = entry && (/^https:\/\//i.test(entry.url || '') ? entry.url : fallbackUrls[entry.service.toLowerCase()]);

  if (phase !== 'vault') return <main className="mum-gate">
    <section className="mum-card">
      <img className="mum-logo" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
      <span className="mum-kicker">MUM’S PASSWORDS</span>
      {phase === 'loading' && <><h1>Opening your safe place…</h1><p>Just a moment.</p></>}
      {phase === 'unavailable' && <><h1>Tom needs to finish setup.</h1><p>The secure sync connection is missing from this build.</p></>}
      {phase === 'welcome' && <><h1>Let’s open your passwords.</h1><p>Enter your email. We’ll send a short sign-in code.</p><form onSubmit={e => { e.preventDefault(); run(async () => { const { error: authError } = await client.auth.signInWithOtp({ email: email.trim() }); if (authError) throw authError; setPhase('code'); }); }}><Field label="Your email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field><Action className="primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send my code'}</Action></form></>}
      {phase === 'code' && <><h1>Check your email.</h1><p>Enter the six-digit code we sent you.</p><form onSubmit={e => { e.preventDefault(); run(async () => { const { data, error: authError } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }); if (authError) throw authError; const snapshot = await fetchSnapshot(data.session.user.id); setSession(data.session); accept(snapshot); setPhase(snapshot.profile ? 'locked' : 'create'); }); }}><Field label="Email code"><input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required /></Field><Action className="primary" type="submit" disabled={busy}>Continue</Action></form></>}
      {phase === 'create' && <><h1>Create Mum’s vault.</h1><p>Tom can complete this one-time step.</p><form onSubmit={e => { e.preventDefault(); run(async () => { if (password !== confirm) throw new Error('The passwords do not match.'); const made = await createAccount(session.user.id, 'Mum', password); const snapshot = await fetchSnapshot(session.user.id); const unlocked = await decryptVaults(snapshot, made.identity); identityRef.current = made.identity; setIdentity(made.identity); accept(snapshot, unlocked); setPassword(''); setConfirm(''); setPhase('vault'); }); }}><Field label="Master password"><input type="password" minLength="14" value={password} onChange={e => setPassword(e.target.value)} required /></Field><Field label="Repeat master password"><input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></Field><Action className="primary" type="submit" disabled={busy}>Create Mum’s vault</Action></form></>}
      {phase === 'locked' && <><h1>Hello{profile?.name ? `, ${profile.name}` : ''}.</h1><p>Your passwords are safe and ready.</p>{deviceReady && <Action className="primary" icon={Fingerprint} onClick={() => unlock(true)} disabled={busy}>Open with fingerprint or PIN</Action>}<details open={!deviceReady}><summary>{deviceReady ? 'Use master password instead' : 'Open with master password'}</summary><form onSubmit={e => { e.preventDefault(); unlock(false); }}><Field label="Master password"><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></Field><Action className={deviceReady ? '' : 'primary'} type="submit" disabled={busy}>Open my passwords</Action></form></details><button className="mum-link" onClick={signOut}>Use a different account</button></>}
      {error && <p className="mum-error" role="alert">{error}</p>}
      {installEvent && <button className="mum-link" onClick={async () => { await installEvent.prompt(); setInstallEvent(null); }}>Install Mum’s app</button>}
      <footer><ShieldCheck size={15} /> Encrypted on this device<br />Build {build} · Build model: GPT-6 · Codex</footer>
    </section>
  </main>;

  return <main className="mum-vault">
    <header><div><span className="mum-kicker">MUM’S PASSWORDS</span><h1>What do you need?</h1></div><div className={`mum-sync ${offline ? 'offline' : ''}`}><span />{offline ? 'Offline copy' : 'Synced'}</div><button className="mum-icon-button" aria-label="Lock passwords" onClick={lock}><LockKeyhole /></button></header>
    {needRefresh && <button className="mum-update" onClick={() => { lock(); updateServiceWorker(true); }}>Update app</button>}
    <section className="mum-panel">
      {entries.length ? <>
        <Field label="Choose an app or website"><select value={entry?.id || ''} onChange={e => setEntryId(e.target.value)}>{entries.map(item => <option value={item.id} key={item.id}>{item.service}</option>)}</select></Field>
        <div className="mum-selected"><span>{entry.service.charAt(0).toUpperCase()}</span><div><strong>{entry.service}</strong><small>{entry.username || 'Username saved'}</small></div></div>
        <Action icon={copied === 'username' ? Check : Copy} className={copied === 'username' ? 'copied' : ''} disabled={!entry.username} onClick={() => copy(entry.username, 'username')}>{copied === 'username' ? 'Username copied!' : 'Copy username'}</Action>
        <Action icon={copied === 'password' ? Check : Copy} className={`primary ${copied === 'password' ? 'copied' : ''}`} onClick={() => copy(entry.password, 'password')}>{copied === 'password' ? 'Password copied!' : 'Copy password'}</Action>
        <Action icon={ArrowUpRight} disabled={!openUrl} onClick={() => window.open(openUrl, '_blank', 'noopener,noreferrer')}>Open {entry.service}</Action>
        <p className="mum-tip">Copy here, switch to the app, then press and hold its login box and choose <strong>Paste</strong>.</p>
      </> : <div className="mum-empty"><LockKeyhole size={36} /><h2>Tom is setting this up.</h2><p>Your saved apps will appear here automatically.</p></div>}
      {error && <p className="mum-error" role="alert">{error}</p>}
    </section>
    {!deviceReady && deviceUnlockAvailable() && <Action className="mum-device" icon={Fingerprint} disabled={busy} onClick={() => run(async () => { await enableDeviceUnlock(profile, identity); setDeviceReady(true); })}>Use fingerprint or PIN next time</Action>}
    <button className="mum-refresh" onClick={refresh} disabled={busy || !navigator.onLine}><RefreshCw size={17} /> Refresh passwords</button>
    <footer>Build {build} · Build model: GPT-6 · Codex</footer>
  </main>;
}
