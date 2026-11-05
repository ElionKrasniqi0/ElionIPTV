#!/usr/bin/env node
'use strict';

/**
 * Session-only playlist integration test.
 * Usage: node scripts/session-playlist-test.js "<M3U_URL>"
 * Does NOT write the URL into app source or permanent config.
 * Stream URLs are redacted in output (host/path only, no query tokens dumped).
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var https = require('https');
var http = require('http');
var { URL } = require('url');

var root = path.join(__dirname, '..');
var playlistUrl = process.argv[2] || process.env.ELION_TEST_M3U_URL;

if (!playlistUrl) {
  console.error('Usage: node scripts/session-playlist-test.js "<M3U_URL>"');
  process.exit(2);
}

function redactUrl(u) {
  try {
    var x = new URL(u);
    return x.protocol + '//' + x.host + x.pathname.replace(/\/[^/]+$/, '/…');
  } catch (e) {
    return '[invalid-url]';
  }
}

function hostOf(u) {
  try { return new URL(u).host; } catch (e) { return '?'; }
}

function fetchText(url, redirectsLeft) {
  redirectsLeft = redirectsLeft == null ? 5 : redirectsLeft;
  return new Promise(function (resolve, reject) {
    var u = new URL(url);
    var lib = u.protocol === 'https:' ? https : http;
    var req = lib.get(url, {
      headers: {
        'User-Agent': 'ELION-IPTV-SessionTest/1.0',
        'Accept': '*/*'
      },
      timeout: 90000
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        var next = new URL(res.headers.location, url).href;
        res.resume();
        return resolve(fetchText(next, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode));
        res.resume();
        return;
      }
      var chunks = [];
      var size = 0;
      res.on('data', function (c) {
        size += c.length;
        if (size > 80 * 1024 * 1024) {
          req.destroy();
          reject(new Error('Playlist larger than 80MB'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', function () {
        resolve({
          text: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
          finalUrlHost: u.host,
          bytes: size,
          status: res.statusCode
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', function () {
      req.destroy();
      reject(new Error('Download timed out'));
    });
  });
}

function probeStream(url) {
  return new Promise(function (resolve) {
    var started = Date.now();
    var done = false;
    function finish(result) {
      if (done) return;
      done = true;
      resolve(result);
    }
    try {
      var u = new URL(url);
      var lib = u.protocol === 'https:' ? https : http;
      var req = lib.request(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'ELION-IPTV-SessionTest/1.0',
          'Accept': '*/*',
          'Range': 'bytes=0-2047'
        },
        timeout: 12000
      }, function (res) {
        var ctype = (res.headers['content-type'] || '').toLowerCase();
        var bufs = [];
        var n = 0;
        res.on('data', function (c) {
          if (n < 2048) bufs.push(c);
          n += c.length;
          if (n >= 2048) res.destroy();
        });
        res.on('end', function () {
          finish({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            contentType: ctype,
            bytes: n,
            ms: Date.now() - started,
            host: u.host,
            looksHls: /\.m3u8(\?|$)/i.test(url) || ctype.indexOf('mpegurl') !== -1 || ctype.indexOf('m3u8') !== -1,
            looksTs: /\.ts(\?|$)/i.test(url) || ctype.indexOf('mp2t') !== -1,
            looksMp4: /\.mp4(\?|$)/i.test(url) || ctype.indexOf('mp4') !== -1
          });
        });
        res.on('error', function () {
          finish({ ok: false, status: res.statusCode || 0, error: 'stream read error', host: u.host, ms: Date.now() - started });
        });
      });
      req.on('error', function (err) {
        finish({ ok: false, error: err.message, host: hostOf(url), ms: Date.now() - started });
      });
      req.on('timeout', function () {
        req.destroy();
        finish({ ok: false, error: 'timeout', host: hostOf(url), ms: Date.now() - started });
      });
      req.end();
    } catch (e) {
      finish({ ok: false, error: e.message, host: hostOf(url) });
    }
  });
}

function loadApp() {
  var sandbox = {
    console: console,
    URL: URL,
    Promise: Promise,
    Date: Date,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    localStorage: {
      _d: {},
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; }
    },
    indexedDB: undefined,
    document: { getElementById: function () { return null; }, addEventListener: function () {}, body: {}, querySelectorAll: function () { return []; }, createElement: function () { return {}; } },
    window: null,
    navigator: { onLine: true },
    fetch: function () { return Promise.reject(new Error('unused')); }
  };
  sandbox.window = sandbox;
  ['js/logger.js', 'js/utils.js', 'js/errors.js', 'js/storage.js', 'js/m3u-parser.js', 'js/search.js', 'js/playlist-manager.js', 'js/player.js'].forEach(function (rel) {
    vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
  });
  return sandbox;
}

