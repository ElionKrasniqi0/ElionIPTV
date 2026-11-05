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
  localStorage: { _d: {}, getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
  document: {
    getElementById: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    body: { contains: function () { return false; } },
    createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {} }; }
  },
  window: null,
  navigator: { onLine: true },
  fetch: function () { return Promise.reject(new Error('no network')); }
};
sandbox.window = sandbox;
sandbox.NodeList.prototype = {};
sandbox.globalThis = sandbox;

function load(rel) {
  vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
}

console.log('== Import / URL / focus module smoke ==\n');
load('js/compat.js');
load('js/logger.js');
load('js/utils.js');
load('js/errors.js');
load('js/m3u-parser.js');
load('js/focus.js');

assert(!!sandbox.ElionCompat.parseHttpUrl, 'compat.parseHttpUrl exists');
assert(!!sandbox.ElionUtils.isValidHttpUrl('https://example.com/get.php?username=u&password=p&type=m3u'), 'URL with query params valid');
assert(sandbox.ElionUtils.normalizeUrl('  https://x/y.m3u?token=a%2Fb&z=1  ') === 'https://x/y.m3u?token=a%2Fb&z=1', 'normalizeUrl keeps query params');
assert(!sandbox.ElionUtils.isValidHttpUrl('ftp://x'), 'rejects ftp');
assert(!sandbox.ElionUtils.isValidHttpUrl(''), 'rejects empty');

var parsed = sandbox.ElionM3U.parse([
  '#EXTM3U',
  '#EXTINF:-1 group-title="News",Q Channel',
  'https://cdn.example.com/live/stream.m3u8?token=abc&exp=1'
].join('\n'), { playlistId: 'q' });
assert(parsed.ok && parsed.channels[0].url.indexOf('token=abc') !== -1, 'parser keeps stream query params');

assert(!!sandbox.ElionFocus && typeof sandbox.ElionFocus.move === 'function', 'focus module exports move');
assert(sandbox.ElionFocus.KEY.BACK === 461, 'webOS Back key code 461');
assert(sandbox.ElionFocus.KEY.ENTER === 13, 'Enter key code 13');
assert(typeof sandbox.ElionFocus.activateTextField === 'function', 'activateTextField exported for IME');
assert(typeof sandbox.ElionFocus.isTextEntryField === 'function', 'isTextEntryField exported');
assert(typeof sandbox.ElionFocus.isKeyboardVisible === 'function', 'isKeyboardVisible exported');

var fakeInput = {
  nodeType: 1,
  tagName: 'INPUT',
  type: 'url',
  disabled: false,
  classList: { contains: function () { return false; }, add: function () {}, remove: function () {} },
  getAttribute: function () { return null; },
  tabIndex: 0,
  focus: function () { this._focused = true; },
  click: function () { this._clicked = true; },
  blur: function () {}
};
assert(sandbox.ElionFocus.isTextEntryField(fakeInput), 'url input is a text entry field');
assert(!sandbox.ElionFocus.isTextEntryField({ nodeType: 1, tagName: 'INPUT', type: 'checkbox' }), 'checkbox is not text entry');
sandbox.ElionFocus.activateTextField(fakeInput);
assert(!!fakeInput._focused && !!fakeInput._clicked, 'activateTextField calls native focus() and click()');

var screensSrc = fs.readFileSync(path.join(root, 'js/screens.js'), 'utf8');
assert(/id="m3uUrl"[^>]*type="url"/.test(screensSrc) || /id="m3uUrl"[^>]*\btype="url"/.test(screensSrc.replace(/\n/g, ' ')), 'm3uUrl is a real input type=url');
assert(/<input id="m3uUrl"/.test(screensSrc), 'm3uUrl uses native input element');
assert(/<textarea id="m3uText"/.test(screensSrc), 'm3uText uses native textarea');

sandbox.ElionUtils.downloadText('https://example.com/x.m3u').then(function () {
  assert(false, 'download without network should reject');
}).catch(function (err) {
  assert(!!err.message, 'downloadText rejects with message: ' + String(err.message).slice(0, 60));
  console.log('\nResult: ' + (failed ? failed + ' failed' : 'ALL PASSED'));
  if (failed) process.exit(1);
});
