// Shared offline indicator injected into every page.
(function(){
  if (window.__offlineBannerInstalled) return;
  window.__offlineBannerInstalled = true;

  const STYLE_ID = 'offline-banner-style';
  const BAR_ID   = 'offline-banner';

  function installStyle(){
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${BAR_ID}{
        position:fixed; left:0; right:0;
        top:env(safe-area-inset-top, 0px);
        z-index:100000;
        background:#b45309; color:#fff;
        font:600 12px/1.2 -apple-system,'Segoe UI',system-ui,sans-serif;
        letter-spacing:.3px; text-align:center;
        padding:6px 10px;
        transform:translateY(-100%);
        transition:transform .18s ease;
        pointer-events:none;
        box-shadow:0 1px 4px rgba(0,0,0,.15);
      }
      #${BAR_ID}.show{ transform:translateY(0); }
    `;
    document.head.appendChild(s);
  }

  function ensureBar(){
    let el = document.getElementById(BAR_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = BAR_ID;
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    el.textContent = '⚠︎ You’re offline — playing from cache';
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function update(){
    installStyle();
    const bar = ensureBar();
    if (navigator.onLine) bar.classList.remove('show');
    else bar.classList.add('show');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update, { once:true });
  } else {
    update();
  }
  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
})();