async function main() {
  console.log('== ELION session playlist integration ==');
  console.log('Source host:', hostOf(playlistUrl));
  console.log('(Full playlist URL omitted from durable logs; passed only via argv/env for this session.)\n');

  var t0 = Date.now();
  var dl;
  try {
    dl = await fetchText(playlistUrl);
  } catch (e) {
    console.error('DOWNLOAD FAILED:', e.message);
    process.exit(1);
  }
  var downloadMs = Date.now() - t0;
  var cors = dl.headers['access-control-allow-origin'] || '(none)';
  console.log('Download: OK');
  console.log('  bytes:', dl.bytes);
  console.log('  time_ms:', downloadMs);
  console.log('  content-type:', dl.headers['content-type'] || '(none)');
  console.log('  CORS ACAO:', cors);

  var app = loadApp();
  await app.ElionStorage.ready();

  var t1 = Date.now();
  // Use same path as URL import after download
  var result = await app.ElionPlaylists.importFromTextAsync(dl.text, {
    name: 'Session Test',
    sourceType: 'url',
    url: '' // intentionally blank — do not persist session URL into storage snapshot for this report
  });
  var parseMs = Date.now() - t1;

  if (!result.ok) {
    console.error('PARSE FAILED:', (result.errors || []).join('; '));
    process.exit(1);
  }

  var state = app.ElionPlaylists.getState();
  var channels = state.channels;
  var withLogo = channels.filter(function (c) { return c.logo && /^https?:\/\//i.test(c.logo); }).length;
  var withTvg = channels.filter(function (c) { return c.tvgId; }).length;
  var httpsStreams = channels.filter(function (c) { return /^https:/i.test(c.url); }).length;
  var httpStreams = channels.filter(function (c) { return /^http:/i.test(c.url); }).length;
  var hls = channels.filter(function (c) { return /\.m3u8(\?|$)/i.test(c.url); }).length;
  var formats = {};
  channels.slice(0, 5000).forEach(function (c) {
    var f = app.ElionPlayer.detectFormat(c.url).label;
    formats[f] = (formats[f] || 0) + 1;
  });

  console.log('\nImport via ElionPlaylists.importFromTextAsync: OK');
  console.log('  channels:', result.channelCount);
  console.log('  parse_ms:', parseMs);
  console.log('  warnings:', (result.warnings || []).length);
  console.log('  categories:', state.categories.length);
  console.log('  top categories:');
  state.categories.slice(0, 15).forEach(function (c) {
    console.log('   -', c.name, '(' + c.count + ')');
  });
  if (state.categories.length > 15) console.log('   … +' + (state.categories.length - 15) + ' more');

  console.log('\nMetadata:');
  console.log('  with logos:', withLogo, '(' + Math.round(100 * withLogo / channels.length) + '%)');
  console.log('  with tvg-id:', withTvg);
  console.log('  https streams:', httpsStreams);
  console.log('  http streams:', httpStreams);
  console.log('  .m3u8 URLs (sample-based count):', hls);
  console.log('  format detection (first 5000):', JSON.stringify(formats));

  console.log('\nSample channel names (no stream URLs):');
  channels.slice(0, 8).forEach(function (c, i) {
    console.log(' ', i + 1 + '.', c.name, '| cat:', c.group, '| logo:', c.logo ? 'yes' : 'no');
  });

  // Probe a small diverse sample for network reachability (NOT decode proof)
  var sample = [];
  var seenHost = Object.create(null);
  for (var i = 0; i < channels.length && sample.length < 8; i += Math.max(1, Math.floor(channels.length / 12))) {
    var ch = channels[i];
    if (!ch || !ch.url) continue;
    var h = hostOf(ch.url);
    if (seenHost[h]) continue;
    seenHost[h] = true;
    sample.push(ch);
  }
  // Prefer at least one m3u8 if available
  var hlsCh = channels.find(function (c) { return /\.m3u8(\?|$)/i.test(c.url); });
  if (hlsCh && !sample.some(function (s) { return s.id === hlsCh.id; })) sample.unshift(hlsCh);
  sample = sample.slice(0, 8);

  console.log('\nStream probe sample (HTTP reachability only — not TV decode):');
  var probeOk = 0;
  for (var s = 0; s < sample.length; s++) {
    var p = await probeStream(sample[s].url);
    if (p.ok) probeOk++;
    console.log(' ', sample[s].name.slice(0, 40));
    console.log('    host:', p.host, '| status:', p.status || p.error, '| type:', p.contentType || '-', '|', p.ms + 'ms',
      p.looksHls ? '| HLS-ish' : '', p.looksTs ? '| TS-ish' : '', p.looksMp4 ? '| MP4-ish' : '');
  }

  console.log('\n== Summary ==');
  console.log(JSON.stringify({
    downloadOk: true,
    channels: result.channelCount,
    categories: state.categories.length,
    logoPct: Math.round(100 * withLogo / channels.length),
    warningCount: (result.warnings || []).length,
    corsHeader: cors,
    probeSampleOk: probeOk + '/' + sample.length,
    parseMs: parseMs,
    downloadMs: downloadMs,
    note: 'Desktop HTTP success does not prove LG webOS decode'
  }, null, 2));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
