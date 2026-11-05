#!/usr/bin/env node
'use strict';

/**
 * ELION IPTV automated test suite (Node).
 * Covers M3U fixtures, search, storage sanitization, security, and app-logic smoke tests.
 * Does NOT claim real-device stream playback.
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var fixtures = path.join(__dirname, 'fixtures');
var failed = 0;
var passed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  OK  ' + msg);
  } else {
    failed++;
    console.error('  FAIL ' + msg);
  }
}

function createSandbox() {
  var store = {};
  var sandbox = {
    console: console,
    URL: URL,
    Promise: Promise,
    Date: Date,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    TextEncoder: typeof TextEncoder !== 'undefined' ? TextEncoder : undefined,
    crypto: typeof crypto !== 'undefined' ? crypto : undefined,
    indexedDB: undefined,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    document: {
      getElementById: function () { return null; },
      createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {} }; },
      addEventListener: function () {},
      body: { contains: function () { return false; } },
      querySelectorAll: function () { return []; }
    },
    window: null,
    navigator: { onLine: true, userAgent: 'node-test' },
    fetch: function () { return Promise.reject(new Error('no network in unit tests')); }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadAll(sandbox) {
  [
    'js/logger.js',
    'js/utils.js',
    'js/errors.js',
    'js/storage.js',
    'js/m3u-parser.js',
    'js/search.js',
    'js/playlist-manager.js',
    'js/favorites.js',
    'js/channels.js',
    'js/parental.js'
  ].forEach(function (rel) {
    vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
  });
}

function readFix(name) {
  return fs.readFileSync(path.join(fixtures, name), 'utf8');
}

function section(title) {
  console.log('\n== ' + title + ' ==');
}

/* ---------------- M3U ---------------- */
section('A. M3U Parser fixtures');
var sb = createSandbox();
loadAll(sb);
var parse = sb.ElionM3U.parse;

(function () {
  var r = parse(readFix('standard.m3u'), { playlistId: 't' });
  assert(r.ok && r.channels.length === 2, 'standard: 2 channels');
  assert(r.channels[0].url.indexOf('one.m3u8') !== -1 && r.channels[0].name === 'Channel One', 'standard: URL tied to name');
})();

(function () {
  var r = parse(readFix('with-logos.m3u'), { playlistId: 't' });
  assert(r.ok && r.channels[0].logo.indexOf('https://') === 0, 'logos assigned');
})();

(function () {
  var r = parse(readFix('with-groups.m3u'), { playlistId: 't' });
  assert(r.categories.length === 2, 'group-title categories extracted');
  assert(r.channels.filter(function (c) { return c.group === 'News'; }).length === 2, 'News group count');
})();

(function () {
  var r = parse(readFix('with-tvg.m3u'), { playlistId: 't' });
  assert(r.channels[0].tvgId === 'bbc1.uk', 'tvg-id captured');
  assert(r.channels[0].tvgName === 'BBC One', 'tvg-name captured');
})();

(function () {
  var r = parse(readFix('missing-meta.m3u'), { playlistId: 't' });
  assert(r.ok && r.channels.length === 2, 'missing metadata still parses');
  assert(r.channels[1].name.length > 0, 'empty title gets fallback name');
})();

(function () {
  var r = parse(readFix('multi-category.m3u'), { playlistId: 't' });
  assert(r.categories.length === 5, 'multiple categories');
})();

(function () {
  var r = parse(readFix('special-chars.m3u'), { playlistId: 't' });
  assert(r.ok && r.channels.length === 2, 'special characters parse');
  assert(r.channels[0].url.indexOf('token=') !== -1, 'query string preserved');
})();

(function () {
  var r = parse(readFix('duplicates.m3u'), { playlistId: 't' });
  assert(r.channels.length === 2, 'duplicates skipped');
  assert(r.warnings.length >= 1, 'duplicate warning emitted');
})();

(function () {
  var r = parse(readFix('empty.m3u'), { playlistId: 't' });
  assert(!r.ok && r.errors.length, 'empty playlist errors');
})();

(function () {
  var r = parse(readFix('invalid.m3u'), { playlistId: 't' });
  assert(!r.ok, 'invalid playlist rejected');
})();

(function () {
  var r = parse(readFix('unsafe.m3u'), { playlistId: 't' });
  assert(r.ok, 'unsafe playlist does not crash');
  assert(r.channels.length === 1, 'javascript: URL rejected, safe channel kept');
  assert(r.channels[0].logo.indexOf('https://') === 0, 'javascript logo rejected');
})();

