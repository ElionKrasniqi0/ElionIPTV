(function (global) {
  'use strict';

  /**
   * Fast channel search for large libraries.
   * Builds a lightweight token index; queries are debounced by the UI.
   */

  var index = [];

  function tokenize(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s\-_.]/gu, ' ')
      .split(/[\s\-_.]+/)
      .filter(Boolean);
  }

  // Fallback for engines without Unicode property escapes (older webOS)
  function tokenizeSafe(str) {
    try {
      return tokenize(str);
    } catch (e) {
      return String(str || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\s\-_.]/gi, ' ').split(/[\s\-_.]+/).filter(Boolean);
    }
  }

  function build(channels) {
    index = [];
    var list = channels || [];
    for (var i = 0; i < list.length; i++) {
      var ch = list[i];
      var hay = [
        ch.name,
        ch.group,
        ch.tvgId,
        ch.tvgName,
        ch.number != null ? String(ch.number) : ''
      ].join(' ').toLowerCase();
      index.push({
        id: ch.id,
        hay: hay,
        tokens: tokenizeSafe([ch.name, ch.group, ch.tvgId, ch.tvgName].join(' '))
      });
    }
    if (global.ElionLog) ElionLog.debug('Search index ready', { entries: index.length });
  }

  function search(query, limit) {
    limit = limit || 100;
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    var qTokens = tokenizeSafe(q);
    var out = [];
    for (var i = 0; i < index.length; i++) {
      var item = index[i];
      var ok = false;
      if (item.hay.indexOf(q) !== -1) {
        ok = true;
      } else if (qTokens.length) {
        ok = qTokens.every(function (t) {
          return item.hay.indexOf(t) !== -1;
        });
      }
      if (ok) {
        out.push(item.id);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  function searchChannels(query, limit) {
    var ids = search(query, limit);
    var map = Object.create(null);
    (ElionPlaylists.getState().channels || []).forEach(function (c) { map[c.id] = c; });
    return ids.map(function (id) { return map[id]; }).filter(Boolean);
  }

  global.ElionSearch = {
    build: build,
    search: search,
    searchChannels: searchChannels
  };
})(window);
