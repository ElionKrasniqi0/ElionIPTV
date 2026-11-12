#!/usr/bin/env node
'use strict';

/**
 * Verifies "Loading channel…" overlay rules:
 * - show on intentional channel open / switch
 * - hide when playback starts
 * - never reappear from waiting/stalled/loadstart during healthy play
 * - temporary buffering does not restart playback
 * - long sessions (2/5/10/30 min) do not flip loading back on
 * - genuine failures still enter recovery / final error
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

var playerSrc = fs.readFileSync(path.join(root, 'js', 'player.js'), 'utf8');
var appSrc = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

console.log('== Loading overlay behavior ==\n');

assert(playerSrc.indexOf('loading: false') !== -1, 'Player tracks intentional loading separately');
assert(playerSrc.indexOf('lastProgressAt') !== -1, 'Stall watch uses wall-clock progress');
assert(playerSrc.indexOf('STALL_FAIL_MS') !== -1, 'Stall recovery has a generous live-stream grace period');
assert(playerSrc.indexOf('noteMediaProgress') !== -1, 'Progress is recorded from playing/timeupdate');
assert(playerSrc.indexOf("addEventListener('waiting'") !== -1, 'waiting is still observed');
assert(playerSrc.indexOf('status.loading = true') !== -1, 'startPlayback / recovery set loading');
assert(appSrc.indexOf('st.loading || st.recovering') !== -1, 'Overlay uses loading/recovering, not raw buffering');
assert(appSrc.indexOf("setPlayerStatus('Buffering')") !== -1, 'Mid-stream waits use Buffering status text');

/* --- Fake timers for long-session simulation --- */
var now = 1e12;
var timers = [];
var timerSeq = 0;

function fakeSetTimeout(fn, ms) {
  var id = ++timerSeq;
  timers.push({ id: id, fn: fn, due: now + (ms || 0), cleared: false });
  return id;
}

function fakeClearTimeout(id) {
  for (var i = 0; i < timers.length; i++) {
    if (timers[i].id === id) timers[i].cleared = true;
  }
}

function advance(ms) {
  now += ms;
  var guard = 0;
  while (guard++ < 500) {
    var next = null;
    for (var i = 0; i < timers.length; i++) {
      var t = timers[i];
      if (t.cleared || t.due > now) continue;
      if (!next || t.due < next.due) next = t;
    }
    if (!next) break;
    next.cleared = true;
    try { next.fn(); } catch (e) { console.error(e); }
  }
}

var listeners = {};
var playCalls = 0;
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
  _elionToken: 0,
  addEventListener: function (name, fn) {
    if (!listeners[name]) listeners[name] = [];
    listeners[name].push(fn);
  },
  play: function () {
    playCalls++;
    this.paused = false;
    this.readyState = 4;
    return Promise.resolve();
  },
  pause: function () { this.paused = true; },
  load: function () {},
  removeAttribute: function () {},
  appendChild: function () {},
  canPlayType: function () { return 'probably'; },
  removeChild: function () {}
};

Object.defineProperty(video, 'firstChild', {
  configurable: true,
  get: function () { return null; }
});

var screen = {
  classList: {
    contains: function (name) { return name === 'active'; }
  }
};

var overlayActive = false;
var overlayText = '';
var statusSnapshots = [];

var context = {
  console: console,
  navigator: { onLine: true },
  Date: {
    now: function () { return now; }
  },
  document: {
    getElementById: function (id) {
      if (id === 'playerScreen') return screen;
      if (id === 'playerBuffering') {
        return {
          classList: {
            toggle: function (cls, on) {
              if (cls === 'active') overlayActive = !!on;
            },
            add: function () { overlayActive = true; },
            remove: function () { overlayActive = false; }
          },
          set textContent(v) { overlayText = v; },
          get textContent() { return overlayText; }
        };
      }
      return null;
    },
    createElement: function () {
      return { setAttribute: function () {} };
    },
    head: { appendChild: function () {} }
  },
  setTimeout: fakeSetTimeout,
  clearTimeout: fakeClearTimeout,
  addEventListener: function () {},
  ElionStorage: {
    getSettings: function () { return { bufferSeconds: 3, rememberLastChannel: false, autoplayNext: false }; },
    getRecents: function () { return []; },
    saveRecents: function () {},
    set: function () {}
  },
  ElionParental: { requireUnlock: function () { return Promise.resolve(true); } },
  ElionPlaylists: { applyUdpProxy: function (url) { return url; } },
  ElionUI: { toast: function () {} },
  ElionChannels: {
    nextChannel: function () { return { id: 'c2', name: 'Beta', url: 'http://example.test/b.mp4' }; },
    prevChannel: function () { return { id: 'c1', name: 'Alpha', url: 'http://example.test/a.mp4' }; }
  }
};
context.window = context;
context.global = context;
context.webOS = {};
vm.createContext(context);
vm.runInContext(playerSrc, context);

function fire(name) {
  var list = listeners[name] || [];
  for (var i = 0; i < list.length; i++) list[i]();
}

