(function (global) {
  'use strict';

  function parseXmltvTime(value) {
    if (!value) return 0;
    var m = String(value).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+\-]\d{4})?/);
    if (!m) return 0;
    var y = +m[1], mo = +m[2] - 1, d = +m[3], h = +m[4], mi = +m[5], s = +m[6];
    var tz = m[7];
    if (tz) {
      var sign = tz.charAt(0) === '-' ? -1 : 1;
      var th = parseInt(tz.slice(1, 3), 10);
      var tm = parseInt(tz.slice(3, 5), 10);
      var utc = Date.UTC(y, mo, d, h, mi, s) - sign * (th * 60 + tm) * 60000;
      return utc;
    }
    // No timezone: treat as local wall time
    return new Date(y, mo, d, h, mi, s).getTime();
  }

  function parseXmltv(xmlText) {
    var programmes = {};
    var channelNames = {};
    if (!xmlText) return { programmes: programmes, channels: channelNames };

    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlText, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('Invalid XMLTV document.');
    }

    var chNodes = doc.getElementsByTagName('channel');
    for (var c = 0; c < chNodes.length; c++) {
      var id = chNodes[c].getAttribute('id') || '';
      var dn = chNodes[c].getElementsByTagName('display-name')[0];
      if (id && dn) channelNames[id] = dn.textContent.trim();
    }

    var nodes = doc.getElementsByTagName('programme');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var channel = node.getAttribute('channel') || '';
      var start = parseXmltvTime(node.getAttribute('start'));
      var stop = parseXmltvTime(node.getAttribute('stop'));
      var titleNode = node.getElementsByTagName('title')[0];
      var descNode = node.getElementsByTagName('desc')[0];
      var title = titleNode ? titleNode.textContent : 'Programme';
      var desc = descNode ? descNode.textContent : '';
      if (!channel || !start) continue;
      if (!programmes[channel]) programmes[channel] = [];
      programmes[channel].push({
        channel: channel,
        start: start,
        stop: stop || (start + 3600000),
        title: title,
        desc: desc
      });
    }

    Object.keys(programmes).forEach(function (ch) {
      programmes[ch].sort(function (a, b) { return a.start - b.start; });
    });

    return { programmes: programmes, channels: channelNames };
  }

  function loadFromUrl(url) {
    return ElionUtils.downloadText(url, 90000, { accept: 'xml', retries: 1 }).then(function (text) {
      var parsed = parseXmltv(text);
      var cache = {
        updatedAt: Date.now(),
        source: url,
        programmes: parsed.programmes,
        channels: parsed.channels
      };
      try {
        ElionStorage.saveEpgCache(cache);
        var sources = ElionStorage.getEpgSources().filter(function (s) { return s !== url; });
        sources.unshift(url);
        ElionStorage.saveEpgSources(sources.slice(0, 10));
      } catch (e) {
        if (global.ElionLog) ElionLog.warn('EPG cache save failed', e && e.message);
      }
      return cache;
    }).catch(function (err) {
      // Never wipe existing EPG cache on download/parse failure
      if (global.ElionLog) ElionLog.warn('EPG load failed', err && err.message);
      throw err;
    });
  }

  function loadFromText(text, label) {
    var parsed = parseXmltv(text);
    var cache = {
      updatedAt: Date.now(),
      source: label || 'pasted',
      programmes: parsed.programmes,
      channels: parsed.channels
    };
    try {
      ElionStorage.saveEpgCache(cache);
    } catch (e) {
      if (global.ElionLog) ElionLog.warn('EPG cache save failed', e && e.message);
    }
    return cache;
  }

  function normalizeName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function resolveEpgKey(channel, cache) {
    cache = cache || ElionStorage.getEpgCache();
    var programmes = cache.programmes || {};
    if (channel.tvgId && programmes[channel.tvgId]) return channel.tvgId;

    // Match display-name map from XMLTV <channel>
    var names = cache.channels || {};
    var want = normalizeName(channel.name);
    var wantTvg = normalizeName(channel.tvgName || '');
    var keys = Object.keys(names);
    for (var i = 0; i < keys.length; i++) {
      var n = normalizeName(names[keys[i]]);
      if (n && (n === want || (wantTvg && n === wantTvg))) {
        if (programmes[keys[i]]) return keys[i];
      }
    }

    // Fallback: programme keys that equal channel name / tvg-name
    if (channel.tvgName && programmes[channel.tvgName]) return channel.tvgName;
    if (programmes[channel.name]) return channel.name;

    var pkeys = Object.keys(programmes);
    for (var j = 0; j < pkeys.length; j++) {
      if (normalizeName(pkeys[j]) === want) return pkeys[j];
    }
    return null;
  }

  function getProgrammesForChannel(channel) {
    try {
      if (!channel) return [];
      var cache = ElionStorage.getEpgCache();
      var key = resolveEpgKey(channel, cache);
      if (!key) return [];
      return (cache.programmes[key] || []).slice();
    } catch (e) {
      if (global.ElionLog) ElionLog.warn('EPG programmes failed', e && e.message);
      return [];
    }
  }

  function getNowNext(channel) {
    try {
      var list = typeof channel === 'string'
        ? ((ElionStorage.getEpgCache().programmes || {})[channel] || [])
        : getProgrammesForChannel(channel);
      var now = Date.now();
      var current = null;
      var next = null;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (!p) continue;
        if (p.start <= now && now < p.stop) {
          current = p;
          next = list[i + 1] || null;
          break;
        }
        if (p.start > now) {
          next = p;
          break;
        }
      }
      return { now: current, next: next };
    } catch (e) {
      if (global.ElionLog) ElionLog.warn('EPG getNowNext failed', e && e.message);
      return { now: null, next: null };
    }
  }

  function progressOf(programme) {
    if (!programme) return 0;
    var now = Date.now();
    var span = programme.stop - programme.start;
    if (span <= 0) return 0;
    return ElionUtils.clamp((now - programme.start) / span, 0, 1);
  }

  function formatRange(programme) {
    if (!programme) return '';
    var opts = { hour: '2-digit', minute: '2-digit' };
    return new Date(programme.start).toLocaleTimeString([], opts) +
      ' – ' +
      new Date(programme.stop).toLocaleTimeString([], opts);
  }

  function getGuideForChannels(channels, hours) {
    hours = hours || 6;
    var now = Date.now();
    var end = now + hours * 3600000;
    return (channels || []).map(function (ch) {
      var list = getProgrammesForChannel(ch).filter(function (p) {
        return p.stop > now && p.start < end;
      }).slice(0, 16);
      var nn = getNowNext(ch);
      return { channel: ch, programmes: list, now: nn.now, next: nn.next };
    });
  }

  function hasData() {
    var cache = ElionStorage.getEpgCache();
    return !!(cache && cache.programmes && Object.keys(cache.programmes).length);
  }

  global.ElionEPG = {
    parseXmltv: parseXmltv,
    loadFromUrl: loadFromUrl,
    loadFromText: loadFromText,
    resolveEpgKey: resolveEpgKey,
    getProgrammesForChannel: getProgrammesForChannel,
    getNowNext: getNowNext,
    progressOf: progressOf,
    formatRange: formatRange,
    getGuideForChannels: getGuideForChannels,
    hasData: hasData
  };
})(window);
