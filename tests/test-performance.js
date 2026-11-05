#!/usr/bin/env node
'use strict';

/**
 * Responsiveness guards: remote handling must stay cheap and independent of zap cooldown.
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var failed = 0;

function assert(cond, msg) {
  if (cond) console.log('  OK  ' + msg);
  else { failed++; console.error('  FAIL ' + msg); }
}

function load(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

console.log('== Performance / remote responsiveness ==\n');

var focus = load('js/focus.js');
var app = load('js/app.js');
var screens = load('js/screens.js');
var css = load('css/app.css');
var player = load('js/player.js');

assert(focus.indexOf('function moveStructured') !== -1, 'Structured list/grid focus path');
assert(focus.indexOf('invalidateFocusCache') !== -1, 'Focus cache invalidation');
assert(focus.indexOf('getComputedStyle') === -1, 'Focus path does not force layout via getComputedStyle');
assert(focus.indexOf('ARROW_REPEAT_MS') !== -1, 'Arrow key-repeat is rate-limited, not blocked');
assert(focus.indexOf('navLockedUntil = Date.now()') === -1, 'Back does not freeze all keys');
assert(focus.indexOf('setInterval(ensureFocusAlive, 4000)') !== -1, 'Focus watchdog is not a tight loop');
assert(focus.indexOf('slow remote') !== -1, 'Slow key handling is logged');
assert(screens.indexOf('ElionFocus.invalidate') !== -1, 'Screen render clears focus cache');
assert(/toggle-fav[\s\S]{0,500}classList\.toggle\('on'/.test(screens), 'Favorite toggle updates the button in place');
assert(app.indexOf('now - lastMove < 400') !== -1, 'Player pointer move is throttled');
assert(app.indexOf('ZAP_COOLDOWN_MS') !== -1, 'Channel zap cooldown stays separate from navigation');
assert(player.indexOf('playToken') !== -1, 'Outdated playback callbacks are cancelled');
assert(css.indexOf('backdrop-filter') === -1, 'Expensive backdrop blur removed');
assert(!/button:focus[\s\S]{0,180}translateY\(/.test(css), 'Global focus does not shift layout');

console.log('\nResult: ' + (failed ? failed + ' failure(s)' : 'ALL PASSED'));
if (failed) process.exit(1);
