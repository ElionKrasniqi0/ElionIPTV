(function (global) {
  'use strict';

  /**
   * Playlist + channel library. Starts empty — never seeds demo channels.
   * Multiple playlists are stored; one active playlist drives browse/search UI.
   */

  var state = {
    playlists: [],
    channels: [], // all channels across playlists (persisted)
    categories: [],
    loading: false,
    lastError: null,
    parseProgress: null,
    activePlaylistId: ''
  };

  var listeners = [];
  var importInFlight = null;
  var importGeneration = 0;

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(getState()); } catch (e) { ElionLog.error(e); }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function resolveActivePlaylistId() {
    var settings = ElionStorage.getSettings();
    var preferred = state.activePlaylistId || settings.activePlaylistId || settings.defaultPlaylistId || '';
    if (preferred && state.playlists.some(function (p) { return p.id === preferred; })) {
      return preferred;
    }
    if (state.playlists.length) return state.playlists[0].id;
    return '';
  }

  function getVisibleChannels() {
    var activeId = resolveActivePlaylistId();
    if (!activeId) return [];
    var out = [];
    for (var i = 0; i < state.channels.length; i++) {
      if (state.channels[i].playlistId === activeId) out.push(state.channels[i]);
    }
    return out;
  }

  function getState() {
    var activeId = resolveActivePlaylistId();
    var visible = getVisibleChannels();
    return {
      playlists: state.playlists.slice(),
      channels: visible,
      allChannels: state.channels,
      categories: state.categories.slice(),
      loading: state.loading,
      lastError: state.lastError,
      parseProgress: state.parseProgress,
      channelCount: visible.length,
      activePlaylistId: activeId,
      activePlaylist: getPlaylistById(activeId)
    };
  }

  function getPlaylistById(id) {
    if (!id) return null;
    for (var i = 0; i < state.playlists.length; i++) {
      if (state.playlists[i].id === id) return state.playlists[i];
    }
    return null;
  }

  function rebuildCategories() {
    var map = Object.create(null);
    var channels = getVisibleChannels();
    for (var i = 0; i < channels.length; i++) {
      var g = channels[i].group || 'Uncategorized';
      map[g] = (map[g] || 0) + 1;
    }
    state.categories = Object.keys(map).sort(function (a, b) {
      return a.localeCompare(b);
    }).map(function (name) {
      return { name: name, count: map[name] };
    });
  }

  function rebuildSearch() {
    if (global.ElionSearch) ElionSearch.build(getVisibleChannels());
  }

  function persist() {
    try {
      ElionStorage.savePlaylists(state.playlists);
      ElionStorage.saveChannels(state.channels);
      var activeId = resolveActivePlaylistId();
      state.activePlaylistId = activeId;
      ElionStorage.saveSettings({
        activePlaylistId: activeId,
        defaultPlaylistId: ElionStorage.getSettings().defaultPlaylistId || activeId
      });
    } catch (e) {
      state.lastError = ElionErrors.create('STORAGE', e.message).message;
      ElionErrors.show(e);
    }
  }

  function setActivePlaylist(playlistId) {
    if (!playlistId || !getPlaylistById(playlistId)) {
      return { ok: false, error: 'Playlist not found.' };
    }
    state.activePlaylistId = playlistId;
    ElionStorage.saveSettings({
      activePlaylistId: playlistId,
      defaultPlaylistId: playlistId
    });
    rebuildCategories();
    rebuildSearch();
    emit();
    return { ok: true, playlistId: playlistId };
  }

  function loadFromStorage() {
    try {
      // Intentionally empty on first launch — never inject demo/sample playlists
      state.playlists = ElionStorage.getPlaylists() || [];
      state.channels = ElionStorage.getChannels() || [];
      var settings = ElionStorage.getSettings();
      state.activePlaylistId = settings.activePlaylistId || settings.defaultPlaylistId || '';
      if (state.activePlaylistId && !getPlaylistById(state.activePlaylistId)) {
        state.activePlaylistId = state.playlists.length ? state.playlists[0].id : '';
      }
      if (!state.activePlaylistId && state.playlists.length) {
        state.activePlaylistId = state.playlists[0].id;
      }
      rebuildCategories();
      rebuildSearch();
      emit();
      ElionLog.info('Playlists loaded', {
        playlists: state.playlists.length,
        channels: state.channels.length,
        active: state.activePlaylistId || '(none)'
      });
    } catch (e) {
      state.playlists = [];
      state.channels = [];
      state.categories = [];
      state.activePlaylistId = '';
      ElionErrors.show(ElionErrors.create('STORAGE', e.message));
      emit();
    }
    return getState();
  }

  function applyUdpProxy(url) {
    var settings = ElionStorage.getSettings();
    if (!settings.udpProxyEnabled) return url;
    if (!/^udp:\/\//i.test(url)) return url;
    var host = settings.udpProxyAddress || '192.168.0.1';
    var port = settings.udpProxyPort || '4022';
    var m = url.match(/^udp:\/\/@?([^:/]+):?(\d+)?/i);
    if (!m) return url;
    var target = m[1] + ':' + (m[2] || '1234');
    return 'http://' + host + ':' + port + '/udp/' + target;
  }

  function getChannelById(id) {
    // Search all stored channels so favorites from inactive playlists still resolve
    for (var i = 0; i < state.channels.length; i++) {
      if (state.channels[i].id === id) return state.channels[i];
    }
    return null;
  }

  function getChannelsByGroup(group) {
    var out = [];
    var channels = getVisibleChannels();
    for (var i = 0; i < channels.length; i++) {
      if ((channels[i].group || 'Uncategorized') === group) out.push(channels[i]);
    }
    return out;
  }

  function searchChannels(query) {
    if (global.ElionSearch) return ElionSearch.searchChannels(query, 150);
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    var out = [];
    var channels = getVisibleChannels();
    for (var i = 0; i < channels.length && out.length < 150; i++) {
      var ch = channels[i];
      if ((ch.name && ch.name.toLowerCase().indexOf(q) !== -1) ||
          (ch.group && ch.group.toLowerCase().indexOf(q) !== -1) ||
          (ch.tvgId && ch.tvgId.toLowerCase().indexOf(q) !== -1)) {
        out.push(ch);
      }
    }
    return out;
  }

  function setLoading(v) {
    state.loading = !!v;
    if (!v) state.parseProgress = null;
    emit();
  }

  function upsertPlaylistMeta(meta) {
    var idx = -1;
    for (var i = 0; i < state.playlists.length; i++) {
      if (state.playlists[i].id === meta.id) { idx = i; break; }
    }
    if (idx >= 0) state.playlists[idx] = Object.assign({}, state.playlists[idx], meta);
    else state.playlists.push(meta);
  }

  function replacePlaylistChannels(playlistId, channels) {
    var kept = [];
    for (var i = 0; i < state.channels.length; i++) {
      if (state.channels[i].playlistId !== playlistId) kept.push(state.channels[i]);
    }
    state.channels = kept.concat(channels);
  }

  function pruneFavoritesAndRecents(removedChannelIds) {
    if (!removedChannelIds || !removedChannelIds.length) return;
    var removeSet = Object.create(null);
    for (var i = 0; i < removedChannelIds.length; i++) removeSet[removedChannelIds[i]] = true;

    var favs = ElionStorage.getFavorites().filter(function (id) { return !removeSet[id]; });
    ElionStorage.saveFavorites(favs);

    var recents = ElionStorage.getRecents().filter(function (r) { return r && !removeSet[r.id]; });
    ElionStorage.saveRecents(recents);

    var lastId = ElionStorage.get('lastChannelId');
    if (lastId && removeSet[lastId]) ElionStorage.set('lastChannelId', '');
  }

  function applyParsed(parsed, meta) {
    if (!parsed.ok) {
      state.lastError = parsed.errors.join(' ');
      return { ok: false, errors: parsed.errors, warnings: parsed.warnings };
    }
    var playlistId = meta.id || ElionUtils.uid('pl');
    var existing = getPlaylistById(playlistId);
    var playlist = {
      id: playlistId,
      name: meta.name || (existing && existing.name) || 'Playlist',
      sourceType: meta.sourceType || 'text',
      url: meta.url != null ? meta.url : (existing && existing.url) || '',
      channelCount: parsed.channels.length,
      updatedAt: Date.now(),
      createdAt: meta.createdAt || (existing && existing.createdAt) || Date.now(),
      epgUrl: (parsed.header && (parsed.header['url-tvg'] || parsed.header['x-tvg-url'])) || meta.epgUrl || (existing && existing.epgUrl) || ''
    };

    var oldIds = [];
    for (var i = 0; i < state.channels.length; i++) {
      if (state.channels[i].playlistId === playlistId) oldIds.push(state.channels[i].id);
    }

    upsertPlaylistMeta(playlist);
    replacePlaylistChannels(playlistId, parsed.channels);

    // Drop favorites that pointed at channels removed by replace/update
    var newIds = Object.create(null);
    for (var n = 0; n < parsed.channels.length; n++) newIds[parsed.channels[n].id] = true;
    var dropped = oldIds.filter(function (id) { return !newIds[id]; });
    pruneFavoritesAndRecents(dropped);

    state.activePlaylistId = playlistId;
    persist();
    rebuildCategories();
    rebuildSearch();
    state.lastError = null;
    emit();
    ElionLog.info('Playlist imported', { name: playlist.name, channels: playlist.channelCount, sourceType: playlist.sourceType });
    return {
      ok: true,
      playlist: playlist,
      channelCount: parsed.channels.length,
      categories: parsed.categories,
      warnings: parsed.warnings,
      errors: []
    };
  }

  function importFromText(text, meta) {
    meta = meta || {};
    var playlistId = meta.id || ElionUtils.uid('pl');
    meta.id = playlistId;
    try {
      var parsed = ElionM3U.parse(text, { playlistId: playlistId, skipDuplicates: true });
      return applyParsed(parsed, meta);
    } catch (e) {
      var err = ElionErrors.fromException(e, 'INVALID_PLAYLIST');
      state.lastError = err.message;
      return { ok: false, errors: [err.message], warnings: [] };
    }
  }

  function importFromTextAsync(text, meta) {
    meta = meta || {};
    if (importInFlight) {
      return Promise.resolve({
        ok: false,
        errors: ['Another playlist import is already in progress. Wait for it to finish.']
      });
    }
    var playlistId = meta.id || ElionUtils.uid('pl');
    meta.id = playlistId;
    var gen = ++importGeneration;
    setLoading(true);
    importInFlight = ElionM3U.parseAsync(text, { playlistId: playlistId, skipDuplicates: true }, function (p) {
      if (gen !== importGeneration) return;
      state.parseProgress = p;
      emit();
    }).then(function (parsed) {
      if (gen !== importGeneration) {
        return { ok: false, errors: ['Import superseded.'] };
      }
      var result = applyParsed(parsed, meta);
      setLoading(false);
      importInFlight = null;
      return result;
    }).catch(function (e) {
      setLoading(false);
      importInFlight = null;
      var err = ElionErrors.fromException(e, 'INVALID_PLAYLIST');
      state.lastError = err.message;
      ElionErrors.show(err);
      return { ok: false, errors: [err.message], warnings: [] };
    });
    return importInFlight;
  }

  function importFromUrl(url, name, options) {
    options = options || {};
    url = ElionUtils.normalizeUrl(url);
    var check = ElionM3U.validateUrl(url);
    if (!check.ok) {
      return Promise.resolve({ ok: false, errors: [check.error || ElionErrors.MESSAGES.INVALID_URL] });
    }
    if (importInFlight) {
      return Promise.resolve({
        ok: false,
        errors: ['Another playlist import is already in progress. Wait for it to finish.']
      });
    }

    setLoading(true);
    state.lastError = null;
    ElionLog.info('Downloading playlist');
    // Mark in-flight so overlapping URL imports are rejected until download+parse settle
    var gate = { pending: true };
    importInFlight = gate;

    return ElionUtils.downloadText(url, 90000, { accept: 'playlist', retries: 2 }).then(function (text) {
      importInFlight = null;
      var meta = {
        name: name || deriveNameFromUrl(url),
        sourceType: 'url',
        url: url
      };
      if (options.id) {
        meta.id = options.id;
        var existing = getPlaylistById(options.id);
        if (existing) {
          meta.createdAt = existing.createdAt;
          meta.epgUrl = existing.epgUrl;
          if (!name) meta.name = existing.name;
        }
      }
      return importFromTextAsync(text, meta);
    }).catch(function (err) {
      setLoading(false);
      importInFlight = null;
      // Never delete stored playlists because of a download failure
      var e = ElionErrors.fromException(err, 'NETWORK');
      state.lastError = e.message;
      ElionLog.warn('Playlist download failed', e.message);
      emit();
      return { ok: false, errors: [e.message + (e.detail ? ' — ' + e.detail : '')] };
    });
  }

  function deriveNameFromUrl(url) {
    try {
      var u = new URL(url);
      var path = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
      return decodeURIComponent(path).replace(/\.(m3u8?)$/i, '') || 'Remote Playlist';
    } catch (e) {
      return 'Remote Playlist';
    }
  }

  function refreshPlaylist(playlistId) {
    var pl = getPlaylistById(playlistId);
    if (!pl) return Promise.resolve({ ok: false, errors: ['Playlist not found.'] });
    if (pl.sourceType !== 'url' || !pl.url) {
      return Promise.resolve({ ok: false, errors: ['Only URL playlists can be refreshed.'] });
    }
    return importFromUrl(pl.url, pl.name, { id: pl.id });
  }

  /** Replace/update an existing playlist with a new M3U URL (keeps playlist id). */
  function replacePlaylistUrl(playlistId, url, name) {
    var pl = getPlaylistById(playlistId);
    if (!pl) return Promise.resolve({ ok: false, errors: ['Playlist not found.'] });
    url = ElionUtils.normalizeUrl(url);
    var check = ElionM3U.validateUrl(url);
    if (!check.ok) {
      return Promise.resolve({ ok: false, errors: [check.error || ElionErrors.MESSAGES.INVALID_URL] });
    }
    return importFromUrl(url, name || pl.name, { id: playlistId });
  }

  function renamePlaylist(playlistId, name) {
    var n = String(name || '').trim();
    if (!n) return { ok: false, error: 'Name cannot be empty.' };
    if (!getPlaylistById(playlistId)) return { ok: false, error: 'Playlist not found.' };
    upsertPlaylistMeta({ id: playlistId, name: n });
    persist();
    emit();
    return { ok: true };
  }

  function removePlaylist(playlistId) {
    var removedIds = [];
    for (var i = 0; i < state.channels.length; i++) {
      if (state.channels[i].playlistId === playlistId) removedIds.push(state.channels[i].id);
    }
    state.playlists = state.playlists.filter(function (p) { return p.id !== playlistId; });
    state.channels = state.channels.filter(function (c) { return c.playlistId !== playlistId; });
    pruneFavoritesAndRecents(removedIds);

    if (state.activePlaylistId === playlistId) {
      state.activePlaylistId = state.playlists.length ? state.playlists[0].id : '';
    }
    var settings = ElionStorage.getSettings();
    if (settings.defaultPlaylistId === playlistId) {
      ElionStorage.saveSettings({ defaultPlaylistId: state.activePlaylistId || '' });
    }
    persist();
    rebuildCategories();
    rebuildSearch();
    emit();
    return { ok: true };
  }

  function clearAll() {
    var allIds = state.channels.map(function (c) { return c.id; });
    state.playlists = [];
    state.channels = [];
    state.categories = [];
    state.activePlaylistId = '';
    pruneFavoritesAndRecents(allIds);
    ElionStorage.saveSettings({ activePlaylistId: '', defaultPlaylistId: '' });
    persist();
    rebuildSearch();
    emit();
  }

  global.ElionPlaylists = {
    loadFromStorage: loadFromStorage,
    getState: getState,
    onChange: onChange,
    importFromText: importFromText,
    importFromTextAsync: importFromTextAsync,
    importFromUrl: importFromUrl,
    refreshPlaylist: refreshPlaylist,
    replacePlaylistUrl: replacePlaylistUrl,
    renamePlaylist: renamePlaylist,
    removePlaylist: removePlaylist,
    setActivePlaylist: setActivePlaylist,
    getPlaylistById: getPlaylistById,
    clearAll: clearAll,
    getChannelById: getChannelById,
    getChannelsByGroup: getChannelsByGroup,
    searchChannels: searchChannels,
    applyUdpProxy: applyUdpProxy,
    setLoading: setLoading
  };
})(window);
