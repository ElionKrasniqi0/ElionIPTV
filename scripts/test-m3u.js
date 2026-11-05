#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var sandbox = {
  console: console,
  URL: URL,
  Promise: Promise,
  fetch: function () { return Promise.reject(new Error('no fetch in tests')); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

function load(rel) {
  var code = fs.readFileSync(path.join(root, rel), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: rel });
}

load('js/utils.js');
load('js/m3u-parser.js');

var parse = sandbox.ElionM3U.parse;
var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('OK  ', msg);
  }
}

var sample = fs.readFileSync(path.join(root, 'sample/demo.m3u'), 'utf8');
var r = parse(sample, { playlistId: 'demo' });
assert(r.ok, 'demo.m3u parses ok');
assert(r.channels.length === 4, 'demo has 4 channels (got ' + r.channels.length + ')');
assert(r.channels[0].name === 'Big Buck Bunny', 'first channel name');
assert(r.channels[0].group === 'Demo', 'first channel group');
assert(r.channels[0].logo.indexOf('http') === 0, 'logo captured');
assert(r.categories.length >= 2, 'categories extracted');

var weird = [
  '#EXTM3U',
  '',
  '# Comment line',
  '#EXTINF:-1 tvg-id="a" tvg-name="Quoted, Name" group-title="News, Live",Quoted, Name',
  'https://example.com/a.m3u8?token=1&x=2',
  '#EXTGRP:Sports',
  '#EXTINF:-1,No Attr Channel',
  'http://example.com/b.ts',
  '#EXTINF:-1 group-title="Dup",Dup One',
  'http://example.com/same',
  '#EXTINF:-1 group-title="Dup",Dup Two',
  'http://example.com/same',
  '#EXTINF:-1,Broken without url'
].join('\n');

var r2 = parse(weird, { playlistId: 't' });
assert(r2.ok, 'weird playlist ok');
assert(r2.channels.length === 3, 'duplicates skipped + broken ignored => 3 channels (got ' + r2.channels.length + ')');
assert(r2.channels[0].name.indexOf('Quoted') === 0, 'quoted title with comma');
assert(r2.channels[1].group === 'Sports', 'EXTGRP applied');
assert(r2.warnings.length > 0, 'warnings reported');

var empty = parse('   ');
assert(!empty.ok && empty.errors.length, 'empty playlist errors');

var crlf = parse('#EXTM3U\r\n#EXTINF:-1,CRLF\r\nhttps://x/y.m3u8\r\n');
assert(crlf.ok && crlf.channels[0].name === 'CRLF', 'CRLF line endings');

if (failed) {
  console.error('\n' + failed + ' test(s) failed');
  process.exit(1);
}
console.log('\nAll M3U parser tests passed.');
