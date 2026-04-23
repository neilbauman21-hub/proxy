/**
 * proxy.js — drop this on any static site
 *
 * <div id="proxy"></div>
 * <script src="https://cdn.jsdelivr.net/gh/YOURUSER/proxy@latest/proxy.js"></script>
 * <script>
 *   proxy.init({ container: '#proxy', theme: 'dark' });
 * </script>
 */
(function (global) {
  'use strict';

  // ← this points to YOUR repo on jsDelivr
  const SHELL_URL = 'https://cdn.jsdelivr.net/gh/neilbauman21-hub/proxy@latest/proxy-shell.html';

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

    init(userConfig = {}) {
      const cfg = { ...DEFAULTS, ...userConfig };
      this._cfg = cfg;

      const container = typeof cfg.container === 'string'
        ? document.querySelector(cfg.container)
        : cfg.container;

      if (!container) {
        console.error('[proxy.js] container not found:', cfg.container);
        return;
      }

      const iframe = document.createElement('iframe');
      iframe.src = SHELL_URL;
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

    // Programmatically navigate
    go(url) {
      this._iframe?.contentWindow?.postMessage({ type: 'proxy-navigate', url }, '*');
    },
  };

  global.proxy = proxy;
})(window);
