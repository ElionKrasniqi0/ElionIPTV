(function (global) {
  'use strict';

  /**
   * Phone / PC import via LAN companion relay.
   *
   * Architecture (supported on webOS — TV cannot host an inbound HTTP server):
   * 1. User runs companion/server.js on a PC on the same network.
   * 2. TV creates a short pairing code and registers with the companion.
   * 3. Phone/PC opens companion page, enters code, submits M3U URL or content.
   * 4. TV polls companion until payload arrives or code expires.
   */

  var pollTimer = null;
  var session = null;

  function getBaseUrl() {
    var settings = ElionStorage.getSettings();
    return String(settings.companionBaseUrl || '').replace(/\/$/, '');
  }

  function generateCode() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 6; i++) {
      out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return out;
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    session = null;
  }

  function startSession(onUpdate) {
    stop();
    var base = getBaseUrl();
    if (!base) {
      return Promise.resolve({
        ok: false,
        error: 'Set Companion Server URL in Settings first (example: http://192.168.1.20:8787).'
      });
    }

    var code = generateCode();
    var expiresAt = Date.now() + 10 * 60 * 1000;

    session = { code: code, base: base, expiresAt: expiresAt, status: 'connecting' };

    return fetch(base + '/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, expiresAt: expiresAt, app: 'ELION IPTV' })
    }).then(function (res) {
      if (!res.ok) throw new Error('Companion returned HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      session.status = 'waiting';
      session.pairUrl = data.pairUrl || (base + '/?code=' + encodeURIComponent(code));
      session.qrUrl = data.qrUrl || session.pairUrl;

      if (onUpdate) onUpdate(getSession());

      pollTimer = setInterval(function () {
        pollOnce(onUpdate);
      }, 2000);

      return { ok: true, session: getSession() };
    }).catch(function (err) {
      stop();
      return {
        ok: false,
        error: (err && err.message ? err.message : String(err)) +
          ' — Make sure the companion server is running on your LAN and the URL is correct.'
      };
    });
  }

  function pollOnce(onUpdate) {
    if (!session) return;
    if (Date.now() > session.expiresAt) {
      session.status = 'expired';
      if (onUpdate) onUpdate(getSession());
      stop();
      return;
    }

    fetch(session.base + '/api/pair/' + encodeURIComponent(session.code), {
      method: 'GET',
      cache: 'no-store'
    }).then(function (res) {
      if (res.status === 404) {
        session.status = 'expired';
        if (onUpdate) onUpdate(getSession());
        stop();
        return null;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || !session) return;
      if (data.status === 'ready' && data.payload) {
        session.status = 'importing';
        if (onUpdate) onUpdate(getSession());
        return importPayload(data.payload).then(function (result) {
          session.status = result.ok ? 'done' : 'error';
          session.result = result;
          session.error = result.ok ? null : (result.errors || ['Import failed']).join(' ');
          if (onUpdate) onUpdate(getSession());
          // consume
          fetch(session.base + '/api/pair/' + encodeURIComponent(session.code) + '/consume', { method: 'POST' }).catch(function () {});
          var doneSession = getSession();
          stop();
          return doneSession;
        });
      }
      session.status = data.status || 'waiting';
      if (onUpdate) onUpdate(getSession());
    }).catch(function (err) {
      if (!session) return;
      session.lastPollError = err.message || String(err);
      if (onUpdate) onUpdate(getSession());
    });
  }

  function importPayload(payload) {
    if (payload.url) {
      return ElionPlaylists.importFromUrl(payload.url, payload.name || 'Phone/PC Import');
    }
    if (payload.content) {
      return Promise.resolve(ElionPlaylists.importFromText(payload.content, {
        name: payload.name || 'Phone/PC Import',
        sourceType: 'companion'
      }));
    }
    return Promise.resolve({ ok: false, errors: ['Companion payload was empty.'] });
  }

  function getSession() {
    if (!session) return null;
    return Object.assign({}, session);
  }

  global.ElionPairing = {
    startSession: startSession,
    stop: stop,
    getSession: getSession,
    getBaseUrl: getBaseUrl,
    generateCode: generateCode
  };
})(window);
