(function (global) {
  'use strict';

  /**
   * Connectivity monitor for LG webOS.
   * Keeps the app usable offline; only network features become unavailable.
   */

  var online = true;
  var listeners = [];
  var bannerEl = null;
  var lastToastAt = 0;
  var probeTimer = null;
  var inited = false;

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](online); } catch (e) {
        if (global.ElionLog) ElionLog.warn('net listener failed', e && e.message);
      }
    }
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function readNavigatorOnline() {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
        return navigator.onLine;
      }
    } catch (e) { /* ignore */ }
    return true;
  }

  function isOnline() {
    return !!online;
  }

  function setOnline(v, opts) {
    opts = opts || {};
    var next = !!v;
    var changed = next !== online;
    online = next;
    updateBanner();
    if (changed) {
      emit();
      if (!opts.silent && global.ElionLog) {
        ElionLog.info(online ? 'Network online' : 'Network offline');
      }
      if (!opts.silent && global.ElionUI && ElionUI.toast) {
        var now = Date.now();
        if (now - lastToastAt > 4000) {
          lastToastAt = now;
          ElionUI.toast(online
            ? 'Internet connection restored'
            : 'No internet — browsing saved channels still works');
        }
      }
    }
    return online;
  }

  function ensureBanner() {
    if (bannerEl && document.body.contains(bannerEl)) return bannerEl;
    bannerEl = document.getElementById('offlineBanner');
    if (bannerEl) return bannerEl;
    bannerEl = document.createElement('div');
    bannerEl.id = 'offlineBanner';
    bannerEl.className = 'offline-banner';
    bannerEl.setAttribute('role', 'status');
    bannerEl.textContent = 'No internet connection — saved playlists and channels remain available.';
    var app = document.getElementById('app') || document.body;
    if (app) app.appendChild(bannerEl);
    return bannerEl;
  }

  function updateBanner() {
    try {
      var el = ensureBanner();
      if (!el) return;
      if (online) el.classList.remove('active');
      else el.classList.add('active');
    } catch (e) { /* never crash UI for banner */ }
  }

  function init() {
    if (inited) return;
    inited = true;
    online = readNavigatorOnline();
    updateBanner();

    try {
      window.addEventListener('online', function () { setOnline(true); });
      window.addEventListener('offline', function () { setOnline(false); });
    } catch (e) { /* ignore */ }

    // Light periodic sync — webOS sometimes lags navigator.onLine events
    if (probeTimer) clearInterval(probeTimer);
    probeTimer = setInterval(function () {
      var nav = readNavigatorOnline();
      if (nav !== online) setOnline(nav, { silent: false });
    }, 15000);
    // Allow Node test runners to exit (browsers ignore unref)
    if (probeTimer && typeof probeTimer.unref === 'function') probeTimer.unref();
  }

  /**
   * Retry a promise-returning fn with capped attempts and backoff.
   * Does not retry forever. Skips retries when clearly offline after first fail.
   */
  function withRetry(fn, options) {
    options = options || {};
    var retries = options.retries != null ? options.retries : 2;
    var delayMs = options.delayMs != null ? options.delayMs : 800;
    var label = options.label || 'request';
    var attempt = 0;

    function run() {
      attempt++;
      return Promise.resolve().then(fn).catch(function (err) {
        var msg = err && err.message ? err.message : String(err || '');
        var fatal = /Invalid http|invalid url|HTTP 40[134]|not a valid|does not look like|No internet/i.test(msg);
        var offlineNow = !isOnline();
        // attempts: initial + retries (retries=2 → up to 3 tries)
        if (fatal || attempt > retries || (offlineNow && attempt >= 1)) {
          if (global.ElionLog) ElionLog.warn(label + ' failed', msg);
          return Promise.reject(err);
        }
        if (global.ElionLog) ElionLog.info(label + ' retry ' + attempt, msg.slice(0, 80));
        return new Promise(function (resolve) {
          setTimeout(resolve, delayMs * attempt);
        }).then(run);
      });
    }
    return run();
  }

  function classifyFailure(err) {
    var msg = err && err.message ? err.message : String(err || '');
    // Specific causes first — do not mask them as OFFLINE
    if (/Invalid http|invalid url/i.test(msg)) {
      return { code: 'INVALID_URL', message: 'Invalid http(s) URL.' };
    }
    if (/empty playlist|does not look like|not a valid M3U|No channels found/i.test(msg)) {
      return { code: 'INVALID_PLAYLIST', message: 'The response is not a valid M3U playlist.' };
    }
    if (/timed out|timeout|AbortError/i.test(msg)) {
      return { code: 'TIMEOUT', message: 'The request timed out. Check the server or try again.' };
    }
    if (/HTTP\s*5\d\d/i.test(msg)) {
      return { code: 'SERVER', message: 'The playlist server returned an error.' };
    }
    if (/HTTP\s*4\d\d/i.test(msg)) {
      return { code: 'SERVER', message: 'The server rejected the request (HTTP client error).' };
    }
    if (/CORS|cross-origin|Access-Control|Network\/CORS/i.test(msg)) {
      return { code: 'CORS', message: 'The server blocked or is unreachable from the TV (CORS/network).' };
    }
    if (!isOnline() || /No internet connection/i.test(msg)) {
      return { code: 'OFFLINE', message: 'No internet connection. Saved playlists are still available.' };
    }
    if (/Failed to fetch|NetworkError/i.test(msg)) {
      return { code: 'CORS', message: 'The server blocked or is unreachable from the TV (CORS/network).' };
    }
    return { code: 'NETWORK', message: msg || 'Network request failed.' };
  }

  global.ElionNet = {
    init: init,
    isOnline: isOnline,
    setOnline: setOnline,
    onChange: onChange,
    withRetry: withRetry,
    classifyFailure: classifyFailure,
    updateBanner: updateBanner
  };
})(window);
