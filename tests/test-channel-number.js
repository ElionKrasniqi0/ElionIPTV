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

console.log('== Direct channel number ==\n');

var app = loadText('js/app.js');
var focus = loadText('js/focus.js');
var channels = loadText('js/channels.js');
var html = loadText('index.html');
var css = loadText('css/app.css');

assert(html.indexOf('id="channelNumberEntry"') !== -1, 'Number overlay is in the page');
assert(html.indexOf('id="channelNumberDigits"') !== -1, 'Overlay shows the typed number');
assert(css.indexOf('.channel-number-digits') !== -1 && css.indexOf('font-size: 92px') !== -1, 'Number is large enough for a TV');
assert(css.indexOf('top: 12%') !== -1, 'Overlay stays above the player controls');
assert(app.indexOf('Channel Not Found') !== -1, 'Missing numbers say Channel Not Found');
assert(app.indexOf('ElionPlayer.playChannel(ch)') !== -1, 'A matched number uses the existing player');
assert(app.indexOf('function playerChannelStep') !== -1, 'Previous and Next still use the channel step');
assert(!/document\.addEventListener\(\s*['"]keydown['"]/.test(app), 'App does not add a second keydown listener');
assert(focus.indexOf("addEventListener('keydown'") !== -1, 'Numbers share the existing keydown listener');
assert(focus.indexOf('function onKeyUp') !== -1 && focus.indexOf('digitFromEvent') !== -1, 'webOS keyup can supply a number the keydown missed');
assert(channels.indexOf('NUMBER_ENTRY_WAIT_MS') === -1, 'Channel selection has no typing delay');
assert(app.indexOf('armNumberCommit') === -1 && app.indexOf('NUMBER_ENTRY_WAIT_MS') === -1, 'The player does not wait before a finished number');
assert(app.indexOf("result.status === 'tune'") !== -1, 'A finished number opens immediately');
assert(channels.indexOf('function classifyDigits') !== -1, 'Longer channel numbers keep a short number from opening early');
assert(app.indexOf('numberEntryClear') !== -1, 'Back can clear the typed number');
assert(focus.indexOf('isTextEntryField') !== -1 && focus.indexOf('numberEntryBlocked') !== -1, 'Text fields keep their own number keys');
assert(app.indexOf("live: 1, categories: 1, category: 1, channels: 1, epg: 1") !== -1, 'Numbers are accepted on Live TV and the player');

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

var sb = createSandbox();
['js/logger.js', 'js/utils.js', 'js/errors.js', 'js/storage.js', 'js/m3u-parser.js', 'js/search.js', 'js/playlist-manager.js', 'js/channels.js', 'js/focus.js'].forEach(function (rel) {
  vm.runInNewContext(loadText(rel), sb, { filename: rel });
});

assert(sb.ElionFocus.digitFromEvent({ keyCode: 49 }) === '1', 'Key code 49 is 1');
assert(sb.ElionFocus.digitFromEvent({ keyCode: 48 }) === '0', 'Key code 48 is 0');
assert(sb.ElionFocus.digitFromEvent({ keyCode: 105 }) === '9', 'Numpad 9 is accepted');
assert(sb.ElionFocus.digitFromEvent({ key: '5', keyCode: 0 }) === '5', 'A key name is accepted when keyCode is empty');
assert(sb.ElionFocus.digitFromEvent({ code: 'Numpad3', key: '', keyCode: 0 }) === '3', 'Numpad code is accepted');
assert(sb.ElionFocus.digitFromEvent({ key: 'a', keyCode: 65 }) === '', 'Letters are not channel digits');

var reduce = sb.ElionChannels.reduceNumberEntry;
var typed = '';
['1', '2', '5'].forEach(function (d) { typed = reduce(typed, d); });
assert(typed === '125', '1 then 2 then 5 stays 125');
assert(reduce('1', '1') === '11', 'A fast second press of the same digit is kept');
assert(reduce('125', 'backspace') === '12', 'Backspace removes the last digit');
assert(reduce('12', 'delete') === '1', 'Delete removes the last digit');
assert(reduce('12', 'clear') === '', 'Clear removes the whole number');
typed = '';
'12345678901'.split('').forEach(function (d) { typed = reduce(typed, d); });
assert(typed === '1234567890', 'More than ten digits is ignored');

function playlistText(count, prefix) {
  var lines = ['#EXTM3U'];
  for (var i = 1; i <= count; i++) {
    lines.push('#EXTINF:-1 tvg-name="' + prefix + ' ' + i + '" group-title="Live",' + prefix + ' ' + i);
    lines.push('https://example.com/' + prefix.toLowerCase() + '/' + i + '.m3u8');
  }
  return lines.join('\n');
}

var imported = sb.ElionPlaylists.importFromText(playlistText(130, 'Alpha'), { name: 'Alpha', sourceType: 'paste' });
assert(imported.ok, 'Sample playlist imports');
assert(sb.ElionChannels.findByNumber(1).name === 'Alpha 1', 'Channel 1 is the first playlist channel');
assert(sb.ElionChannels.findByNumber(12).name === 'Alpha 12', 'Channel 12 keeps playlist order');
assert(sb.ElionChannels.findByNumber(125).name === 'Alpha 125', 'Channel 125 keeps playlist order');
assert(sb.ElionChannels.findByNumber(99999) === null, 'An unknown number is not found');
assert(sb.ElionChannels.findByNumber(0) === null, 'Zero is not a channel');

var firstId = sb.ElionChannels.findByNumber(1).id;
sb.ElionPlaylists.importFromText(playlistText(3, 'Beta'), { name: 'Beta', sourceType: 'paste' });
assert(sb.ElionChannels.findByNumber(1).name === 'Beta 1', 'The active playlist supplies channel 1');
var alphaId = sb.ElionPlaylists.getState().playlists.filter(function (p) { return p.name === 'Alpha'; })[0].id;
sb.ElionPlaylists.setActivePlaylist(alphaId);
assert(sb.ElionChannels.findByNumber(1).id === firstId, 'Switching back restores that playlist’s numbers');

var gap = [
  '#EXTM3U',
  '#EXTINF:-1 group-title="Live",One',
  'https://example.com/gap/1.m3u8',
  '#EXTINF:-1 group-title="Live",Twelve',
  'https://example.com/gap/12.m3u8',
  '#EXTINF:-1 group-title="Live",One Two Five',
  'https://example.com/gap/125.m3u8',
  '#EXTINF:-1 group-title="Live",Two Hundred',
  'https://example.com/gap/200.m3u8'
].join('\n');
sb.ElionPlaylists.importFromText(gap, { name: 'Gaps', sourceType: 'paste' });
var gapChannels = sb.ElionPlaylists.getState().channels;
gapChannels[0].number = 1;
gapChannels[1].number = 12;
gapChannels[2].number = 125;
gapChannels[3].number = 200;
var classify = sb.ElionChannels.classifyDigits;
assert(classify('1').status === 'partial' && classify('1').channel.name === 'One', '1 stays open because 12 and 125 still match');
assert(classify('12').status === 'partial' && classify('12').channel.name === 'Twelve', '12 stays open because 125 still matches');
assert(classify('125').status === 'tune' && classify('125').channel.name === 'One Two Five', '125 opens immediately');
assert(classify('2').status === 'partial' && !classify('2').channel, '2 waits because 200 is still possible');
assert(classify('20').status === 'partial', '20 waits for the rest of 200');
assert(classify('200').status === 'tune', '200 opens as soon as it is complete');
assert(classify('3').status === 'none', '3 cannot match any channel');
assert(classify('126').status === 'none', '126 cannot match any channel');
assert(classify('0').status === 'none', '0 is not a channel prefix');
var rapid = '';
['1', '2', '5'].forEach(function (d) { rapid = reduce(rapid, d); });
assert(classify(rapid).status === 'tune', 'Rapid entry of 125 is ready at once');

if (failed) {
  console.error('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nResult: ALL PASSED');
