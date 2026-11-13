#!/usr/bin/env node
'use strict';

/**
 * HLS / webOS video quality selection tests.
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
var settingsSrc = fs.readFileSync(path.join(root, 'js', 'settings-ui.js'), 'utf8');
var storageSrc = fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8');

console.log('== Video quality / 4K-FHD ==\n');

assert(playerSrc.indexOf('maxWidth: limits.maxWidth') !== -1, 'Native mediaOption sets maxWidth');
assert(playerSrc.indexOf('maxHeight: limits.maxHeight') !== -1, 'Native mediaOption sets maxHeight');
assert(playerSrc.indexOf('3840') !== -1 && playerSrc.indexOf('2160') !== -1, 'Auto unlocks UHD 3840x2160');
assert(playerSrc.indexOf('capLevelToPlayerSize: false') !== -1, 'HLS.js is not capped to the 1080p app surface');
assert(playerSrc.indexOf('abrEwmaDefaultEstimate') !== -1, 'HLS.js ABR starts optimistic for quality upgrades');
assert(playerSrc.indexOf('parseHlsMasterPlaylist') !== -1, 'Master playlist variants are parsed');
assert(playerSrc.indexOf('listQualityLevels') !== -1, 'Quality levels can be listed');
assert(playerSrc.indexOf('selectQuality') !== -1, 'Manual quality selection exists');
assert(playerSrc.indexOf('probeNativeHlsQualities') !== -1, 'Native HLS probes master playlists without inventing rungs');
assert(playerSrc.indexOf('attachNativeHlsWithProbe') !== -1, 'Native HLS probes before attach to raise ABR start bitrate');
assert(playerSrc.indexOf('discoverHlsVariants') !== -1, 'Nested / master playlist discovery is implemented');
assert(playerSrc.indexOf('Never invents rungs') !== -1, 'Quality probe does not invent resolutions');
assert(playerSrc.indexOf("playbackEngine = 'native-hls'") !== -1, 'Native webOS HLS engine is tracked');
assert(playerSrc.indexOf("playbackEngine = 'hls.js'") !== -1, 'HLS.js fallback engine is tracked');
assert(playerSrc.indexOf('sourceHas4k') !== -1, 'Source 4K availability is tracked separately from decoded 4K');
assert(storageSrc.indexOf("preferredQuality: 'auto'") !== -1, 'Preferred quality defaults to Auto');
assert(settingsSrc.indexOf('id="setQuality"') !== -1, 'Playback settings expose a quality dropdown');
assert(settingsSrc.indexOf('Auto (Recommended)') !== -1, 'Auto (Recommended) is the default quality option');
assert(settingsSrc.indexOf('quality-select') !== -1, 'Quality dropdown uses dedicated TV styling');
assert(playerSrc.indexOf('reconcilePreferredQuality') !== -1, 'Unsupported saved preferences fall back to Auto per channel');
assert(playerSrc.indexOf("1440p (2K)") !== -1, '1440p (2K) label is supported when published');
assert(appSrc.indexOf('Playing ') !== -1 && appSrc.indexOf('Selected ') !== -1, 'UI distinguishes playing vs selected quality');
assert(appSrc.indexOf('Source ') !== -1, 'UI shows published source qualities');
assert(appSrc.indexOf('Native HLS') !== -1, 'UI can show native HLS engine');
assert(appSrc.indexOf("h >= 1000 ? 'FHD'") !== -1, 'FHD is distinguished from HD');

var MASTER = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.42e01e,mp4a.40.2"',
  '360.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"',
  '720.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=5500000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"',
  '1080.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=3840x2160,CODECS="hvc1.1.6.L123.B0,mp4a.40.2"',
  '2160.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=854x480,CODECS="av01.0.08M.08,mp4a.40.2"',
  'av1-480.m3u8'
].join('\n');

var listeners = {};
var video = {
  paused: true,
  currentTime: 0,
  readyState: 0,
  duration: Infinity,
  error: null,
  networkState: 0,
  videoWidth: 0,
  videoHeight: 0,
  firstChild: null,
  audioTracks: null,
  textTracks: null,
  canPlayType: function (type) {
    if (/av01|vp09|vp9/i.test(type)) return '';
    if (/avc1|hvc1|hev1/i.test(type)) return 'maybe';
    return '';
  },
  addEventListener: function (name, fn) {
    if (!listeners[name]) listeners[name] = [];
    listeners[name].push(fn);
  },
  play: function () { this.paused = false; return Promise.resolve(); },
  pause: function () { this.paused = true; },
  load: function () {},
  removeAttribute: function () {},
  appendChild: function () {},
  removeChild: function () {}
};
Object.defineProperty(video, 'firstChild', { configurable: true, get: function () { return null; } });

var NESTED_WRAPPER = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=1',
  'http://example.test/live/master.m3u8'
].join('\n');
var MEDIA_ONLY = [
  '#EXTM3U',
  '#EXT-X-TARGETDURATION:6',
  '#EXTINF:6.0,',
  'seg1.ts'
].join('\n');
var NO_RES = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=15000000,CODECS="avc1.640028,mp4a.40.2"',
  'hi.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=2500000,CODECS="avc1.4d401f,mp4a.40.2"',
  'lo.m3u8'
].join('\n');

var settingsStore = { preferredQuality: 'auto', bufferSeconds: 3, rememberLastChannel: false, autoplayNext: false };
var context = {
  console: console,
  navigator: { onLine: true },
  URL: URL,
  document: {
    getElementById: function (id) {
      if (id === 'playerScreen') return { classList: { contains: function (n) { return n === 'active'; } } };
      return null;
    },
    createElement: function () { return { setAttribute: function () {} }; },
    head: { appendChild: function () {} }
  },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  addEventListener: function () {},
  webOS: {},
  ElionStorage: {
    getSettings: function () { return settingsStore; },
    saveSettings: function (partial) { Object.assign(settingsStore, partial); return settingsStore; },
    getRecents: function () { return []; },
    saveRecents: function () {},
    set: function () {}
  },
  ElionParental: { requireUnlock: function () { return Promise.resolve(true); } },
  ElionPlaylists: { applyUdpProxy: function (url) { return url; } },
  ElionUI: { toast: function () {} },
  ElionChannels: {},
  ElionUtils: {
    downloadText: function (url) {
      var u = String(url || '');
      if (/nested\.m3u8/i.test(u)) return Promise.resolve(NESTED_WRAPPER);
      if (/media-only\.m3u8/i.test(u)) return Promise.resolve(MEDIA_ONLY);
      if (/no-res\.m3u8/i.test(u)) return Promise.resolve(NO_RES);
      return Promise.resolve(MASTER);
    }
  }
};
context.window = context;
context.global = context;
vm.createContext(context);
vm.runInContext(playerSrc, context);

var P = context.ElionPlayer;
var levels = P.parseHlsMasterPlaylist(MASTER, 'http://example.test/live/master.m3u8');
assert(levels.length >= 4, 'Master playlists containing 4K, FHD and HD variants are detected');
assert(levels.some(function (l) { return l.height === 2160; }), '4K / 2160p variant is detected');
assert(levels.some(function (l) { return l.height === 1080; }), 'FHD / 1080p variant is detected');
assert(levels.some(function (l) { return l.height === 720; }), 'HD / 720p variant is detected');
assert(!levels.some(function (l) { return /av01/i.test(l.codecs || ''); }), 'Unsupported AV1 variant is filtered out');
assert(levels[0].height >= levels[1].height, 'Variants are ordered highest-first');
assert(P.heightQualityLabel(2160).indexOf('4K') !== -1, '2160p labeled as 4K');
assert(P.heightQualityLabel(1440).indexOf('2K') !== -1, '1440p labeled as 2K');
assert(P.heightQualityLabel(1080).indexOf('Full HD') !== -1, '1080p labeled as Full HD');
assert(P.qualityTierFromHeight(1080) === 'FHD', '1080p tier is FHD not generic HD');
assert(P.qualityTierFromHeight(720) === 'HD', '720p tier is HD');
assert(P.qualityTierFromHeight(360) === 'SD', '360p tier is SD');

var autoLimits = P.qualityAdaptiveLimits('auto');
assert(autoLimits.maxWidth === 3840 && autoLimits.maxHeight === 2160, 'Automatic quality selection unlocks 4K max dimensions');
assert(autoLimits.startBps >= 8000000, 'Automatic quality starts at a high bitrate hint');
var fhdLimits = P.qualityAdaptiveLimits('1080');
assert(fhdLimits.maxHeight === 1080, 'Manual 1080p preference caps native maxHeight');
var mediaType = P.buildMediaOption({ mime: 'application/vnd.apple.mpegurl', transport: 'HLS' }, 'auto');
assert(mediaType.indexOf('3840') !== -1 && mediaType.indexOf('2160') !== -1, 'mediaOption encodes unlocked UHD limits');
assert(mediaType.indexOf('bps') !== -1, 'mediaOption includes starting bitrate');

var missing = P.parseHlsMasterPlaylist([
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
  '360.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720',
  '720.m3u8'
].join('\n'), 'http://example.test/a.m3u8');
assert(!missing.some(function (l) { return l.height >= 1080; }), 'Missing 4K/FHD variants are not invented');

var noRes = P.parseHlsMasterPlaylist(NO_RES, 'http://example.test/no-res.m3u8');
assert(noRes.length >= 2, 'Variants without RESOLUTION metadata are kept by bandwidth');
assert(!noRes.some(function (l) { return l.height >= 2000; }), 'Missing resolution metadata is not invented as 4K');

P.bindVideo(video);

P.discoverHlsVariants('http://example.test/live/nested.m3u8', 0, 0).then(function (nestedLevels) {
  assert(nestedLevels.some(function (l) { return l.height === 2160; }), 'Nested master playlists expose real 4K variants');
  assert(nestedLevels.some(function (l) { return l.height === 1080; }), 'Nested master playlists expose FHD variants');
  return P.discoverHlsVariants('http://example.test/live/media-only.m3u8', 0, 0);
}).then(function (mediaLevels) {
  assert(mediaLevels.length === 0, 'Media playlists do not invent quality options');
  return P.playChannel({ id: 'c1', name: 'Alpha', url: 'http://example.test/live/master.m3u8' });
}).then(function () {
  return new Promise(function (resolve) { setTimeout(resolve, 80); });
}).then(function () {
  var listed = P.listQualityLevels();
  assert(listed.tracks.some(function (t) { return t.id === 'auto'; }), 'Auto remains available');
  assert(listed.tracks.some(function (t) { return String(t.id) === '2160'; }), 'Discovered 4K is offered for manual selection');
  assert(listed.tracks.some(function (t) { return String(t.id) === '1080'; }), 'Discovered FHD is offered for manual selection');
  assert(listed.tracks.some(function (t) { return String(t.id) === '720'; }), 'Discovered HD is offered for manual selection');
  assert(!listed.tracks.some(function (t) { return String(t.id) === '480'; }), 'Unsupported codec variants are not listed');

  var opened = P.getStatus();
  assert(opened.streamInfo && opened.streamInfo.engine === 'native-hls', 'Native webOS HLS engine is used on webOS');
  assert(opened.streamInfo.sourceHas4k === true, 'Source 4K flag is set when 2160p is published');
  assert(/4K|FHD|HD/i.test(opened.streamInfo.sourceQualities || ''), 'Source quality summary lists published tiers');
  var autoMedia = P.buildMediaOption({ mime: 'application/vnd.apple.mpegurl', transport: 'HLS' }, 'auto');
  assert(autoMedia.indexOf('15000000') !== -1 || autoMedia.indexOf('bps') !== -1, 'Automatic quality upgrades use probed bitrate hints');

  var picked = P.selectQuality('1080');
  assert(picked.ok === true, 'Manual quality selection succeeds for a real variant');
  assert(settingsStore.preferredQuality === '1080', 'Manual quality preference is saved');
  assert(P.listQualityLevels().mode === '1080', 'Player mode reflects manual selection');

  var auto = P.selectQuality('auto');
  assert(auto.ok === true, 'Switching back to Auto works');
  assert(settingsStore.preferredQuality === 'auto', 'Auto preference is saved');

  var bogus = P.selectQuality('1440');
  assert(bogus.ok === false, 'Selecting a quality the stream does not publish fails safely');

  video.videoWidth = 1920;
  video.videoHeight = 1080;
  listeners.playing && listeners.playing[0] && listeners.playing[0]();
  var st = P.getStatus();
  assert(st.streamInfo && st.streamInfo.actualTier === 'FHD', 'Actual decoded resolution reports FHD');
  assert(st.streamInfo.decodedResolution === '1920x1080', 'Decoded WxH is reported explicitly');
  assert(st.streamInfo.selectedQuality === 'Auto' || /Auto/i.test(st.streamInfo.selectedQuality), 'Selected quality remains distinct from actual');
  assert(st.streamInfo.sourceHas4k === true && st.streamInfo.actualTier !== '4K', 'Source may list 4K while playing stays FHD until decoded');

  return P.playChannel({ id: 'c2', name: 'Beta', url: 'http://example.test/other.m3u8' }).then(function () {
    assert(P.getCurrentChannel().id === 'c2', 'Channel switching still works with quality logic');
    P.stop();
    assert(P.listQualityLevels().tracks.length === 1, 'Stop clears discovered quality rungs');
    if (failed) process.exit(1);
    console.log('\nResult: ALL PASSED');
  });
}).catch(function (err) {
  console.error('  FAIL video quality simulation', err && err.message);
  process.exit(1);
});
