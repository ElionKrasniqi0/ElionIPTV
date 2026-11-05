#!/usr/bin/env node
'use strict';

/**
 * Resilience: offline/net classify, malformed M3U, storage overwrite guard,
 * EPG isolation, import overlap, error handlers.
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');
var failed = 0;

function assert(cond, msg) {
  if (cond) console.log('  OK  ' + msg);
  else { failed++; console.error('  FAIL ' + msg); }
}

function makeStorage() {
  var mem = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}

function createSandbox(localStorage, online) {
  var sandbox = {
    console: console,
    URL: URL,
    Promise: Promise,
    Date: Date,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    XMLHttpRequest: function () {},
    NodeList: function () {},
    Element: { prototype: {} },
    indexedDB: undefined,
    localStorage: localStorage || makeStorage(),
    document: {
      getElementById: function (id) {
        if (id === 'offlineBanner') {
          return { classList: { add: function () {}, remove: function () {} }, textContent: '' };
        }
        return null;
      },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      body: { contains: function () { return false; }, classList: { toggle: function () {} }, appendChild: function () {} },
      documentElement: { setAttribute: function () {}, style: { setProperty: function () {} } },
      createElement: function () {
        return { style: {}, setAttribute: function () {}, appendChild: function () {}, classList: { add: function () {}, remove: function () {} } };
      }
    },
    window: null,
    navigator: { onLine: online !== false },
    fetch: function () { return Promise.reject(new Error('Failed to fetch')); }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.NodeList.prototype = {};
  return sandbox;
}

function loadCore(sandbox) {
  [
    'js/compat.js', 'js/logger.js', 'js/utils.js', 'js/net.js', 'js/errors.js', 'js/storage.js',
    'js/m3u-parser.js', 'js/search.js', 'js/playlist-manager.js', 'js/favorites.js', 'js/epg.js'
  ].forEach(function (rel) {
    vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
  });
}

console.log('== Resilience ==\n');

// --- Network classification ---
var sb = createSandbox(makeStorage(), false);
loadCore(sb);
sb.ElionNet.init();
sb.ElionNet.setOnline(true, { silent: true });
var to = sb.ElionNet.classifyFailure(new Error('Request timed out after 90s'));
assert(to.code === 'TIMEOUT', 'classifies timeout');
var http = sb.ElionNet.classifyFailure(new Error('HTTP 503 Service Unavailable'));
assert(http.code === 'SERVER', 'classifies server HTTP error');
var badUrl = sb.ElionErrors.fromException(new Error('Invalid http(s) URL.'));
assert(badUrl.code === 'INVALID_URL', 'errors.fromException INVALID_URL');
var cors = sb.ElionNet.classifyFailure(new Error('Failed to fetch'));
assert(cors.code === 'CORS' || cors.code === 'NETWORK', 'classifies fetch failure when online');
sb.ElionNet.setOnline(false, { silent: true });
assert(!sb.ElionNet.isOnline(), 'reports offline');
var off = sb.ElionNet.classifyFailure(new Error('Failed to fetch'));
assert(off.code === 'OFFLINE', 'classifies offline when navigator offline');

sb.ElionUtils.downloadText('https://example.com/x.m3u', 1000, { retries: 0 }).then(function () {
  assert(false, 'offline download should reject');
}).catch(function (err) {
  assert(/internet|offline|No internet/i.test(err.message), 'offline download clear message');

  // --- Malformed M3U keeps valid rows ---
  var mixed = [
    '#EXTM3U',
    '#EXTINF:-1,',
    'javascript:alert(1)',
    '#EXTINF:-1 group-title="OK",Good Channel',
    'https://cdn.example.com/ok.ts',
    '#EXTINF:-1,',
    'not-a-url',
    '#EXTINF:-1,Another',
    'https://cdn.example.com/ok2.ts'
  ].join('\n');
  var parsed = sb.ElionM3U.parse(mixed, { playlistId: 'r', skipDuplicates: true });
  assert(parsed.ok, 'malformed playlist still ok when valid channels exist');
  assert(parsed.channels.length === 2, 'keeps 2 valid channels (got ' + parsed.channels.length + ')');
  assert(parsed.warnings.length >= 1, 'emits warnings for bad rows');

  var empty = sb.ElionM3U.parse('', { playlistId: 'e' });
  assert(!empty.ok && empty.errors.length, 'empty playlist fails safely');

  var hugeHeader = '#EXTM3U\n' + Array(200).fill('#COMMENT junk').join('\n') +
    '\n#EXTINF:-1,Only\nhttps://example.com/only.ts\n';
  var h = sb.ElionM3U.parse(hugeHeader, { playlistId: 'h' });
  assert(h.ok && h.channels.length === 1, 'noise comments do not break parse');

  // --- Storage: refuse empty overwrite of large library ---
  var big = [];
  for (var i = 0; i < 60; i++) {
    big.push({ id: 'ch' + i, url: 'https://x/' + i, name: 'C' + i, playlistId: 'p' });
  }
  sb.ElionStorage.saveChannels(big);
  assert(sb.ElionStorage.getChannels().length === 60, 'saved large channel list');
  sb.ElionStorage.saveChannels([]);
  assert(sb.ElionStorage.getChannels().length === 60, 'blocked empty overwrite of large library');

  // --- EPG failure isolation ---
  try {
    sb.ElionEPG.parseXmltv('<not-xml');
    assert(false, 'invalid xmltv should throw');
  } catch (e) {
    assert(!!e, 'invalid xmltv throws without wiping app');
  }
  var nn = sb.ElionEPG.getNowNext({ name: 'x', tvgId: 'missing' });
  assert(nn && nn.now === null, 'EPG getNowNext safe with no data');

  // --- Import does not clear data on network fail ---
  var m3u = '#EXTM3U\n#EXTINF:-1,Keep\nhttps://example.com/keep.ts\n';
  sb.ElionPlaylists.importFromText(m3u, { name: 'KeepMe', sourceType: 'paste' });
  var before = sb.ElionPlaylists.getState().playlists.length;
  sb.ElionNet.setOnline(true, { silent: true });
  // Force offline for URL import
  sb.ElionNet.setOnline(false, { silent: true });
  sb.ElionPlaylists.importFromUrl('https://example.com/fail.m3u', 'Fail').then(function (r) {
    assert(!r.ok, 'failed URL import returns ok:false');
    assert(sb.ElionPlaylists.getState().playlists.length === before, 'failed import does not delete saved playlists');

    // Overlapping import guard
    sb.ElionNet.setOnline(true, { silent: true });
    var p1 = sb.ElionPlaylists.importFromTextAsync(m3u + m3u, { name: 'Slow', sourceType: 'paste' });
    var p2 = sb.ElionPlaylists.importFromTextAsync(m3u, { name: 'Overlap', sourceType: 'paste' });
    return Promise.all([p1, p2]).then(function (results) {
      var blocked = results.some(function (x) { return !x.ok && /already in progress|superseded/i.test((x.errors || []).join(' ')); });
      var oneOk = results.some(function (x) { return x.ok; });
      assert(oneOk && blocked, 'overlapping imports: one proceeds, one blocked');

      // Retry helper caps attempts
      var tries = 0;
      sb.ElionNet.setOnline(true, { silent: true });
      return sb.ElionNet.withRetry(function () {
        tries++;
        return Promise.reject(new Error('Failed to fetch'));
      }, { retries: 2, delayMs: 10, label: 'test' }).then(function () {
        assert(false, 'withRetry should reject');
      }).catch(function () {
        assert(tries === 3, 'withRetry attempts = 1 initial + 2 retries (got ' + tries + ')');
        console.log('\nResult: ' + (failed ? failed + ' failed' : 'ALL PASSED'));
        if (failed) process.exit(1);
      });
    });
  }).catch(function (err) {
    console.error(err);
    process.exit(1);
  });
});
