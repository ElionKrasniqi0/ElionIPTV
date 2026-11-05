#!/usr/bin/env node
'use strict';

/**
 * Critical-path integration test for the FINAL OBJECTIVE:
 * add M3U → channels → categories → logos → search → favorites → playable channel objects.
 * Does not claim hardware decode on LG TV.
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
    createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {}, removeChild: function () {}, firstChild: null }; },
    addEventListener: function () {},
    body: { contains: function () { return false; } },
    querySelectorAll: function () { return []; }
  },
  window: null,
  navigator: { onLine: true, userAgent: 'node-test' },
  fetch: function () { return Promise.reject(new Error('no network')); }
};
sandbox.window = sandbox;

[
  'js/logger.js', 'js/utils.js', 'js/errors.js', 'js/storage.js', 'js/m3u-parser.js',
  'js/search.js', 'js/playlist-manager.js', 'js/favorites.js', 'js/channels.js', 'js/player.js'
].forEach(function (rel) {
  vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
});

console.log('== Critical path: M3U → browse → favorite → playable channel ==\n');

sandbox.ElionStorage.ready().then(function () {
  var m3u = fs.readFileSync(path.join(root, 'sample/demo.m3u'), 'utf8');
  var result = sandbox.ElionPlaylists.importFromText(m3u, { name: 'Demo', sourceType: 'paste' });
  assert(result.ok, '1. Import valid M3U');
  assert(result.channelCount >= 4, '2. Channels loaded (' + result.channelCount + ')');

  var state = sandbox.ElionPlaylists.getState();
  assert(state.categories.length >= 2, '3. Categories organized from group-title (' + state.categories.map(function (c) { return c.name; }).join(', ') + ')');

  var withLogo = state.channels.filter(function (c) { return c.logo && /^https?:\/\//.test(c.logo); });
  assert(withLogo.length >= 1, '4. Logos available when present in playlist');

  sandbox.ElionSearch.build(state.channels);
  var hits = sandbox.ElionPlaylists.searchChannels('Sintel');
  assert(hits.length === 1 && hits[0].name.indexOf('Sintel') !== -1, '5. Search finds channel');

  var ch = hits[0];
  sandbox.ElionFavorites.add(ch.id);
  assert(sandbox.ElionFavorites.isFavorite(ch.id), '6. Favorites add works');
  assert(sandbox.ElionFavorites.listChannels().length === 1, '7. Favorites list returns channel');

  assert(ch.url && /^https?:\/\//.test(ch.url), '8. Selected channel has playable http(s) URL for player');
  var fmt = sandbox.ElionPlayer.detectFormat(ch.url);
  assert(fmt && fmt.label, '9. Player format detection ready (' + fmt.label + ')');

  // Simulate restart persistence
  var channelsSaved = sandbox.ElionStorage.getChannels();
  var favsSaved = sandbox.ElionStorage.getFavorites();
  assert(channelsSaved.length === state.channelCount, '10. Channels persisted for restart');
  assert(favsSaved.indexOf(ch.id) !== -1, '11. Favorites persisted for restart');

  console.log('\nCritical path: ' + (failed ? failed + ' failed' : 'ALL PASSED'));
  console.log('Hardware decode on LG TV still requires docs/MANUAL_TV_TEST.md');
  if (failed) process.exit(1);
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
