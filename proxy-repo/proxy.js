/**
 * proxy.js — WebSocket proxy, no iframe, no service worker
 *
 * Usage (3 lines):
 *   <div id="proxy"></div>
 *   <script src="https://cdn.jsdelivr.net/gh/neilbauman21-hub/proxy@main/proxy-repo/proxy.js"></script>
 *   <script>proxy.init({ container: '#proxy' });</script>
 */
(function (global) {
  'use strict';

  const BARE    = 'https://nexus-unblocked.lol/bare/';
  const BARE_V  = 'v3';                  // bare server version
  const CACHE   = new Map();             // simple in-memory page cache
  const CACHE_MAX = 20;                  // max cached pages

  const DEFAULTS = {
    container:    '#proxy',
    theme:        'dark',
    width:        '100%',
    height:       '600px',
    borderRadius: '10px',
  };

  // ── CSS ─────────────────────────────────────────────────
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap');
    ._pxy_wrap {
      font-family:'IBM Plex Mono',monospace;
      background:#0a0a0a;
      border:1px solid #1e1e1e;
      box-shadow:0 0 0 1px rgba(0,255,136,0.08),0 12px 40px rgba(0,0,0,0.6);
      display:flex;flex-direction:column;overflow:hidden;
    }
    ._pxy_bar {
      display:flex;align-items:center;gap:6px;
      padding:7px 10px;background:#0f0f0f;border-bottom:1px solid #1e1e1e;
      flex-shrink:0;
    }
    ._pxy_navbtn {
      width:26px;height:26px;flex-shrink:0;
      border:1px solid #1e1e1e;border-radius:4px;
      background:transparent;color:#444;cursor:pointer;font-size:12px;
      display:flex;align-items:center;justify-content:center;
      transition:color .1s,border-color .1s;
    }
    ._pxy_navbtn:hover{color:#e8e8e8;border-color:#00ff88;}
    ._pxy_urlinput {
      flex:1;background:#070707;border:1px solid #1e1e1e;border-radius:5px;
      padding:5px 10px;color:#e8e8e8;font-family:'IBM Plex Mono',monospace;
      font-size:11px;outline:none;transition:border-color .15s;
    }
    ._pxy_urlinput:focus{border-color:#00ff88;}
    ._pxy_go {
      background:#00ff88;color:#000;border:none;border-radius:4px;
      padding:5px 16px;font-family:'IBM Plex Mono',monospace;
      font-size:11px;font-weight:600;cursor:pointer;
      transition:opacity .15s;flex-shrink:0;
    }
    ._pxy_go:hover{opacity:.8;}
    ._pxy_progress {
      height:2px;background:transparent;flex-shrink:0;overflow:hidden;
    }
    ._pxy_progress._pxy_active {background:#111;}
    ._pxy_progress._pxy_active::after {
      content:'';display:block;width:30%;height:100%;
      background:#00ff88;border-radius:2px;
      animation:_pxy_slide 0.9s ease-in-out infinite alternate;
    }
    @keyframes _pxy_slide{from{transform:translateX(-100%)}to{transform:translateX(433%)}}
    ._pxy_content{flex:1;overflow:hidden;position:relative;background:#fff;}
    ._pxy_frame{width:100%;height:100%;border:none;display:block;}
    ._pxy_splash {
      position:absolute;inset:0;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
      background:#0a0a0a;
    }
    ._pxy_splash_tag {
      color:#00ff88;border:1px solid #00ff88;background:rgba(0,255,136,0.07);
      padding:4px 14px;border-radius:3px;letter-spacing:.22em;
      text-transform:uppercase;font-size:10px;
    }
    ._pxy_splash_hint{font-size:10px;color:#3a3a3a;letter-spacing:.1em;}
    ._pxy_splash_hint span{color:#555;}
    ._pxy_status {
      padding:2px 12px;background:#0a0a0a;border-top:1px solid #161616;
      font-size:9px;color:#333;letter-spacing:.06em;
      display:flex;align-items:center;gap:6px;flex-shrink:0;
    }
    ._pxy_dot{width:5px;height:5px;border-radius:50%;background:#2a2a2a;flex-shrink:0;}
    ._pxy_dot._ok{background:#00ff88;box-shadow:0 0 5px #00ff88;}
    ._pxy_dot._err{background:#ff4455;}
    ._pxy_errbox {
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:10px;
      background:#0a0a0a;font-size:11px;color:#ff4455;
    }
    ._pxy_errbox small{color:#333;font-size:9px;}
  `;

  // ── Bare server fetch (v3) ───────────────────────────────
  async function bareFetch(url, opts = {}) {
    if (CACHE.has(url) && !opts.noCache) return CACHE.get(url);

    const method = opts.method || 'GET';
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Upgrade-Insecure-Requests': '1',
      ...(opts.headers || {}),
    };

    const res = await fetch(`${BARE}${BARE_V}/`, {
      method,
      headers: {
        'X-Bare-URL':             url,
        'X-Bare-Headers':         JSON.stringify(reqHeaders),
        'X-Bare-Forward-Headers': JSON.stringify(['Accept-Encoding', 'Accept-Language', 'Cookie']),
        ...(opts.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: opts.body || null,
    });

    const contentType = res.headers.get('x-bare-headers')
      ? JSON.parse(res.headers.get('x-bare-headers'))['content-type'] || ''
      : res.headers.get('content-type') || '';

    const isText = /text|html|xml|json|javascript/.test(contentType);
    const body   = isText ? await res.text() : null;

    const result = { status: res.status, body, contentType, url };

    // Cache only successful HTML responses
    if (res.status === 200 && isText) {
      if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
      CACHE.set(url, result);
    }

    return result;
  }

  // ── HTML rewriter ────────────────────────────────────────
  function rewrite(html, baseUrl) {
    const base = new URL(baseUrl);

    // Inject <base> tag so relative URLs resolve correctly inside srcdoc
    const baseTag = `<base href="${base.origin}${base.pathname}">`;
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);

    // Make all href/src/action absolute
    html = html.replace(/(href|src|action)="([^"#][^"]*)"/gi, (m, attr, val) => {
      if (/^(https?:|data:|javascript:|mailto:|blob:)/.test(val)) return m;
      try { return `${attr}="${new URL(val, base).href}"`; }
      catch { return m; }
    });

    // Same for single-quoted attrs
    html = html.replace(/(href|src|action)='([^'#][^']*)'/gi, (m, attr, val) => {
      if (/^(https?:|data:|javascript:|mailto:|blob:)/.test(val)) return m;
      try { return `${attr}='${new URL(val, base).href}'`; }
      catch { return m; }
    });

    // Intercept navigation inside the srcdoc frame
    const intercept = `
<script>
(function(){
  // Link clicks
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href]');
    if(!a) return;
    var h = a.getAttribute('href');
    if(!h || /^(#|javascript|mailto)/.test(h)) return;
    e.preventDefault(); e.stopPropagation();
    window.parent.postMessage({type:'_pxy_nav', url: a.href}, '*');
  }, true);
  // Form submits
  document.addEventListener('submit', function(e){
    e.preventDefault();
    var f = e.target;
    var action = f.action || window.location.href;
    var method = (f.method||'get').toUpperCase();
    var data = new URLSearchParams(new FormData(f)).toString();
    if(method==='GET') {
      window.parent.postMessage({type:'_pxy_nav', url: action+'?'+data}, '*');
    } else {
      window.parent.postMessage({type:'_pxy_post', url: action, body: data}, '*');
    }
  }, true);
})();
<\/script>`;

    html = html.replace(/<\/body>/i, intercept + '</body>');
    if (!/<\/body>/i.test(html)) html += intercept;

    return html;
  }

  // ── History stack ────────────────────────────────────────
  const hist = { stack: [], pos: -1 };
  function histPush(url) {
    hist.stack = hist.stack.slice(0, hist.pos + 1);
    hist.stack.push(url);
    hist.pos = hist.stack.length - 1;
  }
  function histBack()    { if (hist.pos > 0) return hist.stack[--hist.pos]; }
  function histForward() { if (hist.pos < hist.stack.length-1) return hist.stack[++hist.pos]; }

  // ── Proxy object ─────────────────────────────────────────
  const proxy = {
    _content: null, _status: null, _input: null,
    _dot: null, _progress: null, _frame: null,

    init(userConfig = {}) {
      const cfg = { ...DEFAULTS, ...userConfig };
      const container = typeof cfg.container === 'string'
        ? document.querySelector(cfg.container) : cfg.container;
      if (!container) return;

      if (!document.getElementById('_pxy_css')) {
        const s = document.createElement('style');
        s.id = '_pxy_css'; s.textContent = CSS;
        document.head.appendChild(s);
      }

      container.innerHTML = `
        <div class="_pxy_wrap" style="width:${cfg.width};height:${cfg.height};border-radius:${cfg.borderRadius};">
          <div class="_pxy_bar">
            <button class="_pxy_navbtn" id="_pxy_back" title="Back">&#8592;</button>
            <button class="_pxy_navbtn" id="_pxy_fwd"  title="Forward">&#8594;</button>
            <button class="_pxy_navbtn" id="_pxy_rld"  title="Reload">&#8635;</button>
            <input  class="_pxy_urlinput" id="_pxy_input" placeholder="Enter a URL..." spellcheck="false" autocomplete="off"/>
            <button class="_pxy_go" id="_pxy_go">GO</button>
          </div>
          <div class="_pxy_progress" id="_pxy_progress"></div>
          <div class="_pxy_content" id="_pxy_content">
            <div class="_pxy_splash">
              <div class="_pxy_splash_tag">scramjet proxy</div>
              <div class="_pxy_splash_hint">type a url and press <span>GO</span></div>
            </div>
          </div>
          <div class="_pxy_status" id="_pxy_status">
            <div class="_pxy_dot" id="_pxy_dot"></div>
            <span id="_pxy_stxt">ready &mdash; ${new URL(BARE).hostname}</span>
          </div>
        </div>
      `;

      this._content  = document.getElementById('_pxy_content');
      this._status   = document.getElementById('_pxy_stxt');
      this._dot      = document.getElementById('_pxy_dot');
      this._input    = document.getElementById('_pxy_input');
      this._progress = document.getElementById('_pxy_progress');

      document.getElementById('_pxy_go')  .addEventListener('click', () => this.navigate(this._input.value));
      document.getElementById('_pxy_back').addEventListener('click', () => { const u = histBack();    if(u) this.navigate(u, true); });
      document.getElementById('_pxy_fwd') .addEventListener('click', () => { const u = histForward(); if(u) this.navigate(u, true); });
      document.getElementById('_pxy_rld') .addEventListener('click', () => { if(this._currentUrl) this.navigate(this._currentUrl, true, true); });
      this._input.addEventListener('keydown', e => { if(e.key==='Enter') this.navigate(this._input.value); });

      window.addEventListener('message', e => {
        if (e.data?.type === '_pxy_nav')  this.navigate(e.data.url);
        if (e.data?.type === '_pxy_post') this.navigate(e.data.url, false, false, { method:'POST', body: e.data.body, noCache: true });
      });
    },

    async navigate(rawUrl, skipHistory = false, noCache = false, opts = {}) {
      let url = rawUrl.trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

      this._input.value = url;
      this._currentUrl  = url;
      if (!skipHistory) histPush(url);

      // Start progress
      this._progress.classList.add('_pxy_active');
      this._dot.className = '_pxy_dot';
      this._status.textContent = `loading ${new URL(url).hostname}...`;

      try {
        const { status, body } = await bareFetch(url, { ...opts, noCache });

        if (!body) throw new Error('no content received');

        const html  = rewrite(body, url);
        const frame = document.createElement('iframe');
        frame.className = '_pxy_frame';
        frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');
        frame.srcdoc = html;

        this._content.innerHTML = '';
        this._content.appendChild(frame);
        this._frame = frame;

        this._dot.className = '_pxy_dot _ok';
        this._status.textContent = `${status} — ${url}`;
      } catch (err) {
        this._content.innerHTML = `
          <div class="_pxy_errbox">
            <span>&#10007; ${err.message}</span>
            <small>${url}</small>
          </div>`;
        this._dot.className = '_pxy_dot _err';
        this._status.textContent = 'failed';
      } finally {
        this._progress.classList.remove('_pxy_active');
      }
    },
  };

  global.proxy = proxy;
})(window);
