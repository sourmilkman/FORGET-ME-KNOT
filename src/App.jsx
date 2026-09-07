import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldCheck, UsersRound, Settings2, Search, Plus, Copy, Check, Eye, EyeOff, LockKeyhole, LogOut, ArrowRight, ArrowUpRight, X, RefreshCw, Download, Fingerprint, ChevronDown, CircleHelp, Trash2, Pencil, Sparkles, WifiOff, MonitorSmartphone, CheckCircle2 } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { aes, seal, open, random, b64, unb64, wrapAccount, unlockAccount, wrapFor, unwrapFor, fingerprint, makeRecovery, readRecovery, generatePassword, validateEntries } from './crypto.js';
import { client, getConfig, saveConfig, rpc, fetchSnapshot, decryptVaults, createAccount, saveVault, sampleVaults, forgetCache, offlineAccount } from './data.js';
import { deviceUnlockAvailable, hasDeviceUnlock, enableDeviceUnlock, unlockWithDevice, removeDeviceUnlock } from './biometric.js';

const services = ['Google', 'Facebook', 'Instagram', 'LINE', 'Outlook', 'Amazon', 'Apple', 'Netflix', 'PayPal', 'WhatsApp', 'Other'];
const blankEntry = () => ({ id: crypto.randomUUID(), service: '', username: '', password: '', url: '', notes: '' });
const build = __BUILD__;
function Brand({ small = false }) { return <div className={`brand ${small ? 'small' : ''}`}><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" /><span>forget me knot<span className="brand-sub">A LITTLE PEACE OF MIND</span></span></div>; }
function ServiceIcon({ name, large = false }) { const key = name.toLowerCase(); return <span className={`service-icon ${large ? 'large' : ''} service-${services.map(s => s.toLowerCase()).includes(key) ? key : 'other'}`} aria-hidden="true">{key === 'facebook' ? 'f' : key === 'instagram' ? '◎' : key === 'line' ? 'LINE' : name.charAt(0).toUpperCase()}</span>; }
function Button({ children, icon: Icon, className = '', ...props }) { return <button className={`button ${className}`} {...props}>{Icon && <Icon size={18} />}<span>{children}</span></button>; }
function download(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readFile(file) {
  if (!file || file.size > 8_000_000) throw new Error('Choose a valid file smaller than 8 MB.');
  try { return JSON.parse(await file.text()); } catch { throw new Error('This file could not be read. Choose a Forget Me Knot file.'); }
}
function Modal({ title, onClose, children, busy }) {
  const ref = useRef();
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} aria-labelledby="dialog-title"><div className="dialog-top"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={busy}><X /></button></div>{children}</dialog>;
}
function PasswordInput({ label, id, ...props }) {
  const [show, setShow] = useState(false);
  return <label htmlFor={id}>{label}<div className="password-input"><input {...props} id={id} aria-label={label} type={show ? 'text' : 'password'} spellCheck={false} autoCapitalize="none" /><button type="button" className="icon-button" onClick={() => setShow(!show)} aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>{show ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>;
}
function Connection({ onClose }) {
  const [url, setUrl] = useState(''); const [key, setKey] = useState(''); const [error, setError] = useState('');
  return <Modal title="Connect your sync service" onClose={onClose}><p>This one-time setup connects your devices. Tom can do this for Mum.</p><ol className="setup-steps"><li>Create a Supabase project.</li><li>Run the database setup and configure email codes using the guide below.</li><li>Enter its public connection details here.</li></ol><a className="text-link" href="https://github.com/sourmilkman/FORGET-ME-KNOT/blob/main/SETUP.md" target="_blank" rel="noreferrer">Open the setup guide <ArrowUpRight size={15} /></a><form onSubmit={e => { e.preventDefault(); try { saveConfig(url, key); location.reload(); } catch (err) { setError(err.message); } }}><label>Project URL<input type="url" placeholder="https://your-project.supabase.co" required value={url} onChange={e => setUrl(e.target.value)} /></label><label>Public publishable key<input type="text" placeholder="sb_publishable_…" required value={key} onChange={e => setKey(e.target.value)} autoComplete="off" /></label><p className="caption">Only use a public key. Secret and service-role keys are never needed.</p>{error && <p className="error" role="alert">{error}</p>}<Button className="primary full" type="submit" icon={ShieldCheck}>Save connection</Button></form></Modal>;
}
function EntryEditor({ entry, busy, onSave, onDelete, onClose, error, demo }) {
  const [draft, setDraft] = useState(entry || blankEntry);
  const [deleting, setDeleting] = useState(false);
  const change = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));
  return <Modal title={deleting ? 'Delete this login?' : entry ? 'Edit login' : 'Add a login'} onClose={onClose} busy={busy}>
    {deleting ? <><p><strong>{draft.service}</strong> will be removed from this vault on all synced devices. This cannot be undone.</p>{error && <p className="error" role="alert">{error}</p>}<div className="dialog-actions"><Button onClick={() => setDeleting(false)} disabled={busy}>Keep login</Button><Button className="danger" onClick={() => onDelete(draft.id)} disabled={busy} icon={Trash2}>{busy ? 'Deleting…' : 'Delete login'}</Button></div></> : <form onSubmit={e => { e.preventDefault(); onSave({ ...draft, service: draft.service.trim(), updatedAt: new Date().toISOString() }); }}>
    {demo && <p className="notice">Sample mode. Use made-up details only; changes disappear when you leave.</p>}
    <label>App or website<input list="service-options" value={draft.service} required maxLength={80} placeholder="Choose or type a name" onChange={e => change('service', e.target.value)} /><datalist id="service-options">{services.filter(s => s !== 'Other').map(s => <option key={s} value={s} />)}</datalist></label>
    <label>Username or email<input value={draft.username} onChange={e => change('username', e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={500} placeholder="e.g. mum@example.com" /></label>
    <PasswordInput label="Password" id="entry-password" value={draft.password} onChange={e => change('password', e.target.value)} autoComplete="new-password" maxLength={2000} required />
    <button className="text-link generate" type="button" onClick={() => change('password', generatePassword())}><Sparkles size={15} /> Make a strong password</button><p className="caption">If you change this password, update it on the website too.</p>
    <details className="extra-fields"><summary>Website link & notes <ChevronDown size={16} /></summary><label>Website link (optional)<input type="url" value={draft.url} onChange={e => change('url', e.target.value)} placeholder="https://…" maxLength={2000} /></label><label>Notes (optional)<textarea value={draft.notes} onChange={e => change('notes', e.target.value)} maxLength={10000} rows={3} /></label></details>
    {error && <p className="error" role="alert">{error}</p>}<div className="dialog-actions">{entry && <button type="button" className="icon-button danger-text" aria-label="Delete login" onClick={() => setDeleting(true)} disabled={busy}><Trash2 size={20} /></button>}<Button type="button" onClick={onClose} disabled={busy}>Cancel</Button><Button className="primary" type="submit" disabled={busy} icon={Check}>{busy ? 'Saving…' : 'Save login'}</Button></div></form>}
  </Modal>;
}
function RecoveryForm({ profile, busy, onRecover, error, onClose }) {
  const [file, setFile] = useState(null); const [code, setCode] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  return <Modal title="Let’s get you back in" onClose={onClose} busy={busy}><p>Ask your trusted helper for a recovery file and its code. You must be connected to your own account first.</p><form onSubmit={e => { e.preventDefault(); onRecover(file, code, password, confirm); }}><label>Recovery file<input type="file" accept=".json,application/json" required onChange={e => setFile(e.target.files[0])} /></label><label>Recovery code<input autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required /></label><PasswordInput id="recover-password" label="New master password" minLength={14} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required /><PasswordInput id="recover-confirm" label="Repeat new password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required /><p className="caption">At least 14 characters. Try four unrelated words.</p>{error && <p className="error" role="alert">{error}</p>}<Button className="primary full" disabled={busy} type="submit">{busy ? 'Restoring access…' : `Restore ${profile.name}’s access`}</Button></form></Modal>;
}
function BackupDialog({ kind, busy, error, onClose, onExport, onImport }) {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [file, setFile] = useState(null);
  return <Modal title={kind === 'export' ? 'Save an encrypted backup' : 'Import a backup'} onClose={onClose} busy={busy}><p>{kind === 'export' ? 'Choose a password for this backup file. Keep it somewhere safe: it is needed to open the backup.' : 'Logins from this backup will be added to the selected vault. Existing logins will be kept.'}</p><form onSubmit={e => { e.preventDefault(); kind === 'export' ? onExport(password, confirm) : onImport(file, password); }}>{kind === 'import' && <label>Backup file<input type="file" accept=".json,application/json" required onChange={e => setFile(e.target.files[0])} /></label>}<PasswordInput label="Backup password" id="backup-password" value={password} onChange={e => setPassword(e.target.value)} minLength={kind === 'export' ? 14 : undefined} required autoComplete="off" />{kind === 'export' && <PasswordInput label="Repeat backup password" id="backup-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="off" />}{error && <p className="error" role="alert">{error}</p>}<Button className="primary full" disabled={busy} type="submit">{busy ? 'Working…' : kind === 'export' ? 'Download encrypted backup' : 'Add logins from backup'}</Button></form></Modal>;
}

export default function App() {
  const [phase, setPhase] = useState(client ? 'loading' : 'welcome');
  const [session, setSession] = useState(null); const [profile, setProfile] = useState(null); const [identity, setIdentity] = useState(null);
  const [vaults, setVaults] = useState([]); const [vaultId, setVaultId] = useState(''); const [entryId, setEntryId] = useState('');
  const [helpers, setHelpers] = useState([]); const [tab, setTab] = useState('passwords'); const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null); const [demo, setDemo] = useState(false); const [offline, setOffline] = useState(false);
  const [email, setEmail] = useState(''); const [code, setCode] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false); const [copied, setCopied] = useState(''); const [helperCode, setHelperCode] = useState(''); const [helperPreview, setHelperPreview] = useState(null); const [recovery, setRecovery] = useState(null);
  const [installEvent, setInstallEvent] = useState(null); const [deviceReady, setDeviceReady] = useState(false);
  const epoch = useRef(0); const lastActive = useRef(Date.now()); const inFlight = useRef(false); const activeAccount = useRef(null);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const vault = vaults.find(v => v.id === vaultId) || vaults[0];
  const entries = (vault?.entries || []).filter(e => `${e.service} ${e.username}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.service.localeCompare(b.service));
  const entry = entries.find(e => e.id === entryId) || entries[0];
  const mine = vault?.owner_id === profile?.id;
  const online = !offline && navigator.onLine;
  const note = useCallback(text => setToast(text), []);
  const lock = useCallback(() => {
    epoch.current++; inFlight.current = false; setBusy(false); setIdentity(null); setVaults([]); setHelpers([]); setPassword(''); setConfirm(''); setModal(null); setRecovery(null); setHelperPreview(null); setHelperCode(''); setShown(false); setCopied(''); setError(''); setToast(''); setQuery('');
    setPhase(prev => prev === 'vault' ? 'locked' : prev);
  }, []);
  const run = async task => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); const current = epoch.current;
    const active = () => current === epoch.current;
    try { await task(active); } catch (err) { if (active()) setError(err.name === 'OperationError' ? 'That password or recovery code didn’t unlock the vault. Please try again.' : err.name === 'NotAllowedError' ? 'Device unlock was cancelled or is unavailable. You can use your master password.' : err.message || 'Something went wrong. Please try again.'); }
    finally { if (active()) { inFlight.current = false; setBusy(false); } }
  };
  const acceptSnapshot = (snapshot, unlocked) => {
    activeAccount.current = snapshot.profile?.id || null;
    setProfile(snapshot.profile); setHelpers(snapshot.helpers || []); setOffline(snapshot.offline);
    if (unlocked) setVaults(unlocked);
  };
  useEffect(() => {
    if (!client) return;
    const cached = offlineAccount();
    if (cached) { setSession({ user: { id: cached.profile.id } }); acceptSnapshot(cached); setPhase('locked'); }
    let alive = true;
    if (!cached) client.auth.getSession().then(async ({ data, error: authError }) => {
      if (!alive) return;
      if (authError) { setError('Could not reconnect. Please sign in again.'); setPhase('welcome'); return; }
      const initial = data.session; setSession(initial);
      if (!initial) { setPhase('welcome'); return; }
      try { const snapshot = await fetchSnapshot(initial.user.id, true); if (alive) { acceptSnapshot(snapshot); setPhase(snapshot.profile ? 'locked' : 'create'); } }
      catch (err) { if (alive) { setError(err.message); setPhase('welcome'); } }
    });
    const { data: subscription } = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_IN' && activeAccount.current && nextSession?.user.id !== activeAccount.current) { lock(); location.reload(); return; }
      if (event === 'SIGNED_OUT') { lock(); setSession(null); setProfile(null); setPhase('welcome'); }
      else if (event === 'TOKEN_REFRESHED') setSession(nextSession);
    });
    return () => { alive = false; subscription.subscription.unsubscribe(); };
  }, [lock]);
  useEffect(() => { setDeviceReady(profile ? hasDeviceUnlock(profile.id) : false); }, [profile]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { setShown(false); setCopied(''); }, [entry?.id, vault?.id]);
  useEffect(() => { if (!shown) return; const t = setTimeout(() => setShown(false), 15000); return () => clearTimeout(t); }, [shown]);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(''), 2500); return () => clearTimeout(t); }, [copied]);
  useEffect(() => {
    const install = e => { e.preventDefault(); setInstallEvent(e); };
    const off = () => setOffline(true);
    window.addEventListener('beforeinstallprompt', install); window.addEventListener('offline', off);
    return () => { window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    if (phase !== 'vault') return;
    lastActive.current = Date.now(); let hiddenAt = 0;
    const activity = () => { lastActive.current = Date.now(); };
    const visibility = () => {
      if (document.hidden) { hiddenAt = Date.now(); setShown(false); }
      else if (hiddenAt && Date.now() - hiddenAt >= 60000) lock();
    };
    const timer = setInterval(() => { if (Date.now() - lastActive.current > 5 * 60000 || (document.hidden && hiddenAt && Date.now() - hiddenAt >= 60000)) lock(); }, 1000);
    ['pointerdown', 'keydown'].forEach(e => window.addEventListener(e, activity));
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', lock);
    return () => { clearInterval(timer); ['pointerdown', 'keydown'].forEach(e => window.removeEventListener(e, activity)); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', lock); };
  }, [phase, lock]);
  useEffect(() => {
    if (phase !== 'vault' || demo || !identity || modal) return;
    let stopped = false;
    const refresh = async () => {
      if (document.hidden || inFlight.current || !navigator.onLine) return;
      const current = epoch.current;
      try {
        const snapshot = await fetchSnapshot(profile.id);
        if (JSON.stringify(snapshot.profile.master) !== JSON.stringify(profile.master)) { lock(); setProfile(snapshot.profile); return; }
        const unlocked = await decryptVaults(snapshot, identity);
        if (!stopped && epoch.current === current) acceptSnapshot(snapshot, unlocked);
      } catch { if (!stopped) setOffline(true); }
    };
    const timer = setInterval(refresh, 30000); window.addEventListener('online', refresh);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('online', refresh); };
  }, [phase, demo, identity, modal, profile, lock]);

  const startDemo = () => {
    epoch.current++; inFlight.current = false; setBusy(false); setDemo(true); setProfile({ id: 'demo', name: 'Tom' }); setVaults(sampleVaults()); setVaultId('sample-tom'); setPhase('vault'); setTab('passwords'); setError(''); setOffline(false);
  };
  const unlock = device => run(async active => {
    if (demo) { startDemo(); return; }
    const snapshot = await fetchSnapshot(session.user.id, true);
    if (!snapshot.profile) throw new Error('Your account is not set up yet.');
    const unlockedIdentity = device ? await unlockWithDevice(snapshot.profile) : await unlockAccount(password, snapshot.profile);
    const unlocked = await decryptVaults(snapshot, unlockedIdentity);
    if (!active()) return;
    setPassword(''); setIdentity(unlockedIdentity); acceptSnapshot(snapshot, unlocked); setPhase('vault');
  });
  const refresh = () => run(async active => {
    if (demo) { note('Sample mode — there is no cloud connection.'); return; }
    const snapshot = await fetchSnapshot(profile.id);
    if (JSON.stringify(snapshot.profile.master) !== JSON.stringify(profile.master)) { lock(); setProfile(snapshot.profile); return; }
    const unlocked = await decryptVaults(snapshot, identity);
    if (active()) { acceptSnapshot(snapshot, unlocked); note('Your vaults are up to date.'); }
  });
  const persist = async (nextEntries, active) => {
    if (!demo && !online) throw new Error('Reconnect and refresh before making changes. Your saved logins are still available to copy.');
    const saved = demo ? { ...vault, entries: nextEntries } : await saveVault(vault, nextEntries);
    if (active()) {
      setVaults(current => current.map(v => v.id === saved.id ? saved : v));
      if (!demo) fetchSnapshot(profile.id).catch(() => {});
    }
    return saved;
  };
  const copy = async (value, label) => {
    const current = epoch.current;
    try { await navigator.clipboard.writeText(value); if (current === epoch.current) { setCopied(label); note(`${label} copied. Now paste it into the app or website.`); } }
    catch { if (current === epoch.current) setError('Copy was blocked by your browser. Use Show password, then select and copy the text.'); }
  };
  const signOut = () => run(async () => {
    const id = profile?.id;
    if (!demo && client) { const { error: err } = await client.auth.signOut({ scope: 'local' }); if (err) throw err; }
    if (id) { forgetCache(id); removeDeviceUnlock(id); }
    lock(); setDemo(false); setProfile(null); setSession(null); setPhase('welcome');
  });
  const closeModal = () => { setModal(null); setError(''); setRecovery(null); };
  const openModal = value => { setError(''); setModal(value); };
  const selectVault = id => { setVaultId(id); setEntryId(''); setQuery(''); setError(''); setShown(false); };
  const install = async () => {
    if (installEvent) { await installEvent.prompt(); setInstallEvent(null); }
    else note('In Chrome or Edge, open the browser menu and choose Install app or Add to Home screen.');
  };
  const renderError = !modal && error && <div className="error global-error" role="alert">{error}<button aria-label="Dismiss error" className="icon-button" onClick={() => setError('')}><X size={18} /></button></div>;

  return <>
    {needRefresh && phase !== 'vault' && <div className="update-banner">A new build is ready.<button onClick={() => { lock(); updateServiceWorker(true); }}>Update app</button></div>}
    {phase !== 'vault' ? <div className="welcome-shell"><header className="welcome-header"><Brand /><button className="text-link" onClick={() => openModal('help')}><CircleHelp size={17} /> A little help</button></header><main className="welcome-main"><section className="welcome-story"><span className="eyebrow"><span className="status-dot" /> YOUR PASSWORDS. YOUR PEACE OF MIND.</span><h1>One less thing<br />to <em>remember.</em></h1><p>A safe little home for your passwords.<br />Easy for you. Easy for the people you help.</p><div className="knot-art" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" /><span className="art-tag"><ShieldCheck size={16} /> Yours, and only yours</span></div><div className="welcome-benefits"><span><KeyRound /> One master password</span><span><MonitorSmartphone /> At home. On the go.</span></div></section><section className="welcome-card">
      <div className="lock-emblem"><LockKeyhole size={26} /></div>
      {phase === 'loading' ? <><h2>Connecting your vault…</h2><p>Just a moment.</p></> : phase === 'locked' ? <><span className="eyebrow">YOUR PRIVATE SPACE</span><h2>Welcome back{profile?.name ? `, ${profile.name}` : ''}.</h2><p>Unlock your vault to find what you need.</p><form onSubmit={e => { e.preventDefault(); unlock(false); }}><PasswordInput id="unlock-password" label="Master password" value={password} onChange={e => setPassword(e.target.value)} required={!demo} autoComplete="current-password" autoFocus /><Button className="primary full" type="submit" disabled={busy} icon={ArrowRight}>{busy ? 'Unlocking…' : demo ? 'Reopen sample vault' : 'Unlock my vault'}</Button></form>{deviceReady && !demo && <Button className="full" icon={Fingerprint} disabled={busy} onClick={() => unlock(true)}>Use device unlock</Button>}<button className="text-link centered" disabled={busy || demo} onClick={() => openModal('recover')}>Forgot your master password?</button><button className="text-link centered muted" disabled={busy} onClick={signOut}>Use a different account</button></> : phase === 'create' ? <><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2>Your own little vault.</h2><p>One master password is all you’ll need to remember.</p><form onSubmit={e => { e.preventDefault(); run(async active => { if (password !== confirm) throw new Error('The two passwords don’t match.'); const created = await createAccount(session.user.id, name.trim(), password); const snapshot = await fetchSnapshot(session.user.id); const unlocked = await decryptVaults(snapshot, created.identity); if (active()) { setIdentity(created.identity); acceptSnapshot(snapshot, unlocked); setPassword(''); setConfirm(''); setPhase('vault'); } }); }}><label>Your name<input value={name} onChange={e => setName(e.target.value)} maxLength={60} required placeholder="e.g. Mum" autoComplete="given-name" /></label><PasswordInput label="Choose a master password" id="create-password" value={password} onChange={e => setPassword(e.target.value)} minLength={14} autoComplete="new-password" required /><p className="caption">At least 14 characters. Four unrelated words can be easier to remember.</p><PasswordInput label="Repeat master password" id="create-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required /><Button className="primary full" disabled={busy} type="submit">{busy ? 'Creating your vault…' : 'Create my vault'}</Button></form></> : phase === 'code' ? <><span className="eyebrow">CONNECT THIS DEVICE</span><h2>Check your email.</h2><p>Enter the sign-in code sent to <strong>{email}</strong>. This connects your account; your master password unlocks your passwords.</p><form onSubmit={e => { e.preventDefault(); run(async active => { const { data, error: err } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }); if (err) throw err; const snapshot = await fetchSnapshot(data.session.user.id); if (active()) { setSession(data.session); acceptSnapshot(snapshot); setCode(''); setPhase(snapshot.profile ? 'locked' : 'create'); } }); }}><label>Email code<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" required placeholder="Enter your code" /></label><Button className="primary full" disabled={busy} type="submit">{busy ? 'Connecting…' : 'Continue'}</Button></form><button className="text-link centered" disabled={busy} onClick={() => { setPhase('welcome'); setError(''); }}>Change email or request a new code</button></> : <><span className="eyebrow">HELLO, YOU</span><h2>Your passwords,<br />a little easier.</h2>{client ? <><p>Connect with your email to get started on this device.</p><form onSubmit={e => { e.preventDefault(); run(async active => { const { error: err } = await client.auth.signInWithOtp({ email: email.trim() }); if (err) throw err; if (active()) setPhase('code'); }); }}><label>Your email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com" /></label><Button className="primary full" disabled={busy} icon={ArrowRight} type="submit">{busy ? 'Sending code…' : 'Continue with email'}</Button></form></> : <><p>A simple, private password vault for you and Mum. Your sync service needs its one-time setup before real accounts can be used.</p><Button className="primary full" onClick={startDemo} icon={ArrowRight}>Try the sample vault</Button><Button className="full" onClick={() => openModal('connection')} icon={ShieldCheck}>Connect sync service</Button><div className="preview-note">PREVIEW BUILD<span>Explore with sample logins. Security review and live sync checks are still required before storing real passwords.</span></div></>}{client && <button className="text-link centered" onClick={startDemo}>Take a look with sample logins</button>}</>}
      {renderError}<div className="card-reassurance"><ShieldCheck size={15} /> Passwords are encrypted on your device</div>
    </section></main><footer className="welcome-footer"><span>Made for a simpler everyday.</span><span>Build {build} · Build model: GPT-6 · Codex</span></footer></div> : <div className="app-shell">
      <aside className="sidebar"><Brand /><div className="sidebar-vault"><span className="eyebrow">YOUR SPACE</span><div className="account-name"><span className="avatar">{profile.name.charAt(0)}</span><div><strong>{profile.name}</strong><span>{demo ? 'Sample account' : 'Personal account'}</span></div></div></div><nav aria-label="Main navigation">{[['passwords', KeyRound, 'Passwords'], ['family', UsersRound, 'Family access'], ['settings', Settings2, 'Settings']].map(([id, Icon, title]) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); }}><Icon size={20} />{title}{id === 'passwords' && <span className="nav-count">{vault?.entries.length || 0}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="private-note"><ShieldCheck size={21} /><strong>A little peace of mind.</strong><p>Your passwords stay encrypted.<br />Your master password stays yours.</p></div><button className="nav-item" onClick={lock}><LockKeyhole size={19} /> Lock vault</button><span className="build-label">Build {build}<br />Build model: GPT-6 · Codex</span></div></aside>
      <div className="app-content"><header className="app-header"><div className="mobile-brand"><Brand small /></div><div className="breadcrumb">Your space <span>/</span> {tab === 'passwords' ? 'Passwords' : tab === 'family' ? 'Family access' : 'Settings'}</div><div className={`sync-status ${!online && !demo ? 'offline' : ''}`}>{demo ? <><span className="status-dot" /> Sample vault</> : !online ? <><WifiOff size={15} /> Offline · read only</> : <><span className="status-dot" /> Synced & encrypted</>}</div><button className="icon-button mobile-lock" aria-label="Lock vault" onClick={lock}><LockKeyhole size={20} /></button></header>
      {demo && <div className="demo-banner"><span><Sparkles size={15} /> You’re trying sample logins. Nothing here is saved.</span><button onClick={signOut}>Leave sample <ArrowRight size={14} /></button></div>}
      {needRefresh && <div className="update-banner">A new build is ready.<button onClick={() => { lock(); updateServiceWorker(true); }}>Lock & update</button></div>}
      <main className="main-content">{renderError}
      {tab === 'passwords' ? <><section className="page-heading"><div><span className="eyebrow">A LITTLE LESS TO REMEMBER</span><h1>Your passwords.</h1><p>Choose a login. Copy what you need. You’re in.</p></div><Button className="primary" icon={Plus} aria-label="Add login" onClick={() => openModal({ type: 'edit' })} disabled={busy || (!online && !demo)}>Add login</Button></section>
        <div className="vault-toolbar"><div className="vault-picker"><label className="sr-only" htmlFor="vault-select">Choose vault</label><ShieldCheck size={18} /><select id="vault-select" value={vault?.id || ''} onChange={e => selectVault(e.target.value)}>{vaults.map(v => <option value={v.id} key={v.id}>{v.owner_id === profile.id ? 'My vault' : `${v.owner.name}’s vault`}</option>)}</select><ChevronDown size={16} /></div><span className="vault-description">{mine ? 'Your own private collection' : `You’re helping ${vault?.owner.name} with their passwords`}</span><button className="icon-button refresh-button" aria-label="Refresh vaults" onClick={refresh} disabled={busy}><RefreshCw size={17} className={busy ? 'spin' : ''} /></button></div>
        <div className="password-layout"><section className="login-list" aria-label="Saved logins"><div className="list-top"><h2>Saved logins <span>{vault?.entries.length || 0}</span></h2><label className="search-box"><Search size={18} /><input aria-label="Find a login" placeholder="Find a login…" value={query} onChange={e => setQuery(e.target.value)} /></label></div><div className="login-items">{entries.map(item => <button key={item.id} onClick={() => setEntryId(item.id)} className={`login-item ${entry?.id === item.id ? 'selected' : ''}`} aria-pressed={entry?.id === item.id}><ServiceIcon name={item.service} /><span><strong>{item.service}</strong><small>{item.username || 'No username'}</small></span><ArrowRight size={16} /></button>)}{entries.length === 0 && <p className="list-empty">{query ? 'No matching logins.' : 'Your logins will appear here.'}</p>}</div><div className="list-foot"><LockKeyhole size={13} /> Only accessible to you{!mine || helpers.length ? ' and trusted helpers' : ''}</div></section>
        <section className="login-detail" aria-label="Login details"><div className="mobile-service-select"><label htmlFor="service-select">Choose an app or website</label><div className="select-wrap"><select id="service-select" value={entry?.id || ''} onChange={e => setEntryId(e.target.value)}>{!entries.length && <option value="">No logins found</option>}{entries.map(item => <option value={item.id} key={item.id}>{item.service}{entries.filter(e => e.service === item.service).length > 1 ? ` · ${item.username}` : ''}</option>)}</select><ChevronDown size={18} /></div></div>
        {entry ? <><div className="detail-top"><ServiceIcon name={entry.service} large /><div><h2>{entry.service}</h2><span>{mine ? 'My vault' : `${vault.owner.name}’s vault`}<span className="dot-separator">·</span>Login details</span></div><button className="icon-button" aria-label={`Edit ${entry.service} login`} onClick={() => openModal({ type: 'edit', entry })} disabled={busy || (!online && !demo)}><Pencil size={19} /></button></div><div className="credentials"><div className="credential-row"><span className="field-label">USERNAME OR EMAIL</span><div className="credential-value username">{entry.username || 'No username saved'}</div><Button className={`copy-button ${copied === 'Username' ? 'copied' : ''}`} icon={copied === 'Username' ? Check : Copy} onClick={() => copy(entry.username, 'Username')} disabled={!entry.username}>{copied === 'Username' ? 'Copied!' : 'Copy username'}</Button></div><div className="credential-row"><span className="field-label">PASSWORD</span><div className="password-value"><span className={shown ? 'revealed-password' : 'password-dots'}>{shown ? entry.password : '••••••••••••'}</span><button className="icon-button" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide password' : 'Show password'}>{shown ? <EyeOff size={19} /> : <Eye size={19} />}</button></div><Button className={`copy-button ${copied === 'Password' ? 'copied' : ''}`} icon={copied === 'Password' ? Check : Copy} onClick={() => copy(entry.password, 'Password')}>{copied === 'Password' ? 'Copied!' : 'Copy password'}</Button></div></div><div className="paste-tip"><span className="tip-icon"><Copy size={19} /></span><p><strong>Copy here. Paste there.</strong><br />Open {entry.service}, tap the username or password box, then choose Paste.</p></div>{entry.url && /^https:\/\//i.test(entry.url) && <a className="text-link visit-link" href={entry.url} target="_blank" rel="noreferrer">Open {entry.service} <ArrowUpRight size={16} /></a>}{entry.notes && <div className="saved-notes"><span className="field-label">YOUR NOTES</span><p>{entry.notes}</p></div>}</> : <div className="empty-state"><span className="empty-icon"><KeyRound size={32} /></span><h2>{query ? 'Nothing by that name.' : 'A home for your first login.'}</h2><p>{query ? 'Try another name, or clear your search.' : 'Add Google, Facebook or any app you use. We’ll keep the details together.'}</p><Button icon={query ? X : Plus} className="primary" onClick={() => query ? setQuery('') : openModal({ type: 'edit' })} disabled={!query && !demo && !online}>{query ? 'Clear search' : 'Add your first login'}</Button></div>}</section></div>
        <div className="bottom-reassurance"><ShieldCheck size={16} /><span>Encrypted before it leaves your device.</span><span className="right-caption">One master password. Less to remember.</span></div>
      </> : tab === 'family' ? <><section className="page-heading"><div><span className="eyebrow">A HELPING HAND</span><h1>A little help, together.</h1><p>Separate vaults. Support from someone you trust.</p></div><div className="heading-symbol"><UsersRound size={32} /></div></section>{demo ? <div className="notice">This is a preview of family access. Connect the sync service and create both accounts to set it up.</div> : null}<div className="settings-grid"><section className="panel"><div className="panel-icon"><UsersRound /></div><h2>Let someone help you</h2><p>On Mum’s device, paste Tom’s helper code below. This lets him view, add, edit and delete her logins, and restore her access if she forgets her master password.</p><form onSubmit={e => { e.preventDefault(); run(async active => {
          const parts = helperCode.trim().split(':'); if (parts.length !== 3 || parts[0] !== 'FMK1') throw new Error('Paste the complete helper code from the other person’s app.');
          const person = await rpc('fmk_find_helper', { p_id: parts[1] }); if (!person || person.id === profile.id) throw new Error('Use the code from your helper’s separate account.');
          const print = await fingerprint(person.public_key); if (print.replaceAll(' ', '') !== parts[2]) throw new Error('The code doesn’t match this account. Ask your helper for a fresh code.');
          if (active()) setHelperPreview({ ...person, fingerprint: print });
        }); }}><label>Trusted helper’s code<textarea value={helperCode} onChange={e => { setHelperCode(e.target.value); setHelperPreview(null); }} placeholder="FMK1:…" required rows={2} disabled={demo} /></label><Button disabled={busy || demo || !online} type="submit">Check helper</Button></form>{helperPreview && <div className="helper-confirm"><strong>Give {helperPreview.name} access?</strong><p>Compare this fingerprint with their app before continuing:</p><code>{helperPreview.fingerprint}</code><p>This grants full access and recovery. Only choose someone you trust completely. Removing access is not supported in this first version.</p><Button className="primary full" disabled={busy} onClick={() => run(async active => {
          const own = vaults.find(v => v.owner_id === profile.id);
          if (!own) throw new Error('Your own vault could not be found.');
          await rpc('fmk_grant_helper', { p_vault_id: own.id, p_helper_id: helperPreview.id, p_public_key: helperPreview.public_key,
            p_wrapped_key: await wrapFor(helperPreview.public_key, own.rawKey, `vault:${own.id}:${helperPreview.id}`),
            p_recovery_key: await wrapFor(helperPreview.public_key, identity.rawAccountKey, `recovery:${profile.id}:${helperPreview.id}`),
          });
          const snapshot = await fetchSnapshot(profile.id);
          if (active()) { setHelpers(snapshot.helpers); setHelperPreview(null); setHelperCode(''); note('Helper access is ready. Ask them to refresh their vaults.'); }
        })}>Give full access & recovery</Button></div>}{helpers.length > 0 && <div className="helper-list"><span className="field-label">PEOPLE WHO CAN HELP YOU</span>{helpers.map(h => <p key={h.id}><CheckCircle2 size={16} /> {h.name} · full access & recovery</p>)}</div>}</section>
        <section className="panel"><div className="panel-icon"><ShieldCheck /></div><h2>Your helper code</h2><p>Tom: copy this code from your account and enter it on Mum’s device. Sharing your code does not give Mum access to your vault.</p><Button icon={Copy} disabled={demo || busy} onClick={() => run(async active => { const print = await fingerprint(profile.public_key); if (active()) await copy(`FMK1:${profile.id}:${print.replaceAll(' ', '')}`, 'Helper code'); })}>Copy my helper code</Button><Button className="full spaced" disabled={demo || busy} onClick={() => run(async active => { const print = await fingerprint(profile.public_key); if (active()) note(`Your fingerprint: ${print}`); })}>Show my fingerprint</Button><div className="panel-divider" /><h2>Help someone get back in</h2><p>Select a shared vault to create an encrypted recovery file. Give the file and its separate code directly to the vault owner.</p>{vaults.filter(v => v.owner_id !== profile.id).map(v => <div className="recovery-person" key={v.id}><span className="avatar">{v.owner.name.charAt(0)}</span><strong>{v.owner.name}’s vault</strong><Button disabled={demo || busy || !online} onClick={() => run(async active => {
          const raw = await unwrapFor(identity.privateKey, v.recovery_key, `recovery:${v.owner_id}:${profile.id}`);
          const result = await makeRecovery(raw, v.owner_id); raw.fill(0);
          if (active()) { setRecovery({ ...result, name: v.owner.name }); setModal('recovery-output'); }
        })}>Help recover</Button></div>)}{!vaults.some(v => v.owner_id !== profile.id) && <p className="caption">Shared vaults will appear here once their owner grants access.</p>}</section></div></> : <><section className="page-heading"><div><span className="eyebrow">JUST THE WAY YOU LIKE IT</span><h1>Make yourself at home.</h1><p>A few simple settings. Everything in its place.</p></div></section><div className="settings-grid"><section className="panel"><div className="panel-icon"><Fingerprint /></div><h2>Unlock, your way</h2><p>Use your master password, or set up secure device unlock with Windows Hello, a fingerprint or your device’s screen lock where supported.</p><Button disabled={demo || busy || !deviceUnlockAvailable()} icon={Fingerprint} onClick={() => run(async active => {
          if (deviceReady) { removeDeviceUnlock(profile.id); setDeviceReady(false); note('Device unlock removed from this browser.'); return; }
          await enableDeviceUnlock(profile, identity); if (active()) { setDeviceReady(true); note('Secure device unlock is ready on this device.'); }
        })}>{deviceReady ? 'Remove device unlock' : 'Set up device unlock'}</Button><p className="caption">Your master password always remains available. Device support varies.</p><div className="panel-divider" /><h3>Automatic locking</h3><p>The vault locks after 5 minutes without activity, or 1 minute in the background. Revealed passwords hide after 15 seconds.</p><Button icon={LockKeyhole} onClick={lock}>Lock now</Button></section><section className="panel"><div className="panel-icon"><Download /></div><h2>Keep a spare copy</h2><p>Save an encrypted backup of the selected vault. Keep the backup password somewhere safe.</p><label>Vault to back up or import into<select value={vault?.id || ''} onChange={e => selectVault(e.target.value)}>{vaults.map(v => <option value={v.id} key={v.id}>{v.owner_id === profile.id ? 'My vault' : `${v.owner.name}’s vault`}</option>)}</select></label><div className="button-row"><Button disabled={demo || busy} icon={Download} onClick={() => openModal('export')}>Save backup</Button><Button disabled={demo || busy || !online} onClick={() => openModal('import')}>Import backup</Button></div><div className="panel-divider" /><h3>Keep it close</h3><p>Install Forget Me Knot for a home-screen icon on your phone or a separate window on your PC.</p><Button icon={MonitorSmartphone} onClick={install}>Install app</Button></section><section className="panel"><h2>Your connection</h2><p>{demo ? 'Sample mode — no accounts or cloud storage are connected.' : getConfig()?.url}</p><p className="caption">Real accounts need the sync service. Offline access uses the last encrypted copy on this device and is read only.</p><Button disabled={busy} icon={LogOut} onClick={signOut}>{demo ? 'Leave sample vault' : 'Sign out & forget this device'}</Button></section><section className="panel"><h2>About this build</h2><p>Forget Me Knot · {build}<br />Build model: GPT-6 · Codex</p><p className="caption">First release. Independent security review and checks on your actual devices are required before relying on this app for real passwords. Clipboard history may retain copied details; use only on trusted devices.</p><button className="text-link" onClick={() => openModal('help')}>Using your vault <ArrowRight size={16} /></button></section></div></>}
      </main><footer className="app-footer"><span>Less remembering. More living.</span><span>Build {build} · Build model: GPT-6 · Codex</span></footer></div>
    </div>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={20} />{toast}</div>}
    {modal === 'connection' && <Connection onClose={closeModal} />}
    {modal?.type === 'edit' && <EntryEditor key={modal.entry?.id || 'new'} entry={modal.entry} busy={busy} error={error} demo={demo} onClose={closeModal} onSave={draft => run(async active => { if (!draft.service.trim()) throw new Error('Choose a name for this login.'); const next = modal.entry ? vault.entries.map(e => e.id === draft.id ? draft : e) : [...vault.entries, draft]; await persist(next, active); if (active()) { setEntryId(draft.id); setQuery(''); closeModal(); note(demo ? 'Sample login updated for this preview.' : 'Login saved and synced.'); } })} onDelete={id => run(async active => { await persist(vault.entries.filter(e => e.id !== id), active); if (active()) { closeModal(); note('Login deleted.'); } })} />}
    {modal === 'recover' && <RecoveryForm profile={profile} busy={busy} error={error} onClose={closeModal} onRecover={(file, recoveryCode, nextPassword, nextConfirm) => run(async active => {
      if (nextPassword !== nextConfirm) throw new Error('The two passwords don’t match.');
      const snapshot = await fetchSnapshot(profile.id); const recovered = await readRecovery(await readFile(file), recoveryCode, snapshot.profile);
      const master = await wrapAccount(nextPassword, recovered.rawAccountKey, profile.id);
      await rpc('fmk_change_master', { p_old_master: snapshot.profile.master, p_master: master });
      removeDeviceUnlock(profile.id);
      const fresh = await fetchSnapshot(profile.id); const unlocked = await decryptVaults(fresh, recovered);
      if (active()) { setIdentity(recovered); acceptSnapshot(fresh, unlocked); setPhase('vault'); closeModal(); note('Your new master password is ready. Sign out other devices you no longer trust.'); }
    })} />}
    {modal === 'recovery-output' && recovery && <Modal title={`Help ${recovery.name} get back in`} onClose={closeModal}><p>Give this file to {recovery.name}, then share the code separately. They can choose “Forgot your master password?” after connecting their account.</p><Button className="primary full" icon={Download} onClick={() => download(recovery.file, 'forget-me-knot-recovery.json')}>Download recovery file</Button><label>Recovery code<input readOnly value={recovery.code} /></label><Button icon={Copy} onClick={() => copy(recovery.code, 'Recovery code')}>Copy recovery code</Button><p className="notice">Keep both private. This file and code together restore account access. They remain valid after a master-password change; securely remove your copies after use.</p></Modal>}
    {(modal === 'export' || modal === 'import') && <BackupDialog kind={modal} busy={busy} error={error} onClose={closeModal} onExport={(pw, pwConfirm) => run(async active => {
      if (pw !== pwConfirm) throw new Error('The two passwords don’t match.');
      const id = crypto.randomUUID(); const raw = random(); const master = await wrapAccount(pw, raw, id); const body = await seal(await aes(raw), vault.entries, `backup:${id}`); raw.fill(0);
      if (active()) { download({ format: 'fmk-backup-v1', id, master, body }, `forget-me-knot-backup-${new Date().toISOString().slice(0, 10)}.json`); closeModal(); note('Encrypted backup downloaded.'); }
    })} onImport={(file, pw) => run(async active => {
      const backup = await readFile(file); if (backup.format !== 'fmk-backup-v1' || backup.master?.iterations !== 600000) throw new Error('Choose a supported Forget Me Knot backup.');
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(backup.master.salt), iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const raw = unb64(await open(key, backup.master.wrapped, `master:${backup.id}`));
      const restored = validateEntries(await open(await aes(raw), backup.body, `backup:${backup.id}`)); raw.fill(0);
      await persist([...vault.entries, ...restored.map(e => ({ ...e, id: crypto.randomUUID() }))], active);
      if (active()) { closeModal(); note(`${restored.length} logins imported and synced.`); }
    })} />}
    {modal === 'help' && <Modal title="A little help" onClose={closeModal}><ol className="help-steps"><li><strong>Unlock your vault.</strong><p>Use your master password, or device unlock if you’ve set it up.</p></li><li><strong>Choose your app or website.</strong><p>Find Google, Facebook, Outlook or any login you’ve saved.</p></li><li><strong>Copy. Switch. Paste.</strong><p>Tap Copy username, switch to the app and paste. Come back and do the same for your password. On a PC, use Ctrl+V. On a phone, press and hold the text box, then tap Paste.</p></li></ol><p className="notice">Keep access to your email outside this vault, so you can connect a new device. If you forget your master password, a trusted helper must already have been set up, or you’ll need an encrypted backup and its password.</p>{!client && <Button className="primary full" onClick={() => setModal('connection')}>Connection help</Button>}</Modal>}
  </>;
}
