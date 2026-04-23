/**
 * proxy.js — drop this on any static site
 *
 * <div id="proxy"></div>
 * <script src="https://cdn.jsdelivr.net/gh/neilbauman21-hub/proxy@main/proxy-repo/proxy.js"></script>
 * <script>
 *   proxy.init({ container: '#proxy', theme: 'dark' });
 * </script>
 */
(function (global) {
  'use strict';

  const SHELL_URL = 'https://cdn.jsdelivr.net/gh/neilbauman21-hub/proxy@main/proxy-repo/proxy-shell.html';

  const DEFAULTS = {
    container: '#proxy',
    theme: 'dark',
    width: '100%',
    height: '600px',
    borderRadius: '10px',
  };

  const proxy = {
    _iframe: null,
    _cfg: null,

    async init(userConfig = {}) {
      const cfg = { ...DEFAULTS, ...userConfig };
      this._cfg = cfg;

      const container = typeof cfg.container === 'string'
        ? document.querySelector(cfg.container)
        : cfg.container;

      if (!container) {
        console.error('[proxy.js] container not found:', cfg.container);
        return;
      }

      // Fetch the shell HTML and turn it into a blob URL
      // so the browser renders it as a page instead of showing source
      let shellSrc;
      try {
        const res = await fetch(SHELL_URL);
        const html = await res.text();
        const blob = new Blob([html], { type: 'text/html' });
        shellSrc = URL.createObjectURL(blob);
      } catch (e) {
        console.error('[proxy.js] failed to fetch shell:', e);
        return;
      }

      const iframe = document.createElement('iframe');
      iframe.src = shellSrc;
      iframe.style.cssText = `
        width: ${cfg.width};
        height: ${cfg.height};
        border: none;
        border-radius: ${cfg.borderRadius};
        display: block;
        box-shadow: 0 0 0 1px rgba(0,255,136,0.15), 0 8px 32px rgba(0,0,0,0.4);
      `;
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock');
      iframe.setAttribute('allow', 'fullscreen');

      container.innerHTML = '';
      container.appendChild(iframe);
      this._iframe = iframe;

      iframe.addEventListener('load', () => this._sendConfig());
    },

    _sendConfig() {
      this._iframe?.contentWindow?.postMessage({
        type: 'proxy-config',
        config: { theme: this._cfg.theme }
      }, '*');
    },

    go(url) {
      this._iframe?.contentWindow?.postMessage({ type: 'proxy-navigate', url }, '*');
    },
  };

  global.proxy = proxy;
})(window);
