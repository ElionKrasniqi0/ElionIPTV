#!/usr/bin/env node
'use strict';

/**
 * ELION IPTV Companion Relay
 * ---------------------------
 * Runs on a PC on the same LAN as the TV.
 * The webOS app cannot accept inbound connections, so the TV polls this relay.
 *
 * Endpoints:
 *   POST /api/pair              { code, expiresAt }
 *   GET  /api/pair/:code
 *   POST /api/pair/:code/submit { url?, content?, name? }
 *   POST /api/pair/:code/consume
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var url = require('url');

var PORT = parseInt(process.env.ELION_PORT || '8787', 10);
var HOST = process.env.ELION_HOST || '0.0.0.0';
var sessions = Object.create(null);
var PUBLIC = path.join(__dirname, 'public');

function lanAddresses() {
  var nets = os.networkInterfaces();
  var out = [];
  Object.keys(nets).forEach(function (name) {
    nets[name].forEach(function (net) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    });
  });
  return out;
}

function cleanup() {
  var now = Date.now();
  Object.keys(sessions).forEach(function (code) {
    if (sessions[code].expiresAt < now) delete sessions[code];
  });
}
setInterval(cleanup, 30000);

function send(res, status, data, headers) {
  var body = typeof data === 'string' ? data : JSON.stringify(data);
  var h = Object.assign({
    'Content-Type': typeof data === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }, headers || {});
  res.writeHead(status, h);
  res.end(body);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function serveStatic(reqPath, res) {
  var file = reqPath === '/' ? '/index.html' : reqPath;
  var full = path.normalize(path.join(PUBLIC, file));
  if (full.indexOf(PUBLIC) !== 0) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(full, function (err, data) {
    if (err) return send(res, 404, { error: 'Not found' });
    var ext = path.extname(full).toLowerCase();
    var types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
    send(res, 200, data.toString('utf8'), { 'Content-Type': types[ext] || 'application/octet-stream' });
  });
}

var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  var pathname = parsed.pathname || '/';

  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (req.method === 'POST' && pathname === '/api/pair') {
    return readBody(req).then(function (raw) {
      var body = JSON.parse(raw || '{}');
      var code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) return send(res, 400, { error: 'Invalid code' });
      var expiresAt = Number(body.expiresAt) || (Date.now() + 10 * 60 * 1000);
      sessions[code] = {
        code: code,
        expiresAt: expiresAt,
        status: 'waiting',
        payload: null,
        createdAt: Date.now()
      };
      var addr = lanAddresses()[0] || '127.0.0.1';
      var pairUrl = 'http://' + addr + ':' + PORT + '/?code=' + encodeURIComponent(code);
      send(res, 200, { ok: true, code: code, pairUrl: pairUrl, expiresAt: expiresAt });
    }).catch(function (err) {
      send(res, 400, { error: err.message || 'Bad request' });
    });
  }

  var pairMatch = pathname.match(/^\/api\/pair\/([A-Za-z0-9]+)(\/submit|\/consume)?$/);
  if (pairMatch) {
    var code = pairMatch[1].toUpperCase();
    var action = pairMatch[2] || '';
    var session = sessions[code];

    if (!session || session.expiresAt < Date.now()) {
      if (session) delete sessions[code];
      return send(res, 404, { error: 'Code expired or not found' });
    }

    if (req.method === 'GET' && !action) {
      return send(res, 200, {
        status: session.payload ? 'ready' : session.status,
        expiresAt: session.expiresAt,
        payload: session.payload
      });
    }

    if (req.method === 'POST' && action === '/submit') {
      return readBody(req).then(function (raw) {
        var body = JSON.parse(raw || '{}');
        if (!body.url && !body.content) return send(res, 400, { error: 'Provide url or content' });
        session.payload = {
          url: body.url || '',
          content: body.content || '',
          name: body.name || 'Phone/PC Import'
        };
        session.status = 'ready';
        send(res, 200, { ok: true });
      }).catch(function (err) {
        send(res, 400, { error: err.message || 'Bad request' });
      });
    }

    if (req.method === 'POST' && action === '/consume') {
      delete sessions[code];
      return send(res, 200, { ok: true });
    }
  }

  if (req.method === 'GET') return serveStatic(pathname, res);
  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, function () {
  var addrs = lanAddresses();
  console.log('ELION IPTV Companion listening on port ' + PORT);
  console.log('Open on this PC:  http://127.0.0.1:' + PORT);
  addrs.forEach(function (a) {
    console.log('LAN URL for TV:   http://' + a + ':' + PORT);
  });
  console.log('In the TV app: Settings → Companion URL → save one of the LAN URLs above.');
});
