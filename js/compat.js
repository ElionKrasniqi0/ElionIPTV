(function (global) {
  'use strict';

  /**
   * Minimal webOS / older-Chromium compatibility helpers.
   * Loaded before other app modules.
   */

  // NodeList.forEach (missing on some older TV engines)
  if (typeof NodeList !== 'undefined' && NodeList.prototype && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
  }

  // Element.matches
  if (typeof Element !== 'undefined' && Element.prototype) {
    var proto = Element.prototype;
    if (!proto.matches) {
      proto.matches = proto.matchesSelector || proto.msMatchesSelector || proto.webkitMatchesSelector ||
        function (sel) {
          var list = (this.document || this.ownerDocument).querySelectorAll(sel);
          var i = 0;
          while (list[i] && list[i] !== this) i++;
          return !!list[i];
        };
    }
  }

  function parseHttpUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    try {
      if (typeof URL !== 'undefined') {
        var u = new URL(raw);
        if (u.protocol === 'http:' || u.protocol === 'https:') return u;
        return null;
      }
    } catch (e) { /* fall through */ }
    // Fallback without URL constructor
    var m = raw.match(/^(https?):\/\/([^\/\?#]+)([^\?#]*)(\?[^#]*)?(#.*)?$/i);
    if (!m) return null;
    return {
      protocol: m[1].toLowerCase() + ':',
      host: m[2],
      hostname: m[2].split(':')[0],
      pathname: m[3] || '/',
      search: m[4] || '',
      hash: m[5] || '',
      href: raw
    };
  }

  global.ElionCompat = {
    parseHttpUrl: parseHttpUrl
  };
})(window);
