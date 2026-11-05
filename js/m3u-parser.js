(function (global) {
  'use strict';

  var ATTR_RE = /([a-zA-Z0-9\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;

  function parseAttributes(attrText) {
    var attrs = {};
    if (!attrText) return attrs;
    var m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(attrText)) !== null) {
      attrs[m[1].toLowerCase()] = m[2] != null ? m[2] : (m[3] != null ? m[3] : m[4]);
    }
    return attrs;
  }

  function splitExtinf(line) {
    // #EXTINF:duration [attrs],title
    var body = line.replace(/^#EXTINF:/i, '');
    var comma = -1;
    var inQuotes = false;
    var quoteChar = '';
    for (var i = 0; i < body.length; i++) {
      var ch = body.charAt(i);
      if ((ch === '"' || ch === "'") && (!inQuotes || ch === quoteChar)) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = ch;
        } else {
          inQuotes = false;
          quoteChar = '';
        }
      } else if (ch === ',' && !inQuotes) {
        comma = i;
        break;
      }
    }

    var metaPart = comma >= 0 ? body.slice(0, comma) : body;
    var title = comma >= 0 ? body.slice(comma + 1).trim() : '';

    var duration = -1;
    var attrText = '';
    var spaceIdx = metaPart.search(/\s/);
    if (spaceIdx === -1) {
      duration = parseFloat(metaPart);
    } else {
      duration = parseFloat(metaPart.slice(0, spaceIdx));
      attrText = metaPart.slice(spaceIdx + 1).trim();
    }
    if (!isFinite(duration)) duration = -1;

    return {
      duration: duration,
      attrs: parseAttributes(attrText),
      title: title
    };
  }

  function isUrlLine(line) {
    if (!line || line.charAt(0) === '#') return false;
    var t = line.trim();
    if (!t) return false;
    if (/^(https?|rtmp|rtsp|udp|rtp|mms):\/\//i.test(t)) return true;
    if (/^\/\//.test(t)) return true;
    if (/\.(m3u8?|ts|mp4|mkv|mpd)(\?|#|$)/i.test(t)) return true;
    return t.indexOf('://') !== -1;
  }

  function stripUnsafeText(str) {
    return String(str == null ? '' : str)
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .trim();
  }

  function sanitizeMediaUrl(url) {
    var u = ElionUtils.normalizeUrl(url);
    if (!u) return '';
    // Never allow script/data execution vectors from playlist content
    if (/^(javascript|data|vbscript|file):/i.test(u)) return '';
    return u;
  }

  function rememberCategory(order, map, name) {
    var key = name || 'Uncategorized';
    if (map[key] == null) {
      map[key] = 0;
      order.push(key);
    }
    map[key]++;
  }

  function categoriesInOrder(order, map) {
    var out = [];
    for (var i = 0; i < order.length; i++) {
      out.push({ name: order[i], count: map[order[i]] });
    }
    return out;
  }

  function sanitizeLogoUrl(url) {
    var u = ElionUtils.normalizeUrl(url);
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) return '';
    return u;
  }

  function normalizeChannel(raw, index, playlistId) {
    var attrs = raw.attrs || {};
    var name = stripUnsafeText(raw.title || attrs['tvg-name'] || attrs['tvg-id'] || ('Channel ' + (index + 1)));
    // Prefer explicit EXTINF group-title over EXTGRP fallback
    var group = stripUnsafeText(attrs['group-title'] || raw.group || 'Uncategorized') || 'Uncategorized';
    var logo = sanitizeLogoUrl(attrs['tvg-logo'] || attrs.logo || '');
    var tvgId = stripUnsafeText(attrs['tvg-id'] || '');
    var tvgName = stripUnsafeText(attrs['tvg-name'] || '');
    var url = sanitizeMediaUrl(raw.url);

    var idSeed = playlistId + '|' + url + '|' + name + '|' + tvgId;
    return {
      id: 'ch_' + ElionUtils.hashString(idSeed),
      playlistId: playlistId,
      name: name || ('Channel ' + (index + 1)),
      url: url,
      logo: logo,
      group: group,
      tvgId: tvgId,
      tvgName: tvgName,
      duration: raw.duration,
      number: index + 1
      // attrs intentionally omitted from persisted model (untrusted)
    };
  }

  /**
   * Parse M3U / M3U8 playlist text into channels.
   * @returns {{ ok: boolean, channels: Array, categories: Array, errors: Array, warnings: Array, header: Object }}
   */
  function parse(text, options) {
    options = options || {};
    var playlistId = options.playlistId || 'default';
    var result = {
      ok: false,
      channels: [],
      categories: [],
      errors: [],
      warnings: [],
      header: {}
    };

    if (text == null || String(text).trim() === '') {
      result.errors.push('Playlist is empty.');
      return result;
    }

    // Normalize encodings / line endings
    var content = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = content.split('\n');

    var pending = null;
    var pendingGroup = null;
    var channels = [];
    var seenUrls = Object.create(null);
    var categoryMap = Object.create(null);
    var categoryOrder = [];
    var started = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      if (line.indexOf('#EXTM3U') === 0) {
        started = true;
        result.header = parseAttributes(line.replace(/^#EXTM3U/i, '').trim());
        continue;
      }

      if (line.charAt(0) === '#') {
        if (/^#EXTINF:/i.test(line)) {
          try {
            pending = splitExtinf(line);
            if (pendingGroup && !(pending.attrs && pending.attrs['group-title'])) {
              pending.group = pendingGroup;
            }
          } catch (e) {
            result.warnings.push('Line ' + (i + 1) + ': malformed EXTINF ignored.');
            pending = null;
          }
          continue;
        }
        if (/^#EXTGRP:/i.test(line)) {
          pendingGroup = line.replace(/^#EXTGRP:/i, '').trim();
          if (pending && !(pending.attrs && pending.attrs['group-title'])) pending.group = pendingGroup;
          continue;
        }
        if (/^#EXTVLCOPT:/i.test(line) || /^#EXT-X-/i.test(line) || /^#PLAYLIST:/i.test(line)) {
          continue;
        }
        // Other comments ignored
        continue;
      }

      if (isUrlLine(line)) {
        started = true;
        var url = ElionUtils.normalizeUrl(line);
        if (!url) {
          result.warnings.push('Line ' + (i + 1) + ': empty URL skipped.');
          pending = null;
          continue;
        }

        var raw = pending || { duration: -1, attrs: {}, title: '', group: pendingGroup };
        raw.url = url;
        if (!raw.group && pendingGroup && !(raw.attrs && raw.attrs['group-title'])) {
          raw.group = pendingGroup;
        }

        var channel;
        try {
          channel = normalizeChannel(raw, channels.length, playlistId);
        } catch (normErr) {
          result.warnings.push('Line ' + (i + 1) + ': malformed channel entry skipped.');
          pending = null;
          continue;
        }

        if (!channel.url) {
          result.warnings.push('Line ' + (i + 1) + ': channel without URL skipped.');
        } else if (seenUrls[channel.url] && options.skipDuplicates !== false) {
          result.warnings.push('Duplicate URL skipped: ' + channel.name);
        } else {
          seenUrls[channel.url] = true;
          channels.push(channel);
          rememberCategory(categoryOrder, categoryMap, channel.group);
        }

        pending = null;
        continue;
      }

      if (pending) {
        result.warnings.push('Line ' + (i + 1) + ': EXTINF without URL discarded.');
        pending = null;
      }
    }

    if (pending) {
      result.warnings.push('Trailing EXTINF without URL discarded.');
      pending = null;
    }

    if (!started && channels.length === 0) {
      result.errors.push('Not a valid M3U playlist (missing #EXTM3U and no stream URLs found).');
      return result;
    }

    if (channels.length === 0) {
      result.errors.push('No channels found in playlist.');
      return result;
    }

    var categories = categoriesInOrder(categoryOrder, categoryMap);

    result.ok = true;
    result.channels = channels;
    result.categories = categories;
    return result;
  }

  function validateUrl(url) {
    if (!ElionUtils.isValidHttpUrl(url)) {
      return { ok: false, error: 'Enter a valid http:// or https:// playlist URL.' };
    }
    return { ok: true };
  }

  /**
   * Async parse that yields to the event loop so large playlists do not freeze the TV UI.
   * onProgress({ linesDone, lineCount, channelCount })
   */
  function parseAsync(text, options, onProgress) {
    options = options || {};
    return new Promise(function (resolve) {
      // For small playlists, sync parse is fine and faster
      var size = text == null ? 0 : String(text).length;
      if (size < 400000) {
        resolve(parse(text, options));
        return;
      }

      var playlistId = options.playlistId || 'default';
      var result = { ok: false, channels: [], categories: [], errors: [], warnings: [], header: {} };
      if (text == null || String(text).trim() === '') {
        result.errors.push('Playlist is empty.');
        resolve(result);
        return;
      }

      var content = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      var lines = content.split('\n');
      var pending = null;
      var pendingGroup = null;
      var channels = [];
      var seenUrls = Object.create(null);
      var categoryMap = Object.create(null);
      var categoryOrder = [];
      var started = false;
      var i = 0;
      var CHUNK = 800;

      function finish() {
        if (pending) result.warnings.push('Trailing EXTINF without URL discarded.');
        if (!started && channels.length === 0) {
          result.errors.push('Not a valid M3U playlist (missing #EXTM3U and no stream URLs found).');
          resolve(result);
          return;
        }
        if (channels.length === 0) {
          result.errors.push('No channels found in playlist.');
          resolve(result);
          return;
        }
        result.ok = true;
        result.channels = channels;
        result.categories = categoriesInOrder(categoryOrder, categoryMap);
        resolve(result);
      }

      function step() {
        var end = Math.min(i + CHUNK, lines.length);
        for (; i < end; i++) {
          var line = lines[i].trim();
          if (!line) continue;
          if (line.indexOf('#EXTM3U') === 0) {
            started = true;
            result.header = parseAttributes(line.replace(/^#EXTM3U/i, '').trim());
            continue;
          }
          if (line.charAt(0) === '#') {
            if (/^#EXTINF:/i.test(line)) {
              try {
                pending = splitExtinf(line);
                if (pendingGroup && !(pending.attrs && pending.attrs['group-title'])) pending.group = pendingGroup;
              } catch (e) {
                result.warnings.push('Line ' + (i + 1) + ': malformed EXTINF ignored.');
                pending = null;
              }
              continue;
            }
            if (/^#EXTGRP:/i.test(line)) {
              pendingGroup = line.replace(/^#EXTGRP:/i, '').trim();
              if (pending && !(pending.attrs && pending.attrs['group-title'])) pending.group = pendingGroup;
              continue;
            }
            continue;
          }
          if (isUrlLine(line)) {
            started = true;
            var url = sanitizeMediaUrl(line);
            if (!url) { pending = null; continue; }
            var raw = pending || { duration: -1, attrs: {}, title: '', group: pendingGroup };
            raw.url = url;
            if (!raw.group && pendingGroup && !(raw.attrs && raw.attrs['group-title'])) {
              raw.group = pendingGroup;
            }
            var channel = normalizeChannel(raw, channels.length, playlistId);
            if (channel.url && !(seenUrls[channel.url] && options.skipDuplicates !== false)) {
              seenUrls[channel.url] = true;
              channels.push(channel);
              rememberCategory(categoryOrder, categoryMap, channel.group);
            } else if (channel.url) {
              result.warnings.push('Duplicate URL skipped: ' + channel.name);
            }
            pending = null;
          } else if (pending) {
            result.warnings.push('Line ' + (i + 1) + ': EXTINF without URL discarded.');
            pending = null;
          }
        }
        if (onProgress) {
          try { onProgress({ linesDone: i, lineCount: lines.length, channelCount: channels.length }); } catch (e) { /* ignore */ }
        }
        if (i < lines.length) setTimeout(step, 0);
        else finish();
      }
      step();
    });
  }

  global.ElionM3U = {
    parse: parse,
    parseAsync: parseAsync,
    validateUrl: validateUrl,
    parseAttributes: parseAttributes,
    sanitizeMediaUrl: sanitizeMediaUrl,
    sanitizeLogoUrl: sanitizeLogoUrl
  };
})(window);