function syncOverlay(st) {
  var show = !st.error && !!(st.loading || st.recovering);
  overlayActive = show;
  overlayText = (st.recovering && st.recoveryDetail) ? st.recoveryDetail : 'Loading channel…';
  statusSnapshots.push({
    at: now,
    loading: !!st.loading,
    buffering: !!st.buffering,
    recovering: !!st.recovering,
    playing: !!st.playing,
    overlay: overlayActive,
    playCalls: playCalls
  });
}

context.ElionPlayer.onChange(syncOverlay);
context.ElionPlayer.bindVideo(video);

function simulateProgress(seconds) {
  var steps = Math.max(1, Math.floor(seconds));
  for (var i = 0; i < steps; i++) {
    video.currentTime += 1;
    fire('timeupdate');
    advance(1000);
  }
}

function unexpectedOverlayAfterPlay() {
  for (var i = 0; i < statusSnapshots.length; i++) {
    var s = statusSnapshots[i];
    if (s.playing && !s.recovering && s.overlay && s.loading) return true;
    if (s.playing && !s.recovering && !s.loading && s.overlay) return true;
  }
  return false;
}

context.ElionPlayer.playChannel({ id: 'c1', name: 'Alpha', url: 'http://example.test/a.mp4' }).then(function () {
  var afterOpen = context.ElionPlayer.getStatus();
  // play() promise clears loading; ensure intentional open set it at least once
  var sawLoading = statusSnapshots.some(function (s) { return s.loading; });
  assert(sawLoading, 'Loading appears when opening a new channel');

  fire('playing');
  var playing = context.ElionPlayer.getStatus();
  assert(playing.playing === true, 'playing event marks playback active');
  assert(playing.loading === false, 'Loading disappears when playback starts');
  assert(overlayActive === false, 'Overlay hides when playback starts');

  var playsBeforeBuffer = playCalls;

  // Repeated media events must not re-enter loading / overlay
  fire('waiting');
  fire('stalled');
  fire('loadstart');
  fire('waiting');
  fire('canplay');
  fire('playing');
  var mid = context.ElionPlayer.getStatus();
  assert(mid.loading === false, 'Repeated media events do not create repeated loading states');
  assert(overlayActive === false, 'waiting/stalled/loadstart do not show Loading channel overlay');
  assert(playCalls === playsBeforeBuffer, 'Temporary buffering does not restart playback');

  // Long uninterrupted session at 2 / 5 / 10 / 30 minutes
  var checkpoints = [2, 5, 10, 30];
  var overlayDuringLongPlay = false;
  var reloadDuringLongPlay = false;
  for (var c = 0; c < checkpoints.length; c++) {
    var targetMin = checkpoints[c];
    var already = Math.floor((video.currentTime || 0) / 60);
    var need = (targetMin - already) * 60;
    if (need > 0) simulateProgress(need);
    var st = context.ElionPlayer.getStatus();
    if (st.loading || overlayActive) overlayDuringLongPlay = true;
    if (st.recovering) overlayDuringLongPlay = true;
  }
  assert(!overlayDuringLongPlay, 'No unexpected loading overlay after 2/5/10/30 minutes of play');
  assert(playCalls === playsBeforeBuffer, 'Long session does not reload the active stream');

  // Channel switch still works
  return context.ElionPlayer.playChannel({ id: 'c2', name: 'Beta', url: 'http://example.test/b.mp4' }).then(function () {
    var switchedLoad = statusSnapshots.some(function (s) { return s.loading && s.playCalls >= playsBeforeBuffer; });
    assert(switchedLoad || context.ElionPlayer.getCurrentChannel().id === 'c2', 'Switching channels still works');
    fire('playing');
    assert(context.ElionPlayer.getCurrentChannel().id === 'c2', 'Active channel updates after switch');
    assert(context.ElionPlayer.getStatus().loading === false, 'Loading clears after switched channel plays');

    // Genuine failure still recovers / errors clearly
    video.error = { code: 2 };
    video._elionToken = context.ElionPlayer.getStatus().channel ? video._elionToken : video._elionToken;
    // Ensure token matches — bind sets it during startPlayback
    fire('error');
    var recovering = context.ElionPlayer.getStatus();
    assert(recovering.recovering === true || recovering.error, 'Genuine playback failures are handled');
    if (recovering.recovering) {
      assert(recovering.loading === true, 'Recovery may show a loading/recovery overlay');
      assert(overlayText.indexOf('Trying to restore') !== -1 || overlayActive, 'Recovery message is clear');
    }

    context.ElionPlayer.stop();
    assert(context.ElionPlayer.getStatus().loading === false, 'Stop clears loading state');
    assert(context.ElionPlayer.getStatus().recovering === false, 'Stop clears recovery state');

    if (failed) process.exit(1);
    console.log('\nResult: ALL PASSED');
  });
}).catch(function (err) {
  console.error('  FAIL loading overlay simulation', err && err.message);
  process.exit(1);
});
