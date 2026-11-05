(function (global) {
  'use strict';

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeUrl(url) {
    if (!url) return '';
    // Preserve query strings and fragments used by many IPTV providers
    return String(url).trim().replace(/^['"]|['"]$/g, '');
  }

  function isValidHttpUrl(value) {
    var parsed = global.ElionCompat && ElionCompat.parseHttpUrl
      ? ElionCompat.parseHttpUrl(value)
      : null;
    if (parsed) return true;
    try {
      var u = new URL(String(value).trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  function looksLikeM3uUrl(value) {
    return isValidHttpUrl(value);
  }

  function formatDuration(sec) {
    if (!isFinite(sec) || sec < 0) return '--:--';
    var s = Math.floor(sec % 60);
    var m = Math.floor((sec / 60) % 60);
    var h = Math.floor(sec / 3600);
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  function formatClock(date) {
    var d = date || new Date();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function hashString(str) {
    var h = 0;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  function looksLikePlaylistText(text) {
    if (!text || !String(text).trim()) return false;
    var sample = String(text).slice(0, 4000);
    if (/#EXTM3U/i.test(sample) || /#EXTINF:/i.test(sample)) return true;
    // Plain URL lists (no EXT tags) — reject obvious HTML/login pages
    if (/<(html|body|head|script)\b/i.test(sample)) return false;
    var lines = sample.split(/\r?\n/);
    var urlLines = 0;
    for (var i = 0; i < lines.length; i++) {
      if (/^https?:\/\//i.test(String(lines[i]).trim())) urlLines++;
      if (urlLines >= 1) return true;
    }
    return false;
  }

  /**
   * Download remote text. Uses fetch when available, XHR fallback for webOS quirks.
   * @param {string} url
   * @param {number} [timeoutMs]
   * @param {{ accept?: 'playlist'|'any'|'xml', retries?: number }} [options]
   *   accept 'playlist' (default) validates M3U-like body; 'any'/'xml' skip that check (EPG).
   */
  var downloadLanes = { playlist: null, xml: null };

  function downloadText(url, timeoutMs, options) {
    if (timeoutMs && typeof timeoutMs === 'object') {
      options = timeoutMs;
      timeoutMs = options.timeoutMs;
    }
    options = options || {};
    timeoutMs = timeoutMs || options.timeoutMs || 90000;
    var accept = options.accept || 'playlist';
    url = normalizeUrl(url);

    if (!isValidHttpUrl(url)) {
      return Promise.reject(new Error('Invalid http(s) URL.'));
    }

    if (global.ElionNet && !ElionNet.isOnline()) {
      return Promise.reject(new Error('No internet connection. Saved playlists are still available.'));
    }

    var lane = accept === 'xml' ? 'xml' : 'playlist';
    if (downloadLanes[lane]) {
      downloadLanes[lane].superseded = true;
      try { downloadLanes[lane].abort(); } catch (eLane) { /* ignore */ }
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctrl) downloadLanes[lane] = ctrl;

    var runner = function () {
      return downloadTextOnce(url, timeoutMs, accept, ctrl).then(function (text) {
        if (downloadLanes[lane] === ctrl) downloadLanes[lane] = null;
        return text;
      }, function (err) {
        if (downloadLanes[lane] === ctrl) downloadLanes[lane] = null;
        throw err;
      });
    };

    if (global.ElionNet && typeof ElionNet.withRetry === 'function' && options.retries !== 0) {
      return ElionNet.withRetry(runner, {
        retries: options.retries != null ? options.retries : 2,
        delayMs: 700,
        label: 'download'
      });
    }
    return runner();
  }

  function downloadTextOnce(url, timeoutMs, accept, ctrl) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function fail(msg) {
        if (settled) return;
        settled = true;
        reject(new Error(msg));
      }
      function ok(text, status) {
        if (settled) return;
        settled = true;
        if (text == null || String(text).trim() === '') {
          reject(new Error('Server returned an empty response (HTTP ' + (status || '?') + ').'));
          return;
        }
        if (accept === 'playlist' && !looksLikePlaylistText(text)) {
          reject(new Error('Response does not look like an M3U playlist (HTTP ' + (status || '?') + '). The server may have returned a login page or blocked the TV.'));
          return;
        }
        if (accept === 'xml' && !(/<tv[\s>]|<\?xml|programme/i.test(String(text).slice(0, 4000)))) {
          // Soft warning path — still allow parse to decide
          if (global.ElionLog) ElionLog.warn('EPG response may not be XMLTV');
        }
        resolve(String(text));
      }

      var timer = setTimeout(function () {
        fail('Request timed out after ' + Math.round(timeoutMs / 1000) + 's. Check the network or try paste / Phone-PC import.');
      }, timeoutMs);

      function clear() { clearTimeout(timer); }

      function mapNetworkError(err) {
        var msg = err && err.message ? err.message : String(err || 'Network error');
        if (/Failed to fetch|NetworkError|CORS|cross-origin|Access-Control/i.test(msg)) {
          return 'Network/CORS error: the playlist server blocked or is unreachable from the TV. Use Phone/PC Import or paste M3U content.';
        }
        return msg;
      }

      // Prefer fetch on modern webOS; fall back to XHR
      if (typeof fetch === 'function') {
        if (!ctrl && typeof AbortController !== 'undefined') ctrl = new AbortController();
        var opts = {
          method: 'GET',
          credentials: 'omit',
          cache: 'no-store',
          mode: 'cors',
          redirect: 'follow'
        };
        if (ctrl) opts.signal = ctrl.signal;

        var abortTimer = setTimeout(function () {
          if (ctrl) try { ctrl.abort(); } catch (e) { /* ignore */ }
        }, timeoutMs);

        fetch(url, opts).then(function (res) {
          if (!res.ok) {
            throw new Error('HTTP ' + res.status + (res.statusText ? (' ' + res.statusText) : '') + ' — server rejected the playlist request.');
          }
          return res.text().then(function (text) {
            return { text: text, status: res.status };
          });
        }).then(function (pack) {
          clearTimeout(abortTimer);
          clear();
          ok(pack.text, pack.status);
        }).catch(function (err) {
          clearTimeout(abortTimer);
          clear();
          if (settled) return;
          var msg = String(err && err.message || err || '');
          var name = err && err.name ? String(err.name) : '';
          // Do not XHR-fallback after our own AbortController timeout
          if (ctrl && ctrl.superseded) {
            fail('Request superseded.');
            return;
          }
          if (/AbortError/i.test(name) || /aborted|abort/i.test(msg)) {
            fail('Request timed out after ' + Math.round(timeoutMs / 1000) + 's. Check the network or try paste / Phone-PC import.');
            return;
          }
          // Fallback to XHR once if fetch failed for network/CORS reasons
          if (/Failed to fetch|NetworkError|CORS|cross-origin/i.test(msg)) {
            xhrDownload(url, timeoutMs).then(function (pack) {
              ok(pack.text, pack.status);
            }).catch(function (err2) {
              fail(mapNetworkError(err2));
            });
            return;
          }
          fail(mapNetworkError(err));
        });
        return;
      }

      xhrDownload(url, timeoutMs).then(function (pack) {
        clear();
        ok(pack.text, pack.status);
      }).catch(function (err) {
        clear();
        fail(mapNetworkError(err));
      });
    });
  }

  function xhrDownload(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var xhr;
      try {
        xhr = new XMLHttpRequest();
      } catch (e) {
        reject(new Error('XMLHttpRequest unavailable on this TV.'));
        return;
      }
      xhr.open('GET', url, true);
      xhr.timeout = timeoutMs || 90000;
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ text: xhr.responseText || '', status: xhr.status });
        } else if (xhr.status === 0) {
          reject(new Error('Network/CORS error: the playlist server blocked or is unreachable from the TV. Use Phone/PC Import or paste M3U content.'));
        } else {
          reject(new Error('HTTP ' + xhr.status + ' — server rejected the playlist request.'));
        }
      };
      xhr.ontimeout = function () {
        reject(new Error('Request timed out after ' + Math.round((timeoutMs || 90000) / 1000) + 's.'));
      };
      xhr.onerror = function () {
        reject(new Error('Network/CORS error: the playlist server blocked or is unreachable from the TV. Use Phone/PC Import or paste M3U content.'));
      };
      try {
        xhr.send(null);
      } catch (e2) {
        reject(e2);
      }
    });
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'dataset') {
          Object.keys(attrs.dataset).forEach(function (dk) {
            node.dataset[dk] = attrs.dataset[dk];
          });
        } else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] != null && attrs[k] !== false) {
          node.setAttribute(k, attrs[k] === true ? '' : String(attrs[k]));
        }
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  global.ElionUtils = {
    uid: uid,
    clamp: clamp,
    debounce: debounce,
    escapeHtml: escapeHtml,
    normalizeUrl: normalizeUrl,
    isValidHttpUrl: isValidHttpUrl,
    looksLikeM3uUrl: looksLikeM3uUrl,
    formatDuration: formatDuration,
    formatClock: formatClock,
    hashString: hashString,
    downloadText: downloadText,
    looksLikePlaylistText: looksLikePlaylistText,
    el: el
  };
})(window);
