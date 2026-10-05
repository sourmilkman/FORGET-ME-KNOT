import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldCheck, UsersRound, Settings2, Search, Plus, Copy, Check, Eye, EyeOff, LockKeyhole, LogOut, ArrowRight, ArrowUpRight, X, RefreshCw, Download, Fingerprint, ChevronDown, CircleHelp, Trash2, Pencil, Sparkles, WifiOff, MonitorSmartphone, CheckCircle2 } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { aes, seal, open, random, unb64, wrapAccount, unlockAccount, generatePassword, validateEntries } from './crypto.js';
import { DEFAULT_REPO, getConfig, saveConfig, clearConfig, consumeSetupLink, makeSetupLink, fetchSnapshot, decryptVaults, createAccount, createFamilyAccount, resetFamilyMaster, saveVault, sampleVaults, forgetCache, offlineAccount } from './data.js';
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
let setupError = '';
try { consumeSetupLink(); } catch (err) { setupError = `That setup link didn’t work: ${err.message}`; }
// A setup link opened while the app is already open only changes the #fragment, so pick it up and restart.
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#setup=')) { try { consumeSetupLink(); } catch { /* shown after reload */ } location.reload(); } });
function ConnectForm({ busy, onConnected }) {
  const [repo, setRepo] = useState(DEFAULT_REPO); const [account, setAccount] = useState('tom'); const [token, setToken] = useState(''); const [error, setError] = useState('');
  return <form onSubmit={e => { e.preventDefault(); try { onConnected(saveConfig({ repo, account, token })); } catch (err) { setError(err.message); } }}>
    <label>Your account name<input value={account} onChange={e => setAccount(e.target.value)} required maxLength={32} autoCapitalize="none" spellCheck={false} placeholder="e.g. tom" /></label>
    <PasswordInput label="GitHub token for this device" id="connect-token" value={token} onChange={e => setToken(e.target.value)} required autoComplete="off" placeholder="github_pat_…" />
    <details className="extra-fields"><summary>Vault repository <ChevronDown size={16} /></summary><label>Private repository<input value={repo} onChange={e => setRepo(e.target.value)} required spellCheck={false} autoCapitalize="none" /></label></details>
    <p className="caption">The token stays on this device. It only lets the app fetch and save encrypted files. <a className="text-link" href="https://github.com/sourmilkman/FORGET-ME-KNOT/blob/main/SETUP.md" target="_blank" rel="noreferrer">Setup guide <ArrowUpRight size={14} /></a></p>
    {error && <p className="error" role="alert">{error}</p>}
    <Button className="primary full" type="submit" disabled={busy} icon={ShieldCheck}>Connect this device</Button>
  </form>;
}
function FamilyCreate({ busy, onCreate }) {
  const [name, setName] = useState('Mum'); const [account, setAccount] = useState('mum'); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  return <form onSubmit={e => { e.preventDefault(); onCreate(name.trim(), account.trim().toLowerCase(), password, confirm, () => { setPassword(''); setConfirm(''); }); }}>
    <label>Their name<input value={name} onChange={e => setName(e.target.value)} maxLength={60} required /></label>
    <label>Account name<input value={account} onChange={e => setAccount(e.target.value)} maxLength={32} required autoCapitalize="none" spellCheck={false} /></label>
    <PasswordInput label="Their master password" id="family-password" value={password} onChange={e => setPassword(e.target.value)} minLength={14} autoComplete="new-password" required />
    <PasswordInput label="Repeat their master password" id="family-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required />
    <p className="caption">At least 14 characters. Tell them this password in person or by phone, never in the same message as their setup link.</p>
    <Button className="primary full" type="submit" disabled={busy} icon={Plus}>{busy ? 'Creating…' : `Create ${name.trim() || 'their'} vault`}</Button>
  </form>;
}
function SetupLinkForm({ busy, account, onMake }) {
  const [token, setToken] = useState('');
  return <form onSubmit={e => { e.preventDefault(); onMake(token, () => setToken('')); }}>
    <PasswordInput label={`${account}’s read-only token`} id="setup-token" value={token} onChange={e => setToken(e.target.value)} required autoComplete="off" placeholder="github_pat_…" />
    <Button className="full" type="submit" disabled={busy} icon={Copy}>Copy setup link</Button>
  </form>;
}
function ResetForm({ vault, busy, error, onReset, onClose }) {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  return <Modal title={`Reset ${vault.owner.name}’s master password`} onClose={onClose} busy={busy}><p>Choose a new master password for {vault.owner.name}. Their logins, fingerprint unlock and your access stay as they are.</p><form onSubmit={e => { e.preventDefault(); onReset(password, confirm); }}><PasswordInput id="reset-password" label="New master password" minLength={14} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required /><PasswordInput id="reset-confirm" label="Repeat new password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required /><p className="caption">At least 14 characters. Tell {vault.owner.name} by phone or in person.</p>{error && <p className="error" role="alert">{error}</p>}<Button className="primary full" disabled={busy} type="submit">{busy ? 'Saving…' : 'Set new master password'}</Button></form></Modal>;
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
function BackupDialog({ kind, busy, error, onClose, onExport, onImport }) {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [file, setFile] = useState(null);
  return <Modal title={kind === 'export' ? 'Save an encrypted backup' : 'Import a backup'} onClose={onClose} busy={busy}><p>{kind === 'export' ? 'Choose a password for this backup file. Keep it somewhere safe: it is needed to open the backup.' : 'Logins from this backup will be added to the selected vault. Existing logins will be kept.'}</p><form onSubmit={e => { e.preventDefault(); kind === 'export' ? onExport(password, confirm) : onImport(file, password); }}>{kind === 'import' && <label>Backup file<input type="file" accept=".json,application/json" required onChange={e => setFile(e.target.files[0])} /></label>}<PasswordInput label="Backup password" id="backup-password" value={password} onChange={e => setPassword(e.target.value)} minLength={kind === 'export' ? 14 : undefined} required autoComplete="off" />{kind === 'export' && <PasswordInput label="Repeat backup password" id="backup-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="off" />}{error && <p className="error" role="alert">{error}</p>}<Button className="primary full" disabled={busy} type="submit">{busy ? 'Working…' : kind === 'export' ? 'Download encrypted backup' : 'Add logins from backup'}</Button></form></Modal>;
}

export default function App() {
  const [phase, setPhase] = useState(getConfig() ? 'loading' : 'welcome');
  const [config, setConfig] = useState(getConfig); const [profile, setProfile] = useState(null); const [identity, setIdentity] = useState(null);
  const [vaults, setVaults] = useState([]); const [vaultId, setVaultId] = useState(''); const [entryId, setEntryId] = useState('');
  const [helpers, setHelpers] = useState([]); const [tab, setTab] = useState('passwords'); const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(setupError); const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null); const [demo, setDemo] = useState(false); const [offline, setOffline] = useState(false);
  const [showMumSetup, setShowMumSetup] = useState(false);
  const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false); const [copied, setCopied] = useState(''); 
  const [installEvent, setInstallEvent] = useState(null); const [deviceReady, setDeviceReady] = useState(false);
  const epoch = useRef(0); const lastActive = useRef(Date.now()); const inFlight = useRef(false); const activeAccount = useRef(null);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const vault = vaults.find(v => v.id === vaultId) || vaults[0];
  const entries = (vault?.entries || []).filter(e => `${e.service} ${e.username}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.service.localeCompare(b.service));
  const entry = entries.find(e => e.id === entryId) || entries[0];
  const mine = vault?.owner_id === profile?.id;
  const shared = vaults.filter(v => v.owner_id !== profile?.id);
  const online = !offline && navigator.onLine;
  const note = useCallback(text => setToast(text), []);
  const lock = useCallback(() => {
    epoch.current++; inFlight.current = false; setBusy(false); setIdentity(null); setVaults([]); setHelpers([]); setPassword(''); setConfirm(''); setModal(null); setShown(false); setCopied(''); setError(''); setToast(''); setQuery(''); setShowMumSetup(false);
    setPhase(prev => prev === 'vault' ? 'locked' : prev);
  }, []);
  const run = async task => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); const current = epoch.current;
    const active = () => current === epoch.current;
    try { await task(active); } catch (err) { if (active()) setError(err.name === 'OperationError' ? 'That password didn’t unlock the vault. Please try again.' : err.name === 'NotAllowedError' ? 'Device unlock was cancelled or is unavailable. You can use your master password.' : err.message || 'Something went wrong. Please try again.'); }
    finally { if (active()) { inFlight.current = false; setBusy(false); } }
  };
  const acceptSnapshot = (snapshot, unlocked) => {
    activeAccount.current = snapshot.profile?.id || null;
    setProfile(snapshot.profile); setHelpers(snapshot.helpers || []); setOffline(snapshot.offline);
    if (unlocked) setVaults(unlocked);
  };
  useEffect(() => {
    if (!config) return;
    let alive = true;
    const cached = offlineAccount();
    if (cached?.profile?.id === config.account) { acceptSnapshot(cached); setPhase('locked'); return; }
    fetchSnapshot(config.account, true).then(snapshot => { if (alive) { acceptSnapshot(snapshot); setPhase(snapshot.profile ? 'locked' : 'create'); } })
      .catch(err => { if (alive) { setError(err.message); setPhase('welcome'); } });
    return () => { alive = false; };
  }, [config]);
  useEffect(() => { setDeviceReady(profile ? hasDeviceUnlock(profile.id) : false); }, [profile]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { setShown(false); setCopied(''); }, [entry?.id, vault?.id]);
  useEffect(() => { if (!shown) return; const t = setTimeout(() => setShown(false), 15000); return () => clearTimeout(t); }, [shown]);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(''), 2500); return () => clearTimeout(t); }, [copied]);
  useEffect(() => {
    if (!showMumSetup || !profile) return;
    const shared = vaults.find(v => v.owner_id !== profile.id);
    if (shared) { setVaultId(shared.id); setEntryId(''); setShowMumSetup(false); }
  }, [showMumSetup, vaults, profile]);
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
    const snapshot = await fetchSnapshot(config.account, true);
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
    if (demo) { lock(); setDemo(false); setProfile(null); setPhase(config ? 'loading' : 'welcome'); if (config) setConfig({ ...config }); return; }
    clearConfig(); if (id) { forgetCache(id); removeDeviceUnlock(id); }
    lock(); setProfile(null); setConfig(null); setPhase('welcome');
  });
  const closeModal = () => { setModal(null); setError(''); };
  const openModal = value => { setError(''); setModal(value); };
  const selectVault = id => { setVaultId(id); setEntryId(''); setQuery(''); setError(''); setShown(false); setShowMumSetup(false); };
  const install = async () => {
    if (installEvent) { await installEvent.prompt(); setInstallEvent(null); }
    else note('In Chrome or Edge, open the browser menu and choose Install app or Add to Home screen.');
  };
  const renderError = !modal && error && <div className="error global-error" role="alert">{error}<button aria-label="Dismiss error" className="icon-button" onClick={() => setError('')}><X size={18} /></button></div>;

  return <>
    {needRefresh && phase !== 'vault' && <div className="update-banner">A new build is ready.<button onClick={() => { lock(); updateServiceWorker(true); }}>Update app</button></div>}
    {phase !== 'vault' ? <div className="welcome-shell"><header className="welcome-header"><Brand /><button className="text-link" onClick={() => openModal('help')}><CircleHelp size={17} /> A little help</button></header><main className="welcome-main"><section className="welcome-story"><span className="eyebrow"><span className="status-dot" /> YOUR PASSWORDS. YOUR PEACE OF MIND.</span><h1>One less thing<br />to <em>remember.</em></h1><p>A safe little home for your passwords.<br />Easy for you. Easy for the people you help.</p><div className="knot-art" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" /><span className="art-tag"><ShieldCheck size={16} /> Yours, and only yours</span></div><div className="welcome-benefits"><span><KeyRound /> One master password</span><span><MonitorSmartphone /> At home. On the go.</span></div></section><section className="welcome-card">
      <div className="lock-emblem"><LockKeyhole size={26} /></div>
      {phase === 'loading' ? <><h2>Connecting your vault…</h2><p>Just a moment.</p></> : phase === 'locked' ? <><span className="eyebrow">YOUR PRIVATE SPACE</span><h2>Welcome back{profile?.name ? `, ${profile.name}` : ''}.</h2><p>Unlock your vault to find what you need.</p><form onSubmit={e => { e.preventDefault(); unlock(false); }}><PasswordInput id="unlock-password" label="Master password" value={password} onChange={e => setPassword(e.target.value)} required={!demo} autoComplete="current-password" autoFocus /><Button className="primary full" type="submit" disabled={busy} icon={ArrowRight}>{busy ? 'Unlocking…' : demo ? 'Reopen sample vault' : 'Unlock my vault'}</Button></form>{deviceReady && !demo && <Button className="full" icon={Fingerprint} disabled={busy} onClick={() => unlock(true)}>Use device unlock</Button>}<p className="caption locked-switch-note">The My passwords / Mum’s passwords switch appears after you unlock.</p><button className="text-link centered" disabled={busy || demo} onClick={() => openModal('forgot')}>Forgot your master password?</button><button className="text-link centered muted" disabled={busy} onClick={signOut}>Use a different account</button></> : phase === 'create' ? <><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2>Your own little vault.</h2><p>One master password is all you’ll need to remember.</p><form onSubmit={e => { e.preventDefault(); run(async active => { if (password !== confirm) throw new Error('The two passwords don’t match.'); const created = await createAccount(config.account, name.trim(), password); const snapshot = await fetchSnapshot(config.account); const unlocked = await decryptVaults(snapshot, created.identity); if (active()) { setIdentity(created.identity); acceptSnapshot(snapshot, unlocked); setPassword(''); setConfirm(''); setPhase('vault'); } }); }}><label>Your name<input value={name} onChange={e => setName(e.target.value)} maxLength={60} required placeholder="e.g. Mum" autoComplete="given-name" /></label><PasswordInput label="Choose a master password" id="create-password" value={password} onChange={e => setPassword(e.target.value)} minLength={14} autoComplete="new-password" required /><p className="caption">At least 14 characters. Four unrelated words can be easier to remember.</p><PasswordInput label="Repeat master password" id="create-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required /><Button className="primary full" disabled={busy} type="submit">{busy ? 'Creating your vault…' : 'Create my vault'}</Button></form></> : <><span className="eyebrow">HELLO, YOU</span><h2>Your passwords,<br />a little easier.</h2><p>Connect this device to your private vault repository. You only do this once per device.</p><ConnectForm busy={busy} onConnected={value => { setError(''); setConfig(value); setPhase('loading'); }} /><button className="text-link centered" onClick={startDemo}>Take a look with sample logins</button></>}
      {renderError}<div className="card-reassurance"><ShieldCheck size={15} /> Passwords are encrypted on your device</div>
    </section></main><footer className="welcome-footer"><span>Made for a simpler everyday.</span><span>Build {build} · Build model: GPT-6 · Codex</span></footer></div> : <div className={`app-shell ${mine && !showMumSetup ? 'theme-tom' : 'theme-mum'}`}>
      <aside className="sidebar"><Brand /><div className="sidebar-vault"><span className="eyebrow">YOUR SPACE</span><div className="account-name"><span className="avatar">{profile.name.charAt(0)}</span><div><strong>{profile.name}</strong><span>{demo ? 'Sample account' : 'Personal account'}</span></div></div></div><nav aria-label="Main navigation">{[['passwords', KeyRound, 'Passwords'], ['family', UsersRound, 'Family access'], ['settings', Settings2, 'Settings']].map(([id, Icon, title]) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); }}><Icon size={20} />{title}{id === 'passwords' && <span className="nav-count">{vault?.entries.length || 0}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="private-note"><ShieldCheck size={21} /><strong>A little peace of mind.</strong><p>Your passwords stay encrypted.<br />Your master password stays yours.</p></div><button className="nav-item" onClick={lock}><LockKeyhole size={19} /> Lock vault</button><span className="build-label">Build {build}<br />Build model: GPT-6 · Codex</span></div></aside>
      <div className="app-content"><header className="app-header"><div className="mobile-brand"><Brand small /></div><div className="breadcrumb">Your space <span>/</span> {tab === 'passwords' ? 'Passwords' : tab === 'family' ? 'Family access' : 'Settings'}</div><div className={`sync-status ${!online && !demo ? 'offline' : ''}`}>{demo ? <><span className="status-dot" /> Sample vault</> : !online ? <><WifiOff size={15} /> Offline · read only</> : <><span className="status-dot" /> Synced & encrypted</>}</div><button className="icon-button mobile-lock" aria-label="Lock vault" onClick={lock}><LockKeyhole size={20} /></button></header>
      {demo && <div className="demo-banner"><span><Sparkles size={15} /> You’re trying sample logins. Nothing here is saved.</span><button onClick={signOut}>Leave sample <ArrowRight size={14} /></button></div>}
      {needRefresh && <div className="update-banner">A new build is ready.<button onClick={() => { lock(); updateServiceWorker(true); }}>Lock & update</button></div>}
      <main className="main-content">{renderError}
      {tab === 'passwords' ? <><section className="page-heading"><div><span className="eyebrow">A LITTLE LESS TO REMEMBER</span><h1>{showMumSetup ? 'Mum’s passwords.' : 'Your passwords.'}</h1><p>{showMumSetup ? 'Her vault stays separate from yours.' : 'Choose a login. Copy what you need. You’re in.'}</p></div>{!showMumSetup && <Button className="primary" icon={Plus} aria-label="Add login" onClick={() => openModal({ type: 'edit' })} disabled={busy || (!online && !demo)}>Add login</Button>}</section>
        <div className="vault-toolbar"><div className="vault-switch" role="group" aria-label="Choose whose passwords to manage">{vaults.filter(v => v.owner_id === profile.id).map(v => { const selected = !showMumSetup && v.id === vault?.id; return <button type="button" key={v.id} className={selected ? 'active' : ''} aria-pressed={selected} onClick={() => selectVault(v.id)}>My passwords</button>; })}{vaults.filter(v => v.owner_id !== profile.id).map(v => { const selected = !showMumSetup && v.id === vault?.id; return <button type="button" key={v.id} className={selected ? 'active' : ''} aria-pressed={selected} onClick={() => selectVault(v.id)}>{v.owner.name}’s passwords</button>; })}{!vaults.some(v => v.owner_id !== profile.id) && <button type="button" className={showMumSetup ? 'active' : ''} aria-pressed={showMumSetup} onClick={() => { setShowMumSetup(true); setError(''); }}>Mum’s passwords</button>}</div><span className="vault-description">{showMumSetup ? 'Not connected yet' : mine ? 'Your own private collection' : `You’re helping ${vault?.owner.name} with their passwords`}</span><button className="icon-button refresh-button" aria-label="Refresh vaults" onClick={refresh} disabled={busy}><RefreshCw size={17} className={busy ? 'spin' : ''} /></button></div>
        {showMumSetup ? <section className="mum-setup-card"><span className="setup-orb"><UsersRound size={30} /></span><h2>Mum’s vault isn’t set up yet.</h2><p>Create it from Family access. Her passwords stay in a separate encrypted vault, and you can connect her phone with a link — no visit needed.</p><div className="setup-actions"><Button className="primary" icon={UsersRound} onClick={() => setTab('family')}>Set up Mum’s vault</Button></div></section> : <div className="password-layout"><section className="login-list" aria-label="Saved logins"><div className="list-top"><h2>Saved logins <span>{vault?.entries.length || 0}</span></h2><label className="search-box"><Search size={18} /><input aria-label="Find a login" placeholder="Find a login…" value={query} onChange={e => setQuery(e.target.value)} /></label></div><div className="login-items">{entries.map(item => <button key={item.id} onClick={() => setEntryId(item.id)} className={`login-item ${entry?.id === item.id ? 'selected' : ''}`} aria-pressed={entry?.id === item.id}><ServiceIcon name={item.service} /><span><strong>{item.service}</strong><small>{item.username || 'No username'}</small></span><ArrowRight size={16} /></button>)}{entries.length === 0 && <p className="list-empty">{query ? 'No matching logins.' : 'Your logins will appear here.'}</p>}</div><div className="list-foot"><LockKeyhole size={13} /> Only accessible to you{!mine || helpers.length ? ' and trusted helpers' : ''}</div></section>
        <section className="login-detail" aria-label="Login details"><div className="mobile-service-select"><label htmlFor="service-select">Choose an app or website</label><div className="select-wrap"><select id="service-select" value={entry?.id || ''} onChange={e => setEntryId(e.target.value)}>{!entries.length && <option value="">No logins found</option>}{entries.map(item => <option value={item.id} key={item.id}>{item.service}{entries.filter(e => e.service === item.service).length > 1 ? ` · ${item.username}` : ''}</option>)}</select><ChevronDown size={18} /></div></div>
        {entry ? <><div className="detail-top"><ServiceIcon name={entry.service} large /><div><h2>{entry.service}</h2><span>{mine ? 'My vault' : `${vault.owner.name}’s vault`}<span className="dot-separator">·</span>Login details</span></div><button className="icon-button" aria-label={`Edit ${entry.service} login`} onClick={() => openModal({ type: 'edit', entry })} disabled={busy || (!online && !demo)}><Pencil size={19} /></button></div><div className="credentials"><div className="credential-row"><span className="field-label">USERNAME OR EMAIL</span><div className="credential-value username">{entry.username || 'No username saved'}</div><Button className={`copy-button ${copied === 'Username' ? 'copied' : ''}`} icon={copied === 'Username' ? Check : Copy} onClick={() => copy(entry.username, 'Username')} disabled={!entry.username}>{copied === 'Username' ? 'Copied!' : 'Copy username'}</Button></div><div className="credential-row"><span className="field-label">PASSWORD</span><div className="password-value"><span className={shown ? 'revealed-password' : 'password-dots'}>{shown ? entry.password : '••••••••••••'}</span><button className="icon-button" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide password' : 'Show password'}>{shown ? <EyeOff size={19} /> : <Eye size={19} />}</button></div><Button className={`copy-button ${copied === 'Password' ? 'copied' : ''}`} icon={copied === 'Password' ? Check : Copy} onClick={() => copy(entry.password, 'Password')}>{copied === 'Password' ? 'Copied!' : 'Copy password'}</Button></div></div><div className="paste-tip"><span className="tip-icon"><Copy size={19} /></span><p><strong>Copy here. Paste there.</strong><br />Open {entry.service}, tap the username or password box, then choose Paste.</p></div>{entry.url && /^https:\/\//i.test(entry.url) && <a className="text-link visit-link" href={entry.url} target="_blank" rel="noreferrer">Open {entry.service} <ArrowUpRight size={16} /></a>}{entry.notes && <div className="saved-notes"><span className="field-label">YOUR NOTES</span><p>{entry.notes}</p></div>}</> : <div className="empty-state"><span className="empty-icon"><KeyRound size={32} /></span><h2>{query ? 'Nothing by that name.' : 'A home for your first login.'}</h2><p>{query ? 'Try another name, or clear your search.' : 'Add Google, Facebook or any app you use. We’ll keep the details together.'}</p><Button icon={query ? X : Plus} className="primary" onClick={() => query ? setQuery('') : openModal({ type: 'edit' })} disabled={!query && !demo && !online}>{query ? 'Clear search' : 'Add your first login'}</Button></div>}</section></div>}
        <div className="bottom-reassurance"><ShieldCheck size={16} /><span>Encrypted before it leaves your device.</span><span className="right-caption">One master password. Less to remember.</span></div>
      </> : tab === 'family' ? <><section className="page-heading"><div><span className="eyebrow">A HELPING HAND</span><h1>A little help, together.</h1><p>Separate vaults. Support from someone you trust.</p></div><div className="heading-symbol"><UsersRound size={32} /></div></section>{demo ? <div className="notice">This is a preview of family access. Connect this device and create your account to set it up for real.</div> : null}<div className="settings-grid"><section className="panel"><div className="panel-icon"><UsersRound /></div><h2>Set up someone you help</h2><p>Create a separate vault for Mum (or anyone you look after). You get full access and can reset their master password if they forget it. They can never see your vault.</p>{shared.length ? <div className="helper-list"><span className="field-label">VAULTS YOU LOOK AFTER</span>{shared.map(v => <p key={v.id}><CheckCircle2 size={16} /> {v.owner.name} · full access & recovery</p>)}</div> : null}<details className="extra-fields" open={!shared.length && !demo}><summary>Create a new family vault <ChevronDown size={16} /></summary><FamilyCreate busy={busy || demo || !online} onCreate={(newName, account, pw, pwConfirm, done) => run(async active => {
          if (pw !== pwConfirm) throw new Error('The two passwords don’t match.');
          await createFamilyAccount({ profile, identity }, account, newName, pw);
          const snapshot = await fetchSnapshot(profile.id); const unlocked = await decryptVaults(snapshot, identity);
          if (active()) { acceptSnapshot(snapshot, unlocked); done(); note(`${newName}’s vault is ready. Next, send their setup link.`); }
        })} /></details>{helpers.length > 0 && <div className="helper-list"><span className="field-label">PEOPLE WHO CAN HELP YOU</span>{helpers.map(h => <p key={h.id}><CheckCircle2 size={16} /> {h.name} · full access & recovery</p>)}</div>}</section>
        <section className="panel"><div className="panel-icon"><MonitorSmartphone /></div><h2>Connect their phone</h2><p>Create a <strong>read-only</strong> GitHub token for them (see the setup guide), paste it here and send them the link. Opening it once connects their app — no visit needed.</p>{shared.map(v => <div className="recovery-person" key={v.id}><span className="avatar">{v.owner.name.charAt(0)}</span><strong>{v.owner.name}</strong><SetupLinkForm busy={busy || demo} account={v.owner.name} onMake={(token, done) => run(async () => {
          const link = makeSetupLink(new URL(`${import.meta.env.BASE_URL}mum.html`, location.origin).href, { repo: config.repo, account: v.owner_id, token });
          await copy(link, 'Setup link'); done();
        })} /></div>)}{!shared.length && <p className="caption">Create a family vault first.</p>}<p className="caption">Send the link by text or WhatsApp. Send their master password separately, by phone.</p><div className="panel-divider" /><h2>Help someone get back in</h2><p>If they forget their master password, set a new one for them here.</p>{shared.map(v => <div className="recovery-person" key={v.id}><span className="avatar">{v.owner.name.charAt(0)}</span><strong>{v.owner.name}’s vault</strong><Button disabled={demo || busy || !online || !v.recovery_key} onClick={() => openModal({ type: 'reset', vault: v })}>Reset password</Button></div>)}{!shared.length && <p className="caption">Vaults you look after will appear here.</p>}</section></div></> : <><section className="page-heading"><div><span className="eyebrow">JUST THE WAY YOU LIKE IT</span><h1>Make yourself at home.</h1><p>A few simple settings. Everything in its place.</p></div></section><div className="settings-grid"><section className="panel"><div className="panel-icon"><Fingerprint /></div><h2>Unlock, your way</h2><p>Use your master password, or set up secure device unlock with Windows Hello, a fingerprint or your device’s screen lock where supported.</p><Button disabled={demo || busy || !deviceUnlockAvailable()} icon={Fingerprint} onClick={() => run(async active => {
          if (deviceReady) { removeDeviceUnlock(profile.id); setDeviceReady(false); note('Device unlock removed from this browser.'); return; }
          await enableDeviceUnlock(profile, identity); if (active()) { setDeviceReady(true); note('Secure device unlock is ready on this device.'); }
        })}>{deviceReady ? 'Remove device unlock' : 'Set up device unlock'}</Button><p className="caption">Your master password always remains available. Device support varies.</p><div className="panel-divider" /><h3>Automatic locking</h3><p>The vault locks after 5 minutes without activity, or 1 minute in the background. Revealed passwords hide after 15 seconds.</p><Button icon={LockKeyhole} onClick={lock}>Lock now</Button></section><section className="panel"><div className="panel-icon"><Download /></div><h2>Keep a spare copy</h2><p>Save an encrypted backup of the selected vault. Keep the backup password somewhere safe.</p><label>Vault to back up or import into<select value={vault?.id || ''} onChange={e => selectVault(e.target.value)}>{vaults.map(v => <option value={v.id} key={v.id}>{v.owner_id === profile.id ? 'My vault' : `${v.owner.name}’s vault`}</option>)}</select></label><div className="button-row"><Button disabled={demo || busy} icon={Download} onClick={() => openModal('export')}>Save backup</Button><Button disabled={demo || busy || !online} onClick={() => openModal('import')}>Import backup</Button></div><div className="panel-divider" /><h3>Keep it close</h3><p>Install Forget Me Knot for a home-screen icon on your phone or a separate window on your PC.</p><Button icon={MonitorSmartphone} onClick={install}>Install app</Button></section><section className="panel"><h2>Your connection</h2><p>{demo ? 'Sample mode — no accounts or cloud storage are connected.' : `${config?.repo} · ${config?.account}`}</p><p className="caption">Encrypted files sync through your private GitHub repository. Every save is kept in its history. Offline access uses the last encrypted copy on this device and is read only.</p><Button disabled={busy} icon={LogOut} onClick={signOut}>{demo ? 'Leave sample vault' : 'Sign out & forget this device'}</Button></section><section className="panel"><h2>About this build</h2><p>Forget Me Knot · {build}<br />Build model: GPT-6 · Codex</p><p className="caption">First release. Independent security review and checks on your actual devices are required before relying on this app for real passwords. Clipboard history may retain copied details; use only on trusted devices.</p><button className="text-link" onClick={() => openModal('help')}>Using your vault <ArrowRight size={16} /></button></section></div></>}
      </main><footer className="app-footer"><span>Less remembering. More living.</span><span>Build {build} · Build model: GPT-6 · Codex</span></footer></div>
    </div>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={20} />{toast}</div>}
    {modal === 'connection' && <Connection onClose={closeModal} />}
    {modal?.type === 'edit' && <EntryEditor key={modal.entry?.id || 'new'} entry={modal.entry} busy={busy} error={error} demo={demo} onClose={closeModal} onSave={draft => run(async active => { if (!draft.service.trim()) throw new Error('Choose a name for this login.'); const next = modal.entry ? vault.entries.map(e => e.id === draft.id ? draft : e) : [...vault.entries, draft]; await persist(next, active); if (active()) { setEntryId(draft.id); setQuery(''); closeModal(); note(demo ? 'Sample login updated for this preview.' : 'Login saved and synced.'); } })} onDelete={id => run(async active => { await persist(vault.entries.filter(e => e.id !== id), active); if (active()) { closeModal(); note('Login deleted.'); } })} />}
    {modal?.type === 'reset' && <ResetForm vault={modal.vault} busy={busy} error={error} onClose={closeModal} onReset={(pw, pwConfirm) => run(async active => {
      if (pw !== pwConfirm) throw new Error('The two passwords don’t match.');
      await resetFamilyMaster(modal.vault, profile, identity, pw);
      if (active()) { closeModal(); note(`${modal.vault.owner.name}’s new master password is ready. Tell them by phone.`); }
    })} />}
    {modal === 'forgot' && <Modal title="Forgot your master password?" onClose={closeModal}><p>Nobody can read your vault without it — not GitHub, not this app. That’s the point, but it means there’s no email reset.</p><ol className="help-steps"><li><strong>If someone looks after your vault</strong><p>Ask them to open Family access → Help someone get back in → Reset password, then tell you the new one.</p></li><li><strong>If you saved an encrypted backup</strong><p>Create a fresh account, then use Settings → Import backup with the backup’s own password.</p></li></ol></Modal>}
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
    {modal === 'help' && <Modal title="A little help" onClose={closeModal}><ol className="help-steps"><li><strong>Unlock your vault.</strong><p>Use your master password, or device unlock if you’ve set it up.</p></li><li><strong>Choose your app or website.</strong><p>Find Google, Facebook, Outlook or any login you’ve saved.</p></li><li><strong>Copy. Switch. Paste.</strong><p>Tap Copy username, switch to the app and paste. Come back and do the same for your password. On a PC, use Ctrl+V. On a phone, press and hold the text box, then tap Paste.</p></li></ol><p className="notice">Keep your GitHub sign-in outside this vault, so you can make a token for a new device. If you forget your master password, someone who looks after your vault can reset it, or you’ll need an encrypted backup and its password.</p></Modal>}
  </>;
}
