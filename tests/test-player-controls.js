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

function load(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

console.log('== Player controls, reload, audio/subtitles ==\n');

var html = load('index.html');
var css = load('css/app.css');
var app = load('js/app.js');
var screens = load('js/screens.js');
var player = load('js/player.js');
var settings = load('js/settings-ui.js');
var storage = load('js/storage.js');
var playlists = load('js/playlist-manager.js');

var bar = html.split('player-control-bar')[1].split('</nav>')[0];
assert(bar.indexOf('id="btnChannelList"') !== -1, 'Channel list control is on the bar');
assert(bar.indexOf('id="btnCategories"') !== -1, 'Categories control is on the bar');
assert(bar.indexOf('id="btnPrev"') !== -1, 'Previous control is on the bar');
assert(bar.indexOf('id="btnPlayPause"') !== -1, 'Play/Pause control is on the bar');
assert(bar.indexOf('id="btnNext"') !== -1, 'Next control is on the bar');
assert(bar.indexOf('id="btnFav"') !== -1, 'Favorite is on the control bar');
assert(bar.indexOf('id="btnMute"') !== -1, 'Mute is on the control bar');
assert(bar.indexOf('id="btnFullscreen"') !== -1, 'Fullscreen is on the control bar');
assert(bar.indexOf('id="btnAudio"') === -1, 'Audio is not on the control bar');
assert(bar.indexOf('id="btnSubs"') === -1, 'Subtitles are not on the control bar');
assert(bar.indexOf('M6 12h36') !== -1, 'Categories uses a three-line icon');
assert(screens.indexOf('No movies found in your current playlist.') !== -1, 'Movies empty state is explicit');
assert(/\.player-control-bar\s*\{[^}]*bottom:\s*8%/.test(css), 'Control bar sits in the lower safe area');
assert(/\.player-control-bar\s*\{[^}]*top:\s*50%/.test(css) === false, 'Control bar is not centered on the video');
assert(css.indexOf('background: #0b1220') !== -1, 'Player buttons use the dark background');
assert(css.indexOf('border-color: var(--accent-2)') !== -1, 'Focused player buttons use teal');
assert(app.indexOf("bind('btnPrev'") !== -1 && app.indexOf('playerChannelStep(-1)') !== -1, 'Previous steps backward');
assert(app.indexOf("bind('btnNext'") !== -1 && app.indexOf('playerChannelStep(1)') !== -1, 'Next steps forward');
assert(app.indexOf('togglePlayPause') !== -1, 'Play/Pause uses the existing player');
assert(app.indexOf('openPlayerChannelList') !== -1, 'Category opens the channel list');

assert(screens.indexOf('Reload IPTV') !== -1, 'Home has Reload IPTV');
assert(screens.indexOf('reloadActivePlaylist') !== -1, 'Reload uses one refresh handler');
assert(screens.indexOf('refreshPlaylist') !== -1, 'Reload calls the existing playlist refresh');
assert(screens.indexOf('No playlist is selected') !== -1, 'Missing playlist is explained');
assert(screens.indexOf('no web address to refresh') !== -1, 'Non-refreshable playlist is explained');
assert(screens.indexOf('saved channels are still available') !== -1, 'Failed refresh keeps existing channels');
assert(screens.indexOf('playlistRefreshBusy') !== -1, 'A second refresh is blocked');
assert(playlists.indexOf('Never delete stored playlists') !== -1, 'Download failure does not erase playlists');
assert(playlists.indexOf('Another playlist import is already in progress') !== -1, 'Overlapping imports are rejected');

assert(settings.indexOf('Playback Settings') !== -1, 'Settings has Playback Settings');
assert(settings.indexOf('set-audio-track') !== -1, 'Audio choices are selectable');
assert(settings.indexOf('set-subtitle-track') !== -1, 'Subtitle choices are selectable');
assert(settings.indexOf('id="setQuality"') !== -1, 'Video quality uses a dropdown select');
assert(settings.indexOf('quality-select') !== -1, 'Video quality dropdown has TV-sized styling class');
assert(settings.indexOf('Auto (Recommended)') !== -1, 'Auto (Recommended) is the default quality label');
assert(screens.indexOf("querySelector('#setQuality')") !== -1, 'Quality dropdown change is wired for Magic Remote');
assert(settings.indexOf('>Off') !== -1, 'Subtitles include Off');
assert(player.indexOf('function listAudioTracks') !== -1, 'Audio tracks come from the player');
assert(player.indexOf('function listTextTracks') !== -1, 'Subtitle tracks come from the player');
assert(player.indexOf('function listQualityLevels') !== -1, 'Quality levels come from the player');
assert(player.indexOf('function selectAudioTrack') !== -1, 'Audio selection does not rebuild the player');
assert(player.indexOf('function selectTextTrack') !== -1, 'Subtitle selection does not rebuild the player');
assert(player.indexOf('capLevelToPlayerSize: false') !== -1, 'HLS.js quality is not capped to player CSS size');
assert(player.indexOf('applyTrackPreferences') !== -1, 'Saved track preference is applied when present');
assert(storage.indexOf('preferredAudio') !== -1 && storage.indexOf('preferredSubtitle') !== -1, 'Track preferences are stored with settings');
assert(storage.indexOf('preferredQuality') !== -1, 'Quality preference is stored with settings');
assert(/function selectAudioTrack[\s\S]*playChannel\(/.test(player) === false, 'Changing audio does not restart playback');
assert(/function selectTextTrack[\s\S]*playChannel\(/.test(player) === false, 'Changing subtitles does not restart playback');

var settingsStore = { preferredAudio: '', preferredSubtitle: '' };
var audioList = [
  { label: 'English', language: 'en', enabled: true },
  { label: 'French', language: 'fr', enabled: false }
];
var textList = [
  { label: 'English', language: 'en', kind: 'subtitles', mode: 'disabled' },
  { label: 'Chapters', language: '', kind: 'chapters', mode: 'disabled' }
];
var sandbox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  ElionStorage: {
    getSettings: function () { return settingsStore; },
    saveSettings: function (partial) { Object.assign(settingsStore, partial); return settingsStore; }
  },
  ElionLog: { info: function () {}, warn: function () {}, debug: function () {}, error: function () {} },
  ElionUI: { toast: function () {} },
  document: { getElementById: function () { return null; } }
};
sandbox.window = sandbox;
sandbox.video = {
  audioTracks: audioList,
  textTracks: textList,
  paused: false,
  pause: function () {},
  play: function () { return Promise.resolve(); },
  addEventListener: function () {}
};
vm.createContext(sandbox);
vm.runInContext(player, sandbox, { filename: 'player.js' });
sandbox.ElionPlayer.bindVideo(sandbox.video);

var listed = sandbox.ElionPlayer.listAudioTracks();
assert(listed.tracks.length === 2, 'Two real audio tracks are listed');
var missing = sandbox.ElionPlayer.listAudioTracks();
sandbox.video.audioTracks = [];
var none = sandbox.ElionPlayer.listAudioTracks();
assert(none.tracks.length === 0 && /does not offer selectable audio/.test(none.message), 'No fake audio tracks when the stream has none');
sandbox.video.audioTracks = audioList;
var changed = sandbox.ElionPlayer.selectAudioTrack(1);
assert(changed.ok === true, 'Selecting a real audio track succeeds');
assert(audioList[1].enabled === true && audioList[0].enabled === false, 'Selected audio track is enabled without a new player');
assert(settingsStore.preferredAudio === 'fr', 'Audio preference is saved');

var subs = sandbox.ElionPlayer.listTextTracks();
assert(subs.tracks.length === 1, 'Chapter metadata is not shown as a subtitle');
var off = sandbox.ElionPlayer.selectTextTrack(-1);
assert(off.ok === true && settingsStore.preferredSubtitle === 'off', 'Subtitles can be turned off');
assert(textList[0].mode === 'disabled', 'Off disables the subtitle track');
sandbox.video.audioTracks = null;
var unsupported = sandbox.ElionPlayer.listAudioTracks();
assert(unsupported.supported === false, 'Missing audioTracks API is reported as unsupported');

console.log('\nResult: ' + (failed ? failed + ' failure(s)' : 'ALL PASSED'));
if (failed) process.exit(1);
