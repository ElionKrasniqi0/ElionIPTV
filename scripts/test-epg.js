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
  Date: Date,
  localStorage: {
    _d: {},
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem: function (k, v) { this._d[k] = String(v); },
    removeItem: function (k) { delete this._d[k]; }
  }
};
sandbox.window = sandbox;

// Minimal DOMParser for one programme
sandbox.DOMParser = function () {};
sandbox.DOMParser.prototype.parseFromString = function () {
  return {
    getElementsByTagName: function (n) {
      if (n === 'parsererror') return [];
      if (n === 'channel') return [{
        getAttribute: function () { return 'bbc1.uk'; },
        getElementsByTagName: function () { return [{ textContent: 'BBC One' }]; }
      }];
      if (n === 'programme') return [{
        getAttribute: function (a) {
          if (a === 'channel') return 'bbc1.uk';
          if (a === 'start') return '20240101120000 +0000';
          if (a === 'stop') return '20240101130000 +0000';
          return null;
        },
        getElementsByTagName: function (x) {
          if (x === 'title') return [{ textContent: 'News at Noon' }];
          if (x === 'desc') return [{ textContent: 'Daily news' }];
          return [];
        }
      }];
      return [];
    }
  };
};

function load(rel) {
  vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
}

load('js/utils.js');
load('js/storage.js');
load('js/epg.js');

var parsed = sandbox.ElionEPG.parseXmltv('<tv/>');
if (!parsed.programmes['bbc1.uk'] || parsed.programmes['bbc1.uk'][0].title !== 'News at Noon') {
  console.error('FAIL parse programme');
  process.exit(1);
}
if (!parsed.channels['bbc1.uk']) {
  console.error('FAIL channel display-name');
  process.exit(1);
}
sandbox.ElionStorage.saveEpgCache({
  updatedAt: Date.now(),
  source: 'test',
  programmes: parsed.programmes,
  channels: parsed.channels
});
var key = sandbox.ElionEPG.resolveEpgKey({ tvgId: 'bbc1.uk', name: 'BBC One' });
if (key !== 'bbc1.uk') {
  console.error('FAIL tvg-id match', key);
  process.exit(1);
}
var key2 = sandbox.ElionEPG.resolveEpgKey({ tvgId: '', name: 'BBC One' });
if (key2 !== 'bbc1.uk') {
  console.error('FAIL name fallback', key2);
  process.exit(1);
}
console.log('OK   EPG parse + matching');
console.log('\nAll EPG tests passed.');