(function () {
  var large = readFix('large.m3u');
  var t0 = Date.now();
  var r = parse(large, { playlistId: 'big' });
  var ms = Date.now() - t0;
  assert(r.ok && r.channels.length === 2500, 'large playlist 2500 channels (got ' + r.channels.length + ')');
  assert(ms < 5000, 'large playlist parse < 5s (took ' + ms + 'ms)');
  assert(r.categories.length === 5, 'large playlist categories');
  console.log('      large parse time: ' + ms + 'ms');
})();

/* ---------------- Search / playlists ---------------- */
section('B. Search, favorites, persistence logic');
sb.ElionStorage.ready().then(function () {
  var imported = sb.ElionPlaylists.importFromText(readFix('multi-category.m3u'), { name: 'Multi', sourceType: 'paste' });
  assert(imported.ok, 'importFromText ok');
  assert(sb.ElionPlaylists.getState().channelCount === 5, 'channels in manager');

  sb.ElionSearch.build(sb.ElionPlaylists.getState().channels);
  var hits = sb.ElionPlaylists.searchChannels('Mov');
  assert(hits.length === 1 && hits[0].group === 'Movies', 'search by category/name');

  var ch = sb.ElionPlaylists.getState().channels[0];
  sb.ElionFavorites.add(ch.id);
  assert(sb.ElionFavorites.isFavorite(ch.id), 'favorite add');
  sb.ElionFavorites.toggle(ch.id);
  assert(!sb.ElionFavorites.isFavorite(ch.id), 'favorite remove');

  // persistence round-trip via storage memory/LS
  sb.ElionStorage.saveSettings({ theme: 'light', language: 'de' });
  var settings = sb.ElionStorage.getSettings();
  assert(settings.theme === 'light' && settings.language === 'de', 'settings persist theme/language');

  // corrupt settings recovery
  sb.ElionStorage.remove('settings');
  sb.localStorage.setItem('elion_iptv_settings', '{bad');
  var s2 = sb.ElionStorage.getSettings();
  assert(s2 && s2.theme === 'dark' && s2.language === 'en', 'corrupt settings recovers defaults');

  // logger redaction
  var red = sb.ElionLog.redact('see https://secret.example/playlist.m3u?token=abc');
  assert(red.indexOf('secret.example') === -1, 'logger redacts playlist URLs');

  // parental hash not plaintext
  return sb.ElionParental.setPin('1234').then(function (r) {
    assert(r.ok, 'PIN set');
    var pinHash = sb.ElionStorage.getSettings().parentalPinHash;
    assert(pinHash && pinHash.indexOf('1234') === -1, 'PIN not stored plaintext');
    return sb.ElionParental.verifyPin('1234');
  }).then(function (ok) {
    assert(ok, 'PIN verifies');
  });
}).then(function () {
  /* Multiple playlists */
  sb.ElionPlaylists.importFromText(readFix('standard.m3u'), { name: 'Std', sourceType: 'paste' });
  assert(sb.ElionPlaylists.getState().playlists.length >= 2, 'multiple playlists');

  /* Channels sort */
  var alpha = sb.ElionChannels.sortChannels(sb.ElionPlaylists.getState().channels, 'alpha');
  assert(alpha.length > 1, 'alpha sort returns list');

  /* Errors helpers */
  var netErr = sb.ElionErrors.fromException(new Error('Failed to fetch'), 'NETWORK');
  assert(netErr.code === 'NETWORK' || netErr.code === 'CORS' || netErr.code === 'OFFLINE', 'error classification network-family (' + netErr.code + ')');

  section('C. Security');
  assert(sb.ElionM3U.sanitizeMediaUrl('javascript:alert(1)') === '', 'blocks javascript stream URL');
  assert(sb.ElionM3U.sanitizeLogoUrl('data:text/html,x') === '', 'blocks data logo');
  assert(sb.ElionUtils.isValidHttpUrl('ftp://x') === false, 'rejects non-http playlist URL');

  section('Summary');
  console.log('Passed: ' + passed + '  Failed: ' + failed);
  console.log('\nNOTE: Real LG webOS stream playback was NOT tested in this automated suite.');
  console.log('See docs/MANUAL_TV_TEST.md for device verification steps.');
  if (failed) process.exit(1);
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
