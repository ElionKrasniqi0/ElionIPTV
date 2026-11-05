#!/usr/bin/env node
'use strict';

/**
 * Validates webOS packaging prerequisites without requiring ares-cli.
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var failed = 0;

function ok(cond, msg) {
  console.log((cond ? '  OK  ' : '  FAIL ') + msg);
  if (!cond) failed++;
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

console.log('== ELION IPTV package validation ==\n');

var appinfo = JSON.parse(fs.readFileSync(path.join(root, 'appinfo.json'), 'utf8'));
ok(appinfo.id === 'com.elion.iptv', 'app id com.elion.iptv');
ok(appinfo.type === 'web', 'type web');
ok(appinfo.main === 'index.html', 'main index.html');
ok(appinfo.icon === 'icon.png', 'icon field');
ok(!!appinfo.version && /^\d+\.\d+\.\d+$/.test(appinfo.version), 'semver version ' + appinfo.version);
ok(appinfo.resolution === '1920x1080', 'resolution 1920x1080');
ok(appinfo.disableBackHistoryAPI === true, 'disableBackHistoryAPI for Magic Remote Back');
ok(!/^(com\.palm|com\.webos|com\.lge|com\.palmdts)/.test(appinfo.id), 'id not reserved');

['index.html', 'icon.png', 'largeIcon.png', 'assets/splash.png', 'css/app.css'].forEach(function (f) {
  ok(exists(f), 'required file ' + f);
});

[
  'js/compat.js', 'js/logger.js', 'js/utils.js', 'js/net.js', 'js/errors.js', 'js/storage.js', 'js/m3u-parser.js',
  'js/search.js', 'js/playlist-manager.js', 'js/player.js', 'js/epg.js', 'js/focus.js',
  'js/settings-ui.js', 'js/screens.js', 'js/app.js', 'js/lib/webOSTV.js'
].forEach(function (f) {
  ok(exists(f), 'module ' + f);
});

// Icons size sanity (non-zero)
ok(fs.statSync(path.join(root, 'icon.png')).size > 100, 'icon.png non-empty');
ok(fs.statSync(path.join(root, 'largeIcon.png')).size > 100, 'largeIcon.png non-empty');

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
ok(html.indexOf('js/app.js') !== -1, 'index loads app.js');
ok(html.indexOf('playerVideo') !== -1, 'index has video element');

console.log('\nResult: ' + (failed ? failed + ' failure(s)' : 'PASS'));
if (failed) process.exit(1);
console.log('\nTo build IPK (requires LG webOS TV CLI):');
console.log('  .\\scripts\\package.ps1');
console.log('  or: ares-package . -o dist -n -e companion -e dist -e scripts -e tests -e docs -e node_modules -e .git');
