#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var failed = 0;

function assert(cond, msg) {
  if (cond) console.log('  OK  ' + msg);
  else { failed++; console.error('  FAIL ' + msg); }
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
    indexedDB: undefined,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    navigator: { onLine: true },
    fetch: function () { return Promise.reject(new Error('no network')); }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function load(sandbox, rel) {
  vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
}

console.log('== Provider category order ==\n');

var sb = createSandbox();
['js/logger.js', 'js/utils.js', 'js/errors.js', 'js/storage.js', 'js/m3u-parser.js', 'js/search.js', 'js/playlist-manager.js', 'js/channels.js'].forEach(function (rel) {
  load(sb, rel);
});

var textA = fs.readFileSync(path.join(__dirname, 'fixtures', 'provider-order.m3u'), 'utf8');
var textB = fs.readFileSync(path.join(__dirname, 'fixtures', 'provider-order-b.m3u'), 'utf8');
var parsed = sb.ElionM3U.parse(textA, { playlistId: 'a' });
var names = parsed.categories.map(function (c) { return c.name; });

assert(parsed.ok, 'provider playlist parses');
assert(names.join('|') === 'Sports & Live|Kids Zone|Uncategorized|News, World', 'categories follow first appearance, not A–Z (' + names.join('|') + ')');
assert(parsed.categories[0].count === 2, 'Sports & Live keeps both channels');
assert(parsed.channels[0].group === 'Sports & Live' && parsed.channels[2].group === 'Sports & Live', 'same category stays on its channels');
assert(parsed.channels[0].name === 'Zebra Sports' && parsed.channels[2].name === 'Alpha Sports', 'channels stay in playlist order inside the category');
assert(parsed.channels[0].tvgId === 'sp.1' && parsed.channels[0].tvgName === 'Zebra Sports', 'tvg-id and tvg-name are kept');
assert(parsed.channels[0].logo.indexOf('https://') === 0, 'tvg-logo is kept');
assert(parsed.channels[3].group === 'Uncategorized', 'missing group-title becomes Uncategorized');
assert(parsed.channels[5].group === 'Kids Zone', 'EXTGRP does not replace group-title');
assert(names.indexOf('A') === -1 && names.indexOf('B') === -1, 'no letter categories are created');

var sports = parsed.channels.filter(function (c) { return c.group === 'Sports & Live'; }).map(function (c) { return c.name; });
assert(sports.join('|') === 'Zebra Sports|Alpha Sports', 'category members stay in provider order');

var parsedB = sb.ElionM3U.parse(textB, { playlistId: 'b' });
assert(parsedB.categories.map(function (c) { return c.name; }).join('|') === 'News, World|Sports & Live|Kids Zone', 'a second playlist keeps its own order');

var imported = sb.ElionPlaylists.importFromText(textA, { name: 'Provider A', sourceType: 'paste' });
assert(imported.ok, 'playlist import keeps the parse');
var stateA = sb.ElionPlaylists.getState();
assert(stateA.categories.map(function (c) { return c.name; }).join('|') === names.join('|'), 'saved categories keep provider order');
var grouped = sb.ElionPlaylists.getChannelsByGroup('Sports & Live').map(function (c) { return c.name; });
assert(grouped.join('|') === 'Zebra Sports|Alpha Sports', 'group lookup keeps provider channel order');

sb.ElionPlaylists.importFromText(textB, { name: 'Provider B', sourceType: 'paste' });
var stateB = sb.ElionPlaylists.getState();
assert(stateB.categories.map(function (c) { return c.name; }).join('|') === 'News, World|Sports & Live|Kids Zone', 'switching to another playlist uses that playlist order');

var idA = stateA.playlists[0].id;
sb.ElionPlaylists.setActivePlaylist(idA);
var back = sb.ElionPlaylists.getState();
assert(back.categories.map(function (c) { return c.name; }).join('|') === 'Sports & Live|Kids Zone|Uncategorized|News, World', 'returning to the first playlist restores its order');

var byCategory = sb.ElionChannels.sortChannels(sb.ElionPlaylists.getState().channels, 'category');
assert(byCategory[0].group === 'Sports & Live' && byCategory[2].group === 'Kids Zone', 'category sort follows provider order');

if (failed) {
  console.error('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nResult: ALL PASSED');
