(function (global) {
  'use strict';

  /**
   * Dev logging that never prints full playlist/stream URLs or pairing payloads.
   */
  var enabled = true;
  var LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  var minLevel = LEVELS.debug;

  function redact(value) {
    if (value == null) return value;
    if (typeof value === 'string') {
      return value
        .replace(/https?:\/\/[^\s"'<>]+/gi, '[url]')
        .replace(/udp:\/\/[^\s"'<>]+/gi, '[udp]')
        .replace(/rtsp:\/\/[^\s"'<>]+/gi, '[rtsp]')
        .replace(/rtmp:\/\/[^\s"'<>]+/gi, '[rtmp]');
    }
    if (Array.isArray(value)) return value.map(redact);
    if (typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) {
        var lk = k.toLowerCase();
        if (lk === 'url' || lk === 'src' || lk === 'content' || lk === 'payload' || lk.indexOf('playlist') !== -1 && lk.indexOf('count') === -1) {
          out[k] = typeof value[k] === 'string' ? '[redacted]' : redact(value[k]);
        } else {
          out[k] = redact(value[k]);
        }
      });
      return out;
    }
    return value;
  }

  function write(level, args) {
    if (!enabled || LEVELS[level] < minLevel) return;
    var safe = Array.prototype.map.call(args, redact);
    var fn = console[level] || console.log;
    try {
      fn.apply(console, ['[ELION ' + level.toUpperCase() + ']'].concat(safe));
    } catch (e) { /* ignore */ }
  }

  global.ElionLog = {
    setEnabled: function (v) { enabled = !!v; },
    setLevel: function (name) { if (LEVELS[name] != null) minLevel = LEVELS[name]; },
    redact: redact,
    debug: function () { write('debug', arguments); },
    info: function () { write('info', arguments); },
    warn: function () { write('warn', arguments); },
    error: function () { write('error', arguments); }
  };
})(window);
