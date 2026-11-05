#!/usr/bin/env node
'use strict';

/**
 * Magic Remote channel switching (zap) checks for ELION IPTV.
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var failed = 0;

function assert(cond, msg) {
  if (cond) console.log('  OK  ' + msg);
  else { failed++; console.error('  FAIL ' + msg); }
}

function load(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

console.log('== Channel zap / Magic Remote ==\n');

var app = load('js/app.js');
var focus = load('js/focus.js');
var channels = load('js/channels.js');
var player = load('js/player.js');
var html = load('index.html');
var css = load('css/app.css');
var appinfo = JSON.parse(load('appinfo.json'));

assert(appinfo.version === '1.0.9', 'Version is 1.0.9');

/* Direction: UP = next (+1), DOWN = previous (-1) */
assert(focus.indexOf("playerChannelStep(dir === 'up' ? 1 : -1)") !== -1, 'UP maps to next channel (+1)');
assert(focus.indexOf("dir === 'up' ? -1") === -1, 'UP is not mapped to previous');

/* Works with controls visible or hidden — no isPlayerUiVisible gate on zap */
assert(/isPlayerActive\(\)[\s\S]*up[\s\S]*down[\s\S]*playerChannelStep/.test(focus), 'Zap when player active');
assert(!/isPlayerUiVisible\(\)[\s\S]{0,80}playerChannelStep/.test(focus), 'Zap not gated on control bar visibility');

/* One press / debounce */
assert(app.indexOf('zapLockedUntil') !== -1, 'Zap cooldown lock present');
assert(app.indexOf('ZAP_COOLDOWN_MS') !== -1, 'Zap cooldown constant exported');
assert(focus.indexOf('isDuplicateKey') !== -1 && focus.indexOf('e.repeat') !== -1, 'Key repeat ignored');

/* Browse / playlist order */
assert(channels.indexOf('nextChannel') !== -1 && channels.indexOf('prevChannel') !== -1, 'next/prev channel helpers');
assert(channels.indexOf('getBrowseList') !== -1, 'Browse list order used');
assert(channels.indexOf('active playlist only') !== -1 || channels.indexOf('getState().channels') !== -1, 'Fallback is active playlist only');
assert(app.indexOf('ensureZapBrowseContext') !== -1, 'Player ensures browse context before zap');
assert(/% list\.length/.test(channels) || channels.indexOf('% list.length') !== -1, 'First/last wrap predictably');

/* Overlay + loading */
assert(html.indexOf('channelZapOsd') !== -1, 'Channel OSD markup');
assert(html.indexOf('channelZapName') !== -1 && html.indexOf('channelZapLogo') !== -1, 'OSD name and logo');
assert(html.indexOf('channelZapProgram') !== -1, 'OSD program / EPG line');
assert(html.indexOf('channelZapStatus') !== -1, 'OSD loading/status line');
assert(css.indexOf('channel-zap-osd') !== -1, 'OSD styles');
assert(app.indexOf('showChannelZapOsd') !== -1, 'OSD helper');
assert(app.indexOf("showChannelZapOsd(target, 'Loading") !== -1, 'Loading feedback on switch');
assert(app.indexOf('playerBuffering') !== -1, 'Buffering indicator still used');

/* Playback path preserved */
assert(app.indexOf('ElionPlayer.playChannel(target)') !== -1, 'Zap uses existing playChannel');
assert(player.indexOf('function playChannel') !== -1, 'Player playChannel preserved');
assert(player.indexOf('function playNext') !== -1 && player.indexOf('function playPrev') !== -1, 'playNext/playPrev preserved');

/* BACK exits player; list closes first */
assert(/channelListOpen[\s\S]*closePlayerChannelList[\s\S]*closePlayer/.test(app), 'Back closes list then player');
assert(app.indexOf('One Back press always returns') !== -1 || app.indexOf('closePlayer();') !== -1, 'Back exits player');

/* Optional in-player channel list */
assert(html.indexOf('btnChannelList') !== -1, 'Channels control on player bar');
assert(html.indexOf('playerChannelList') !== -1, 'In-player channel list panel');
assert(app.indexOf('openPlayerChannelList') !== -1, 'Open channel list helper');
assert(app.indexOf('isPlayerChannelListOpen') !== -1, 'List-open state for focus');
assert(focus.indexOf('isPlayerChannelListOpen') !== -1, 'Focus routes arrows into list when open');
assert(css.indexOf('player-channel-list') !== -1, 'Channel list styles');

/* No duplicate global listeners in app for arrows */
assert(!/document\.addEventListener\(\s*['"]keydown['"]/.test(app), 'App does not add duplicate keydown listener');
assert(focus.indexOf("addEventListener('keydown'") !== -1, 'Single focus keydown listener');

/* OK still toggles controls */
assert(app.indexOf('playerOkAction') !== -1, 'OK shows controls when hidden');
assert(focus.indexOf('playerOkAction') !== -1, 'OK handled in focus while watching');

console.log('\nResult: ' + (failed ? failed + ' failure(s)' : 'ALL PASSED'));
if (failed) process.exit(1);
