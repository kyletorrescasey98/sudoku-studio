// Shared offline indicator + pending-sync banner + toast utility.
// Exposes window.OfflineSync = { isOnline, attach, notifyWrite, toast }.
(function(){
  if (window.__offlineBannerInstalled) return;
  window.__offlineBannerInstalled = true;

  const STYLE_ID  = 'offline-banner-style';
  const OFFLINE_ID = 'offline-banner';
  const SYNC_ID    = 'sync-banner';
  const TOAST_ID   = 'offline-toast';

  let pending = 0;      // writes accumulated while offline, awaiting server ack
  let dbRef   = null;
  let waitFn  = null;   // waitForPendingWrites(db) from Firestore SDK
  let syncedTimer = 0;

  function installStyle(){
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${OFFLINE_ID},#${SYNC_ID}{
        position:fixed; left:0; right:0;
        z-index:100000;
        color:#fff;
        font:600 12px/1.2 -apple-system,'Segoe UI',system-ui,sans-serif;
        letter-spacing:.3px; text-align:center;
        padding:6px 10px;
        transform:translateY(-100%);
        transition:transform .18s ease, background-color .25s ease;
        pointer-events:none;
        box-shadow:0 1px 4px rgba(0,0,0,.15);
      }
      #${OFFLINE_ID}{ top:env(safe-area-inset-top, 0px); background:#b45309; }
      #${SYNC_ID}{ top:env(safe-area-inset-top, 0px); background:#1e40af; }
      body.offline-active #${SYNC_ID}{ top:calc(env(safe-area-inset-top, 0px) + 28px); }
      #${OFFLINE_ID}.show, #${SYNC_ID}.show{ transform:translateY(0); }
      #${SYNC_ID}.ok{ background:#059669; }
      #${TOAST_ID}{
        position:fixed; left:50%;
        bottom:calc(env(safe-area-inset-bottom, 0px) + 24px);
        transform:translate(-50%, 20px);
        z-index:100001;
        background:rgba(30,41,59,.95); color:#fff;
        border-radius:8px; padding:10px 14px;
        font:500 13px/1.3 -apple-system,'Segoe UI',system-ui,sans-serif;
        max-width:min(360px, 90vw);
        opacity:0;
        transition:opacity .2s ease, transform .2s ease;
        pointer-events:none;
        box-shadow:0 6px 20px rgba(0,0,0,.25);
      }
      #${TOAST_ID}.show{ opacity:1; transform:translate(-50%, 0); }
    `;
    document.head.appendChild(s);
  }

  function ensureEl(id, text){
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    if (text) el.textContent = text;
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function paintOffline(){
    installStyle();
    const bar = ensureEl(OFFLINE_ID, '⚠︎ You’re offline — playing from cache');
    if (navigator.onLine){
      bar.classList.remove('show');
      document.body?.classList.remove('offline-active');
    } else {
      bar.classList.add('show');
      document.body?.classList.add('offline-active');
    }
  }

  function paintSync(){
    installStyle();
    const bar = ensureEl(SYNC_ID, '');
    if (pending > 0){
      bar.textContent = navigator.onLine
        ? `⏳ Syncing ${pending} change${pending===1?'':'s'}…`
        : `📤 ${pending} change${pending===1?'':'s'} saved — will sync when back online`;
      bar.classList.remove('ok');
      bar.classList.add('show');
    } else {
      bar.classList.remove('show');
    }
  }

  function flashSynced(){
    installStyle();
    const bar = ensureEl(SYNC_ID, '');
    bar.textContent = '✓ All changes synced';
    bar.classList.add('ok', 'show');
    clearTimeout(syncedTimer);
    syncedTimer = setTimeout(() => {
      bar.classList.remove('show');
      // Reset to blue for next use after fade completes.
      setTimeout(() => bar.classList.remove('ok'), 300);
    }, 1500);
  }

  function toast(msg, opts){
    installStyle();
    const el = ensureEl(TOAST_ID, '');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), (opts && opts.ms) || 2600);
  }

  async function drainOnReconnect(){
    // Called when we transition offline→online with pending>0.
    // Show "Syncing…" until Firestore acks all queued writes, then flash "Synced".
    paintSync();
    if (dbRef && waitFn){
      try { await waitFn(dbRef); } catch(_) {}
    }
    pending = 0;
    flashSynced();
  }

  const OfflineSync = {
    isOnline(){ return navigator.onLine; },
    attach(db, waitForPendingWrites){
      dbRef = db;
      if (typeof waitForPendingWrites === 'function') waitFn = waitForPendingWrites;
    },
    // Call BEFORE or AFTER a user-initiated Firestore write. When offline it
    // increments a pending counter, shows the sync banner, and toasts the user.
    // When online it is a no-op (Firestore writes are ack'd quickly).
    notifyWrite(label){
      if (!navigator.onLine){
        pending++;
        paintSync();
        const prefix = label ? `${label}: ` : '';
        toast(`${prefix}saved offline — will sync when back online`);
      }
    },
    toast
  };
  window.OfflineSync = OfflineSync;

  // If a page's module ran before this script (script ordering is not fully
  // guaranteed for defer vs. module), it may have stashed its db here for us
  // to pick up now.
  if (window.__offlineSyncPending){
    const { db, waitForPendingWrites } = window.__offlineSyncPending;
    OfflineSync.attach(db, waitForPendingWrites);
    delete window.__offlineSyncPending;
  }

  function onOnline(){
    paintOffline();
    if (pending > 0) drainOnReconnect();
  }
  function onOffline(){
    paintOffline();
    if (pending > 0) paintSync();
  }

  function boot(){
    paintOffline();
    paintSync();
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
  window.addEventListener('online',  onOnline);
  window.addEventListener('offline', onOffline);
})();
