(function (global) {
  'use strict';

  var CODES = {
    INVALID_URL: 'INVALID_URL',
    INVALID_PLAYLIST: 'INVALID_PLAYLIST',
    EMPTY_PLAYLIST: 'EMPTY_PLAYLIST',
    NETWORK: 'NETWORK',
    OFFLINE: 'OFFLINE',
    TIMEOUT: 'TIMEOUT',
    CORS: 'CORS',
    SERVER: 'SERVER',
    MISSING_URL: 'MISSING_URL',
    STREAM: 'STREAM',
    UNSUPPORTED: 'UNSUPPORTED',
    STORAGE: 'STORAGE',
    PAIRING: 'PAIRING',
    EPG: 'EPG',
    UNKNOWN: 'UNKNOWN'
  };

  var MESSAGES = {
    INVALID_URL: 'Unable to load the playlist. Please check the address and try again.',
    INVALID_PLAYLIST: 'That file does not look like a TV playlist. Please check it and try again.',
    EMPTY_PLAYLIST: 'No channels were found in this playlist.',
    NETWORK: 'Unable to reach the playlist. Check your internet connection and try again.',
    OFFLINE: 'No internet connection. Your saved playlists and channels are still available.',
    TIMEOUT: 'This is taking too long. Please try again in a moment.',
    CORS: 'The playlist could not be downloaded to the TV. Try paste import or Phone/PC import instead.',
    SERVER: 'The playlist server did not respond correctly. Please try again later.',
    MISSING_URL: 'This channel cannot be played because it has no stream address.',
    STREAM: 'This channel could not be played. It may be temporarily unavailable.',
    UNSUPPORTED: 'This channel format is not supported on this TV.',
    STORAGE: 'Could not save your data. Please try again. Your current list was kept in memory.',
    PAIRING: 'Phone/PC connection failed. Check the companion address in Settings and try again.',
    EPG: 'The TV guide could not be loaded. You can still watch channels as usual.',
    UNKNOWN: 'Something went wrong. Please try again.'
  };

  function create(code, detail) {
    var c = CODES[code] ? code : CODES.UNKNOWN;
    return {
      code: c,
      message: MESSAGES[c],
      detail: detail && global.ElionLog ? ElionLog.redact(String(detail)) : (detail ? String(detail).slice(0, 200) : '')
    };
  }

  function fromException(err, fallbackCode) {
    if (global.ElionNet && typeof ElionNet.classifyFailure === 'function') {
      var classified = ElionNet.classifyFailure(err);
      if (classified && classified.code && CODES[classified.code]) {
        return create(classified.code, err && err.message ? err.message : classified.message);
      }
    }
    var msg = err && err.message ? err.message : String(err || '');
    if (/offline|No internet/i.test(msg)) return create('OFFLINE', msg);
    if (/timed out|timeout|AbortError/i.test(msg)) return create('TIMEOUT', msg);
    if (/CORS|Failed to fetch|NetworkError|cross-origin/i.test(msg)) return create('CORS', msg);
    if (/HTTP\s*[45]\d\d/i.test(msg)) return create('SERVER', msg);
    if (/Invalid http|invalid url/i.test(msg)) return create('INVALID_URL', msg);
    if (/empty playlist|does not look like|M3U|EXTINF|parse/i.test(msg)) return create('INVALID_PLAYLIST', msg);
    if (/storage|quota|idb|indexeddb/i.test(msg)) return create('STORAGE', msg);
    if (/pair|companion/i.test(msg)) return create('PAIRING', msg);
    if (/codec|decode|format|unsupported/i.test(msg)) return create('UNSUPPORTED', msg);
    if (/stream|playback|media/i.test(msg)) return create('STREAM', msg);
    if (/xmltv|epg/i.test(msg)) return create('EPG', msg);
    return create(fallbackCode || 'UNKNOWN', msg);
  }

  function clearLoadingUi() {
    try {
      if (global.ElionUI && ElionUI.setLoading) ElionUI.setLoading(false);
    } catch (e) { /* ignore */ }
    try {
      var loading = document.getElementById('importLoading');
      if (loading) loading.classList.remove('active');
      var globalLoading = document.getElementById('globalLoading');
      if (globalLoading) globalLoading.classList.remove('active');
    } catch (e2) { /* ignore */ }
  }

  function show(err) {
    var e = err && err.code ? err : fromException(err);
    if (global.ElionLog) ElionLog.error('UI error', e);
    try {
      if (global.ElionUI && ElionUI.toast) {
        ElionUI.toast(e.message);
      }
    } catch (t) { /* ignore */ }
    clearLoadingUi();
    return e;
  }

  var handlersInstalled = false;

  function installGlobalHandlers() {
    if (handlersInstalled) return;
    handlersInstalled = true;

    window.addEventListener('error', function (ev) {
      try {
        if (global.ElionLog) {
          ElionLog.error('Unhandled error', ev && (ev.message || (ev.error && ev.error.message)));
        }
      } catch (e) { /* ignore */ }
      clearLoadingUi();
      // Do not preventDefault — keep DevTools / inspector visibility
    });

    window.addEventListener('unhandledrejection', function (ev) {
      try {
        var reason = ev && ev.reason;
        var msg = reason && reason.message ? reason.message : reason;
        if (global.ElionLog) ElionLog.error('Unhandled rejection', msg);
      } catch (e) { /* ignore */ }
      clearLoadingUi();
    });
  }

  global.ElionErrors = {
    CODES: CODES,
    MESSAGES: MESSAGES,
    create: create,
    fromException: fromException,
    show: show,
    clearLoadingUi: clearLoadingUi,
    installGlobalHandlers: installGlobalHandlers
  };
})(window);
