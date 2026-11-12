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

var playerSrc = fs.readFileSync(path.join(root, 'js', 'player.js'), 'utf8');
var appSrc = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

console.log('== Playback recovery ==\n');

assert(playerSrc.indexOf('playToken') !== -1, 'Stale playback is cancelled with playToken');
assert(playerSrc.indexOf("addEventListener('offline'") !== -1, 'Offline is observed');
assert(playerSrc.indexOf("addEventListener('online'") !== -1, 'Online is observed');
assert(playerSrc.indexOf('recoverMediaError') !== -1, 'HLS media errors can recover in place');
assert(playerSrc.indexOf('startLoad') !== -1, 'HLS network errors can reload in place');
assert(playerSrc.indexOf('userPaused') !== -1, 'A manual pause is not treated as a failure');
assert(playerSrc.indexOf('MAX_AUTO_RETRY') !== -1, 'Automatic retries are capped');
assert(playerSrc.indexOf('lastProgressAt') !== -1, 'Stall detection uses progress timestamps');
assert(playerSrc.indexOf('status.loading') !== -1, 'Intentional loading is tracked separately from buffering');
assert(playerSrc.indexOf('Your internet connection has been interrupted. Reconnecting...') !== -1, 'Offline copy');
assert(playerSrc.indexOf('Trying to restore playback...') !== -1, 'Reconnecting copy');
assert(playerSrc.indexOf('This channel is currently unavailable. Please try again later.') !== -1, 'Unavailable copy');
assert(playerSrc.indexOf('Unable to play this channel. Please select another channel.') !== -1, 'Final playback copy');
assert(appSrc.indexOf('playerErrorTitle') !== -1, 'Error title is updated from the player');
assert(appSrc.indexOf('st.loading || st.recovering') !== -1, 'Overlay is not driven by transient buffering alone');
assert(appSrc.indexOf('btnErrorRetry') !== -1, 'Manual retry remains available');
assert(html.indexOf('id="btnPrev"') !== -1 && html.indexOf('id="btnNext"') !== -1 && html.indexOf('id="btnPlayPause"') !== -1 && html.indexOf('id="btnCategories"') !== -1, 'Player controls remain');

var listeners = {};
var video = {
  paused: true,
  currentTime: 0,
  readyState: 0,
  duration: Infinity,
  error: null,
  networkState: 0,
  firstChild: null,
  audioTracks: null,
  textTracks: null,
  addEventListener: function (name, fn) {
    if (!listeners[name]) listeners[name] = [];
    listeners[name].push(fn);
  },
  play: function () { this.paused = false; return Promise.resolve(); },
  pause: function () { this.paused = true; },
  load: function () {},
  removeAttribute: function () {},
  appendChild: function () {},
  canPlayType: function () { return ''; }
};
var screen = {
  classList: {
    contains: function (name) { return name === 'active'; }
  }
};
var context = {
  console: console,
  navigator: { onLine: true },
  document: {
    getElementById: function (id) {
      if (id === 'playerScreen') return screen;
      return null;
    },
    createElement: function () {
      return { setAttribute: function () {} };
    },
    head: { appendChild: function () {} }
  },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  ElionStorage: {
    getSettings: function () { return { bufferSeconds: 3, rememberLastChannel: false, autoplayNext: false }; },
    getRecents: function () { return []; },
    saveRecents: function () {},
    set: function () {}
  },
  ElionParental: { requireUnlock: function () { return Promise.resolve(true); } },
  ElionPlaylists: { applyUdpProxy: function (url) { return url; } },
  ElionUI: { toast: function () {} },
  ElionChannels: {}
};
context.window = context;
context.global = context;
vm.createContext(context);
vm.runInContext(playerSrc, context);

var fault = context.ElionPlayer.classifyPlaybackFault('offline', false);
assert(fault.title === 'Internet connection lost', 'Offline fault title');
assert(fault.retry === true, 'Offline fault may retry');
assert(context.ElionPlayer.nextRetryDelay(0) === 2000, 'First retry waits 2s');
assert(context.ElionPlayer.nextRetryDelay(1) === 5000, 'Second retry waits 5s');
assert(context.ElionPlayer.nextRetryDelay(2) === 12000, 'Third retry waits 12s');
assert(context.ElionPlayer.nextRetryDelay(9) === 12000, 'Further retries stay on the last delay');
assert(context.ElionPlayer.classifyPlaybackFault(4, true).title === 'Stream unavailable', 'Bad address is unavailable');
assert(context.ElionPlayer.classifyPlaybackFault('unsupported').retry === false, 'Unsupported streams are not retried');

context.ElionPlayer.bindVideo(video);
context.ElionPlayer.playChannel({ id: 'c1', name: 'Alpha', url: 'http://example.test/a.mp4' }).then(function () {
  video.error = { code: 2 };
  listeners.error[0]();
  var st = context.ElionPlayer.getStatus();
  assert(st.recovering === true, 'A network error starts recovery');
  assert(st.error === null, 'Recovery does not show the final error yet');
  assert(st.recoveryDetail.indexOf('Trying to restore playback') !== -1, 'Recovery explains itself');
  assert(st.channel && st.channel.id === 'c1', 'The same channel is kept');
  context.ElionPlayer.stop();
  var stopped = context.ElionPlayer.getStatus();
  assert(stopped.recovering === false, 'Leaving the player cancels recovery');
  if (failed) process.exit(1);
  console.log('\nResult: ALL PASSED');
}).catch(function (err) {
  console.error('  FAIL playback recovery simulation', err && err.message);
  process.exit(1);
});
