#!/usr/bin/env node
'use strict';

/**
 * Empty first launch, import, switch, replace, delete, persistence.
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
    _d: mem,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}

function createSandbox(localStorage) {
  var sandbox = {
    console: console,
    URL: URL,
    Promise: Promise,
    Date: Date,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    XMLHttpRequest: function () {},
    NodeList: function () {},
    Element: { prototype: {} },
    indexedDB: undefined,
    localStorage: localStorage || makeStorage(),
    document: {
      getElementById: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      body: { contains: function () { return false; }, classList: { toggle: function () {} } },
      documentElement: { setAttribute: function () {}, style: { setProperty: function () {} } },
      createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {} }; }
    },
    window: null,
    navigator: { onLine: true },
    fetch: function () { return Promise.reject(new Error('no network')); }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.NodeList.prototype = {};
  return sandbox;
}

function loadAll(sandbox) {
  [
    'js/compat.js', 'js/logger.js', 'js/utils.js', 'js/errors.js', 'js/storage.js',
    'js/m3u-parser.js', 'js/search.js', 'js/playlist-manager.js', 'js/favorites.js', 'js/channels.js'
  ].forEach(function (rel) {
    vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
  });
}

var m3uA = [
  '#EXTM3U',
  '#EXTINF:-1 group-title="News",Alpha One',
  'https://example.com/a1.ts',
  '#EXTINF:-1 group-title="News",Alpha Two',
  'https://example.com/a2.ts'
].join('\n');

var m3uB = [
  '#EXTM3U',
  '#EXTINF:-1 group-title="Sports",Beta Live',
  'https://example.com/b1.ts'
].join('\n');

var m3uReplace = [
  '#EXTM3U',
  '#EXTINF:-1 group-title="Movies",Replaced Channel',
  'https://example.com/new.ts'
].join('\n');

console.log('== Playlist lifecycle ==\n');

// --- 1. Empty first launch ---
var ls1 = makeStorage();
var sb1 = createSandbox(ls1);
loadAll(sb1);
sb1.ElionStorage.ready = function () { return Promise.resolve(); };
// hydrate sync path used by tests
sb1.ElionPlaylists.loadFromStorage();
var empty = sb1.ElionPlaylists.getState();
assert(empty.playlists.length === 0, 'first launch: no playlists');
assert(empty.channels.length === 0, 'first launch: no channels');
assert(empty.categories.length === 0, 'first launch: no categories');
assert(empty.channelCount === 0, 'first launch: channelCount 0');
assert(!empty.activePlaylistId, 'first launch: no active playlist');
assert(empty.phase === 'none' && sb1.ElionPlaylists.getLibraryPhase() === 'none', 'first launch shows the add-playlist state');

var welcomeSrc = fs.readFileSync(path.join(root, 'js/screens.js'), 'utf8');
assert(welcomeSrc.indexOf('Welcome to ELION IPTV') !== -1, 'welcome title present');
assert(welcomeSrc.indexOf('Add your IPTV playlist to start watching your favorite content.') !== -1, 'welcome empty message present');
assert(welcomeSrc.indexOf('ADD PLAYLIST') !== -1, 'welcome CTA copy present');
assert(welcomeSrc.indexOf('Add Playlist') !== -1, 'Add Playlist action present');
assert(welcomeSrc.indexOf("hubTile('live'") !== -1 && welcomeSrc.indexOf("hubTile('favorites'") !== -1, 'home hub has Live TV and Favorites');
assert(welcomeSrc.indexOf('afterImportSuccess') !== -1 && /function afterImportSuccess[\s\S]{0,500}navigate\('home'/.test(welcomeSrc), 'successful import returns to the dashboard');
assert(welcomeSrc.indexOf('getLibraryPhase') !== -1, 'dashboard follows playlist state');
assert(welcomeSrc.indexOf('No channels were found in this playlist.') !== -1, 'empty playlist state');
assert(!/BigBuckBunny|sample\/demo\.m3u|gtv-videos-bucket/i.test(welcomeSrc), 'no bundled demo stream references in screens');
assert(!/commondatastorage\.googleapis\.com/i.test(fs.readFileSync(path.join(root, 'js/playlist-manager.js'), 'utf8')), 'playlist-manager has no hardcoded demo URLs');

// --- 2. Import ---
var rA = sb1.ElionPlaylists.importFromText(m3uA, { name: 'Alpha', sourceType: 'paste' });
assert(rA.ok && rA.channelCount === 2, 'import playlist A (2 channels)');
var stA = sb1.ElionPlaylists.getState();
assert(stA.playlists.length === 1 && stA.playlists[0].name === 'Alpha', 'playlist A saved with name');
assert(stA.channelCount === 2, 'active library shows 2 channels');
assert(stA.categories.some(function (c) { return c.name === 'News'; }), 'categories from group-title');
assert(!!stA.activePlaylistId, 'import sets active playlist');
assert(sb1.ElionPlaylists.getLibraryPhase() === 'ready', 'successful import uses the full dashboard phase');
var kept = sb1.ElionPlaylists.getState().playlists.length;
var badImport = sb1.ElionPlaylists.importFromText('this is not a playlist', { name: 'Bad' });
assert(!badImport.ok, 'failed import is rejected');
assert(sb1.ElionPlaylists.getState().playlists.length === kept, 'failed import does not delete existing playlists');
assert(sb1.ElionPlaylists.getState().activePlaylistId === stA.activePlaylistId, 'failed import does not change the active playlist');

var rB = sb1.ElionPlaylists.importFromText(m3uB, { name: 'Beta', sourceType: 'paste' });
assert(rB.ok && rB.channelCount === 1, 'import playlist B (1 channel)');
var stB = sb1.ElionPlaylists.getState();
assert(stB.playlists.length === 2, 'two playlists stored');
assert(stB.channelCount === 1, 'active playlist is B (last imported)');
assert(stB.channels[0].name === 'Beta Live', 'visible channel is from B');

// --- 3. Switch ---
var idA = stB.playlists.filter(function (p) { return p.name === 'Alpha'; })[0].id;
var sw = sb1.ElionPlaylists.setActivePlaylist(idA);
assert(sw.ok, 'switch to Alpha');
var stSw = sb1.ElionPlaylists.getState();
assert(stSw.channelCount === 2, 'after switch: Alpha channels visible');
assert(stSw.categories.some(function (c) { return c.name === 'News'; }), 'after switch: Alpha categories');

// Favorites scoped to active
var chA = stSw.channels[0];
sb1.ElionFavorites.add(chA.id);
assert(sb1.ElionFavorites.listChannels().length === 1, 'favorite on active playlist listed');
sb1.ElionPlaylists.setActivePlaylist(stB.playlists.filter(function (p) { return p.name === 'Beta'; })[0].id);
assert(sb1.ElionFavorites.listChannels().length === 0, 'favorite from other playlist hidden while inactive');
sb1.ElionPlaylists.setActivePlaylist(idA);
assert(sb1.ElionFavorites.listChannels().length === 1, 'favorite returns when switching back');

// --- 4. Replace / update ---
var rep = sb1.ElionPlaylists.importFromText(m3uReplace, {
  id: idA,
  name: 'Alpha',
  sourceType: 'url',
  url: 'https://example.com/new.m3u'
});
assert(rep.ok && rep.channelCount === 1, 'replace playlist A content');
var stRep = sb1.ElionPlaylists.getState();
assert(stRep.playlists.filter(function (p) { return p.id === idA; })[0].url === 'https://example.com/new.m3u', 'replace stores new URL');
assert(stRep.channelCount === 1 && stRep.channels[0].name === 'Replaced Channel', 'replace updates channels');
assert(stRep.playlists.length === 2, 'replace keeps other playlists');

// --- 5. Persistence across "restart" ---
var snap = ls1;
var sb2 = createSandbox(snap);
loadAll(sb2);
sb2.ElionPlaylists.loadFromStorage();
var st2 = sb2.ElionPlaylists.getState();
assert(st2.playlists.length === 2, 'persistence: playlists restored');
assert(st2.playlists.some(function (p) { return p.name === 'Alpha'; }) && st2.playlists.some(function (p) { return p.name === 'Beta'; }), 'persistence: names kept');
assert(st2.allChannels.length === 2, 'persistence: all channels across playlists kept (1+1)');
// active should restore
assert(!!st2.activePlaylistId, 'persistence: active playlist restored');

// Ensure update does not wipe: re-load without clear
var before = JSON.stringify(sb2.ElionStorage.getPlaylists());
sb2.ElionPlaylists.loadFromStorage();
assert(JSON.stringify(sb2.ElionStorage.getPlaylists()) === before, 'reload does not overwrite saved playlists');

// --- 6. Delete with confirmation path (API) ---
var betaId = st2.playlists.filter(function (p) { return p.name === 'Beta'; })[0].id;
sb2.ElionPlaylists.removePlaylist(betaId);
var stDel = sb2.ElionPlaylists.getState();
assert(stDel.playlists.length === 1 && stDel.playlists[0].name === 'Alpha', 'delete removes playlist');
assert(!stDel.allChannels.some(function (c) { return c.playlistId === betaId; }), 'delete removes its channels');

sb2.ElionPlaylists.removePlaylist(stDel.playlists[0].id);
var stEmpty = sb2.ElionPlaylists.getState();
assert(stEmpty.playlists.length === 0 && stEmpty.channelCount === 0, 'delete last playlist returns to empty library');
assert(sb2.ElionPlaylists.getLibraryPhase() === 'none', 'removing the last playlist returns to the welcome state');

var sbEmpty = createSandbox(makeStorage());
loadAll(sbEmpty);
sbEmpty.ElionStorage.savePlaylists([{ id: 'blank', name: 'Blank', sourceType: 'paste', url: '', channelCount: 0, updatedAt: 1, createdAt: 1 }]);
sbEmpty.ElionStorage.saveChannels([]);
sbEmpty.ElionStorage.saveSettings({ activePlaylistId: 'blank' });
sbEmpty.ElionPlaylists.loadFromStorage();
assert(sbEmpty.ElionPlaylists.getLibraryPhase() === 'empty', 'saved playlist with no channels is not a populated dashboard');

// Confirm screens require confirmation dialog for delete
assert(/confirmDialog\([\s\S]*Remove|\bdelete\b/i.test(welcomeSrc), 'UI asks confirmation before delete');

console.log('\nResult: ' + (failed ? failed + ' failed' : 'ALL PASSED'));
if (failed) process.exit(1);
