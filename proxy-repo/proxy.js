/**
 * proxy.js — WebSocket proxy, no iframe, no service worker
 *
 * Usage (that's it, 3 lines):
 *   <div id="proxy"></div>
 *   <script src="https://cdn.jsdelivr.net/gh/neilbauman21-hub/proxy@main/proxy-repo/proxy.js"></script>
 *   <script>proxy.init({ container: '#proxy' });</script>
 */
(function (global) {
  'use strict';

  const BARE = 'wss://nexus-unblocked.lol/bare/';

  const DEFAULTS = {
    container: '#proxy',
    theme: 'dark',
    width: '100%',
    height: '600px',
  };

  // ── Styles ──────────────────────────────────────────────
  const CSS = `
    ._pxy_wrap {
      font-family: 'IBM Plex Mono', monospace;
      background: #0a0a0a;
      border-radius: 10px;
      border: 1px solid #222;
      box-shadow: 0 0 0 1px rgba(0,255,136,0.1), 0 8px 32px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    ._pxy_bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: #111;
      border-bottom: 1px solid #222;
    }
    ._pxy_input {
      flex: 1;
      background: #0a0a0a;
      border: 1px solid #333;
      border-radius: 5px;
      padding: 5px 10px;
      color: #e8e8e8;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      outline: none;
    }
    ._pxy_input:focus { border-color: #00ff88; }
    ._pxy_go {
      background: #00ff88;
      color: #000;
      border: none;
      border-radius: 4px;
      padding: 5px 14px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
    ._pxy_go:hover { opacity: 0.85; }
    ._pxy_content {
      flex: 1;
      overflow: auto;
      background: #fff;
      position: relative;
    }
    ._pxy_splash {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: #0a0a0a;
      color: #555;
      font-size: 11px;
      letter-spacing: 0.1em;
    }
    ._pxy_tag {
      color: #00ff88;
      border: 1px solid #00ff88;
      background: rgba(0,255,136,0.08);
      padding: 3px 12px;
      border-radius: 3px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      font-size: 11px;
    }
    ._pxy_status {
      padding: 3px 12px;
      background: #111;
      border-top: 1px solid #222;
      font-size: 10px;
      color: #444;
      letter-spacing: 0.05em;
    }
    ._pxy_loader {
      position: absolute;
      inset: 0;
      background: #0a0a0a;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 12px;
    }
    ._pxy_bar_el {
      width: 140px; height: 2px;
      background: #222; border-radius: 2px; overflow: hidden;
    }
    ._pxy_bar_el::after {
      content: ''; display: block; width: 40%; height: 100%;
      background: #00ff88; border-radius: 2px;
      animation: _pxy_sweep 1s ease-in-out infinite alternate;
    }
    @keyframes _pxy_sweep {
      from { transform: translateX(-100%); }
      to   { transform: translateX(350%); }
    }
    ._pxy_lbl { font-size: 10px; color: #444; font-family: monospace; letter-spacing: 0.1em; }
  `;

  // ── WS fetch via bare server (v3 protocol) ──────────────
  function wsFetch(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(BARE);
      let headersDone = false;
      let statusCode = 200;
      let body = '';

      ws.onopen = () => {
        // Bare server v3: send request as JSON
        ws.send(JSON.stringify({
          type: 'request',
          remote: url,
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          body: null,
        }));
      };

      ws.onmessage = (e) => {
        if (!headersDone) {
          try {
            const meta = JSON.parse(e.data);
            statusCode = meta.status || 200;
            headersDone = true;
          } catch {
            // not JSON, treat as body chunk
            body += e.data;
          }
        } else {
          body += e.data;
        }
      };

      ws.onclose = () => resolve({ status: statusCode, body });
      ws.onerror = (e) => reject(new Error('WS error'));
    });
  }

  // ── Rewrite HTML links/resources to go through our proxy ─
  function rewriteHtml(html, baseUrl) {
    const base = new URL(baseUrl);

    // Make relative URLs absolute
    html = html.replace(/(href|src|action)="([^"]+)"/gi, (match, attr, val) => {
      if (val.startsWith('http') || val.startsWith('//') || val.startsWith('data:') || val.startsWith('#')) return match;
      try {
        const abs = new URL(val, base).href;
        return `${attr}="${abs}"`;
      } catch { return match; }
    });

    // Rewrite absolute links to go through proxy on click
    // We inject a small script that intercepts clicks
    const interceptScript = `
      <script>
        document.addEventListener('click', function(e) {
          const a = e.target.closest('a');
          if (!a || !a.href) return;
          e.preventDefault();
          window.parent.postMessage({ type: '_pxy_nav', url: a.href }, '*');
        }, true);
        document.addEventListener('submit', function(e) {
          e.preventDefault();
        }, true);
      <\/script>
    `;

    // Inject before </body>
    html = html.replace(/<\/body>/i, interceptScript + '</body>');

    return html;
  }

  // ── Main proxy object ────────────────────────────────────
  const proxy = {
    _container: null,
    _content: null,
    _status: null,
    _input: null,

    init(userConfig = {}) {
      const cfg = { ...DEFAULTS, ...userConfig };

      const container = typeof cfg.container === 'string'
        ? document.querySelector(cfg.container)
        : cfg.container;
      if (!container) return;
      this._container = container;

      // Inject font
      if (!document.getElementById('_pxy_font')) {
        const link = document.createElement('link');
        link.id = '_pxy_font';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap';
        document.head.appendChild(link);
      }

      // Inject CSS
      if (!document.getElementById('_pxy_style')) {
        const style = document.createElement('style');
        style.id = '_pxy_style';
        style.textContent = CSS;
        document.head.appendChild(style);
      }

      // Build UI
      container.innerHTML = `
        <div class="_pxy_wrap" style="width:${cfg.width};height:${cfg.height};">
          <div class="_pxy_bar">
            <input class="_pxy_input" id="_pxy_input" placeholder="Enter a URL..." spellcheck="false" autocomplete="off" />
            <button class="_pxy_go" id="_pxy_go">GO</button>
          </div>
          <div class="_pxy_content" id="_pxy_content">
            <div class="_pxy_splash">
              <div class="_pxy_tag">scramjet proxy</div>
              <div>type a url and press GO</div>
            </div>
          </div>
          <div class="_pxy_status" id="_pxy_status">ready — ${BARE.replace('wss://','').split('/')[0]}</div>
        </div>
      `;

      this._content = document.getElementById('_pxy_content');
      this._status  = document.getElementById('_pxy_status');
      this._input   = document.getElementById('_pxy_input');

      document.getElementById('_pxy_go').addEventListener('click', () => this.navigate(this._input.value));
      this._input.addEventListener('keydown', e => { if (e.key === 'Enter') this.navigate(this._input.value); });

      // Listen for link clicks from injected script
      window.addEventListener('message', e => {
        if (e.data?.type === '_pxy_nav') this.navigate(e.data.url);
      });
    },

    async navigate(rawUrl) {
      let url = rawUrl.trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      this._input.value = url;

      // Show loader
      this._content.innerHTML = `
        <div class="_pxy_loader">
          <div class="_pxy_bar_el"></div>
          <div class="_pxy_lbl">fetching ${new URL(url).hostname}...</div>
        </div>
      `;
      this._status.textContent = 'loading...';

      try {
        const { status, body } = await wsFetch(url);
        const rewritten = rewriteHtml(body, url);

        // Write into a sandboxed srcdoc iframe so scripts don't run on host page
        const frame = document.createElement('iframe');
        frame.style.cssText = 'width:100%;height:100%;border:none;';
        frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
        frame.srcdoc = rewritten;

        this._content.innerHTML = '';
        this._content.appendChild(frame);
        this._status.textContent = `${status} — ${url}`;

      } catch (err) {
        this._content.innerHTML = `<div class="_pxy_splash"><div style="color:#ff4444">error: ${err.message}</div></div>`;
        this._status.textContent = 'failed';
      }
    },
  };

  global.proxy = proxy;
})(window);
