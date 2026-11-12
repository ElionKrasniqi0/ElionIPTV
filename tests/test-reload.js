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

function loadText(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

console.log('== Instant reload ==\n');

var screens = loadText('js/screens.js');
var parser = loadText('js/m3u-parser.js');
var search = loadText('js/search.js');
var playlists = loadText('js/playlist-manager.js');
var reloadFn = screens.slice(screens.indexOf('function reloadActivePlaylist'), screens.indexOf('function isGenericSeriesLabel'));

assert(reloadFn.indexOf('setTimeout') === -1, 'Reload does not delay itself with a timer');
assert(reloadFn.indexOf("'Refreshing...'") !== -1, 'Reload says Refreshing... immediately');
assert(reloadFn.indexOf('Refreshing...') < reloadFn.indexOf('refreshPlaylist'), 'The status is shown before the refresh call');
assert(reloadFn.indexOf('playlistRefreshBusy') !== -1, 'A second Reload does not start another refresh');
assert(reloadFn.indexOf('saved channels are still available') !== -1, 'A failed refresh keeps the saved channels');
assert(parser.indexOf('setTimeout(step') === -1, 'Playlist parsing does not wait between slices');
assert(search.indexOf('setTimeout(step') === -1, 'The search index does not wait between slices');
assert(playlists.indexOf('var download = ElionUtils.downloadText') !== -1, 'The playlist request is started before loading UI work');

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

var m3u = '#EXTM3U\n#EXTINF:-1 group-title="News",One\nhttps://example.com/one.m3u8\n#EXTINF:-1 group-title="Sports",Two\nhttps://example.com/two.m3u8\n';
var big = ['#EXTM3U'];
for (var i = 1; i <= 3000; i++) {
  big.push('#EXTINF:-1 group-title="Live",Channel ' + i);
  big.push('https://example.com/c/' + i + '.m3u8');
}

function boot(mode, calls) {
  var sb = createSandbox();
  ['js/logger.js', 'js/utils.js', 'js/errors.js', 'js/net.js', 'js/storage.js', 'js/m3u-parser.js', 'js/search.js', 'js/playlist-manager.js'].forEach(function (rel) {
    vm.runInNewContext(loadText(rel), sb, { filename: rel });
  });
  sb.ElionUtils.downloadText = function (url) {
    calls.push(url);
    if (mode.value === 'hang') return new Promise(function () {});
    if (mode.value === 'fail') return Promise.reject(new Error('network down'));
    return Promise.resolve(m3u);
  };
  return sb;
}

var started = Date.now();
var parserSb = boot({ value: 'ok' }, []);
parserSb.ElionM3U.parseAsync(big.join('\n'), { playlistId: 'big' }).then(function (parsed) {
  var ms = Date.now() - started;
  assert(parsed.channels.length === 3000, 'A 3000-channel playlist parses');
  assert(ms < 1000, 'Parsing 3000 channels does not wait on timers (' + ms + 'ms)');

  var calls = [];
  var mode = { value: 'ok' };
  var sb = boot(mode, calls);
  return sb.ElionPlaylists.importFromUrl('https://example.com/list.m3u', 'Live').then(function (imported) {
    assert(imported.ok && imported.channelCount === 2, 'The first download fills the playlist');
    var id = imported.playlist.id;
    mode.value = 'hang';
    var before = calls.length;
    var pending = sb.ElionPlaylists.refreshPlaylist(id);
    assert(calls.length === before + 1, 'Refresh starts the download in the same call');
    return sb.ElionPlaylists.refreshPlaylist(id).then(function (second) {
      assert(second.ok === false && /already in progress/i.test(second.errors[0]), 'A second refresh does not download again');
      assert(calls.length === before + 1, 'No duplicate download was started');
      assert(typeof pending.then === 'function', 'The first refresh stays in flight');
    });
  });
}).then(function () {
  var calls = [];
  var mode = { value: 'ok' };
  var sb = boot(mode, calls);
  return sb.ElionPlaylists.importFromUrl('https://example.com/list.m3u', 'Live').then(function (imported) {
    mode.value = 'fail';
    return sb.ElionPlaylists.refreshPlaylist(imported.playlist.id);
  }).then(function (failedRefresh) {
    assert(failedRefresh.ok === false, 'A failed download is reported');
    assert(/network down/i.test(failedRefresh.errors[0] || ''), 'The failure message is available immediately');
    assert(sb.ElionPlaylists.getState().channelCount === 2, 'Saved channels remain after a failed download');
  });
}).then(function () {
  if (failed) {
    console.error('\n' + failed + ' failed');
    process.exit(1);
  }
  console.log('\nResult: ALL PASSED');
}).catch(function (err) {
  console.error('  FAIL ' + (err && err.stack || err));
  process.exit(1);
});
