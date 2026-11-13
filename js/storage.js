(function (global) {
  'use strict';

  /**
   * Hybrid persistence for webOS TV:
   * - Small prefs / favorites / playlist metadata → localStorage
   * - Large channel catalogs → IndexedDB (with localStorage fallback)
   * Memory cache keeps sync reads fast after hydrate.
   */

  var PREFIX = 'elion_iptv_';
  var IDB_NAME = 'elion_iptv_db';
  var IDB_STORE = 'kv';
  var IDB_VERSION = 1;
  var memory = {};
  var readyPromise = null;
  var idb = null;
  var storageWarnings = [];

  function key(name) { return PREFIX + name; }

  function safeParse(raw, fallback, name) {
    if (raw == null || raw === '') return fallback;
    try {
      var val = JSON.parse(raw);
      if (val === undefined) return fallback;
      return val;
    } catch (e) {
      storageWarnings.push('Corrupted key "' + name + '" — using defaults.');
      if (global.ElionLog) ElionLog.warn('Corrupt storage key', name);
      return fallback;
    }
  }

  function lsGet(name, fallback) {
    try {
      return safeParse(localStorage.getItem(key(name)), fallback, name);
    } catch (e) {
      storageWarnings.push('localStorage read failed.');
      return Object.prototype.hasOwnProperty.call(memory, name) ? memory[name] : fallback;
    }
  }

  function lsSet(name, value) {
    memory[name] = value;
    try {
      localStorage.setItem(key(name), JSON.stringify(value));
      return true;
    } catch (e) {
      storageWarnings.push('localStorage write failed (quota?).');
      if (global.ElionLog) ElionLog.warn('localStorage write failed', e && e.name);
      return false;
    }
  }

  function lsRemove(name) {
    delete memory[name];
    try { localStorage.removeItem(key(name)); } catch (e) { /* ignore */ }
  }

  function openIdb() {
    return new Promise(function (resolve) {
      if (!global.indexedDB) {
        resolve(null);
        return;
      }
      var req;
      try {
        req = indexedDB.open(IDB_NAME, IDB_VERSION);
      } catch (e) {
        resolve(null);
        return;
      }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }

  function idbGet(name) {
    return new Promise(function (resolve) {
      if (!idb) return resolve(undefined);
      try {
        var tx = idb.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(name);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(undefined); };
      } catch (e) {
        resolve(undefined);
      }
    });
  }

  function idbSet(name, value) {
    return new Promise(function (resolve) {
      if (!idb) return resolve(false);
      try {
        var tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, name);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) {
        resolve(false);
      }
    });
  }

  function get(name, fallback) {
    if (Object.prototype.hasOwnProperty.call(memory, name)) return memory[name];
    return lsGet(name, fallback);
  }

  function set(name, value) {
    memory[name] = value;
    // Large blobs prefer IndexedDB — localStorage often caps near ~5MB on TVs.
    // Count is enough; stringifying thousands of channels on the TV thread is avoided.
    var large = name === 'channels' || name === 'epgCache';
    var manyChannels = name === 'channels' && Array.isArray(value) && value.length > 500;
    var manyProgrammes = name === 'epgCache' && value && value.programmes && Object.keys(value.programmes).length > 200;
    var tooBigForLs = !!(idb && large && (manyChannels || manyProgrammes));
    var ok = false;
    if (!tooBigForLs) {
      ok = lsSet(name, value);
    } else {
      // Avoid QuotaExceededError for multi‑MB channel catalogs
      try { localStorage.setItem(key(name + '_idb'), '1'); } catch (e) { /* ignore */ }
      if (global.ElionLog) ElionLog.info('Using IndexedDB for large key', { name: name });
    }
    if (large || !ok || tooBigForLs) {
      idbSet(name, value).then(function (wrote) {
        if (wrote && large) {
          try { localStorage.setItem(key(name + '_idb'), '1'); } catch (e) { /* ignore */ }
        } else if (large && !wrote && !ok) {
          storageWarnings.push('Could not persist large "' + name + '" to IndexedDB or localStorage.');
          if (global.ElionLog) ElionLog.warn('Persist failed for large key', name);
        }
      });
    }
    return ok || !!idb || tooBigForLs;
  }

  function remove(name) {
    lsRemove(name);
    try { localStorage.removeItem(key(name + '_idb')); } catch (e) { /* ignore */ }
    idbSet(name, null);
  }

  function defaultSettings() {
    return {
      language: 'en',
      theme: 'dark',
      textSize: 'medium',
      animations: true,
      showLogos: true,
      channelListLayout: 'detailed',
      channelSort: 'playlist',
      bufferSeconds: 3,
      showChannelNumbers: true,
      autoplayNext: false,
      rememberLastChannel: true,
      preferredAudio: '',
      preferredSubtitle: '',
      preferredQuality: 'auto',
      udpProxyEnabled: false,
      udpProxyAddress: '192.168.0.1',
      udpProxyPort: '4022',
      companionBaseUrl: '',
      operatorName: '',
      operatorId: '',
      defaultPlaylistId: '',
      activePlaylistId: '',
      parentalPinHash: '',
      parentalEnabled: false,
      lockedGroups: [],
      lockedChannels: [],
      themeAccent: '#168BFF',
      clockFormat: '24',
      epgOffsetMinutes: 0,
      epgSourceUrl: '',
      epgAutoRefresh: false,
      hiddenGroups: [],
      playerControlsPinned: false
    };
  }

  function sanitizeSettings(raw) {
    var base = defaultSettings();
    if (!raw || typeof raw !== 'object') return base;
    var next = Object.assign(base, raw);
    delete next.parentalPin; // never keep plaintext PIN
    if (typeof next.language !== 'string') next.language = 'en';
    if (next.theme !== 'light' && next.theme !== 'dark') next.theme = 'dark';
    if (!Array.isArray(next.lockedGroups)) next.lockedGroups = [];
    if (!Array.isArray(next.lockedChannels)) next.lockedChannels = [];
    if (!Array.isArray(next.hiddenGroups)) next.hiddenGroups = [];
    next.hiddenGroups = next.hiddenGroups.filter(function (name) { return typeof name === 'string'; });
    next.epgAutoRefresh = !!next.epgAutoRefresh;
    next.playerControlsPinned = !!next.playerControlsPinned;
    next.autoplayNext = !!next.autoplayNext;
    if (typeof next.epgSourceUrl !== 'string') next.epgSourceUrl = '';
    if (typeof next.preferredAudio !== 'string') next.preferredAudio = '';
    if (typeof next.preferredSubtitle !== 'string') next.preferredSubtitle = '';
    if (typeof next.preferredQuality !== 'string' || !next.preferredQuality) next.preferredQuality = 'auto';
    if (next.clockFormat !== '12' && next.clockFormat !== '24') next.clockFormat = '24';
    var epgOffset = parseInt(next.epgOffsetMinutes, 10);
    next.epgOffsetMinutes = isFinite(epgOffset) ? Math.max(-720, Math.min(720, epgOffset)) : 0;
    if (!next.themeAccent || /^#14b8a6$/i.test(String(next.themeAccent))) next.themeAccent = '#168BFF';
    return next;
  }

  function sanitizePlaylists(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (p) {
      return p && typeof p === 'object' && typeof p.id === 'string';
    }).map(function (p) {
      return {
        id: String(p.id),
        name: String(p.name || 'Playlist'),
        sourceType: String(p.sourceType || 'unknown'),
        url: typeof p.url === 'string' ? p.url : '',
        channelCount: Number(p.channelCount) || 0,
        updatedAt: Number(p.updatedAt) || Date.now(),
        createdAt: Number(p.createdAt) || Date.now(),
        epgUrl: typeof p.epgUrl === 'string' ? p.epgUrl : '',
        fileName: typeof p.fileName === 'string' ? p.fileName : ''
      };
    });
  }

  function sanitizeChannels(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (c) {
      return c && c.id && c.url && typeof c.url === 'string';
    });
  }

  function getSettings() { return sanitizeSettings(get('settings', {})); }
  function saveSettings(partial) {
    var next = sanitizeSettings(Object.assign(getSettings(), partial || {}));
    set('settings', next);
    return next;
  }

  function getPlaylists() { return sanitizePlaylists(get('playlists', [])); }
  function savePlaylists(list) {
    var clean = sanitizePlaylists(list);
    set('playlists', clean);
    // Lightweight meta backup — never used to auto-wipe; only for recovery diagnostics
    try {
      set('playlists_backup_meta', {
        savedAt: Date.now(),
        count: clean.length,
        ids: clean.map(function (p) { return p.id; })
      });
    } catch (e) { /* ignore */ }
  }
  function getChannels() { return sanitizeChannels(get('channels', [])); }
  function saveChannels(channels) {
    // Never persist empty over a large library due to a transient sanitize glitch
    var clean = sanitizeChannels(channels);
    var prev = sanitizeChannels(get('channels', []));
    if (!clean.length && prev.length > 50) {
      storageWarnings.push('Refused to overwrite a large channel library with an empty list.');
      if (global.ElionLog) ElionLog.warn('Blocked empty channels overwrite');
      return;
    }
    set('channels', clean);
  }
  function getFavorites() {
    var v = get('favorites', []);
    return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : [];
  }
  function saveFavorites(ids) { set('favorites', Array.isArray(ids) ? ids : []); }
  function getRecents() {
    var v = get('recents', []);
    return Array.isArray(v) ? v.slice(0, 50) : [];
  }
  function saveRecents(items) { set('recents', Array.isArray(items) ? items.slice(0, 50) : []); }
  function clearRecents() { set('recents', []); }
  function getEpgSources() {
    var v = get('epgSources', []);
    return Array.isArray(v) ? v : [];
  }
  function saveEpgSources(list) { set('epgSources', Array.isArray(list) ? list.slice(0, 10) : []); }
  function getEpgCache() {
    var v = get('epgCache', { updatedAt: 0, programmes: {}, channels: {} });
    if (!v || typeof v !== 'object') return { updatedAt: 0, programmes: {}, channels: {} };
    if (!v.programmes || typeof v.programmes !== 'object') v.programmes = {};
    if (!v.channels || typeof v.channels !== 'object') v.channels = {};
    return v;
  }
  function saveEpgCache(cache) { set('epgCache', cache || { updatedAt: 0, programmes: {}, channels: {} }); }

  function hydrateKey(name, fallback, sanitizer) {
    return idbGet(name).then(function (fromIdb) {
      var lsVal = lsGet(name, undefined);
      var chosen = fromIdb !== undefined && fromIdb !== null ? fromIdb : lsVal;
      if (chosen === undefined) chosen = fallback;
      if (sanitizer) chosen = sanitizer(chosen);
      memory[name] = chosen;
      return chosen;
    });
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = openIdb().then(function (db) {
      idb = db;
      return Promise.all([
        hydrateKey('settings', {}, sanitizeSettings),
        hydrateKey('playlists', [], sanitizePlaylists),
        hydrateKey('channels', [], sanitizeChannels),
        hydrateKey('favorites', [], function (v) { return Array.isArray(v) ? v : []; }),
        hydrateKey('recents', [], function (v) { return Array.isArray(v) ? v.slice(0, 50) : []; }),
        hydrateKey('epgSources', [], function (v) { return Array.isArray(v) ? v : []; }),
        hydrateKey('epgCache', { updatedAt: 0, programmes: {}, channels: {} }, function (v) {
          return v && typeof v === 'object' ? v : { updatedAt: 0, programmes: {}, channels: {} };
        }),
        hydrateKey('lastChannelId', null, function (v) { return v; })
      ]);
    }).then(function () {
      if (storageWarnings.length && global.ElionLog) {
        ElionLog.warn('Storage recovery', storageWarnings.slice());
      }
      if (global.ElionLog) ElionLog.info('Storage ready', { idb: !!idb, channels: (memory.channels || []).length });
      return true;
    }).catch(function (err) {
      if (global.ElionLog) ElionLog.error('Storage init failed', err && err.message);
      return false;
    });
    return readyPromise;
  }

  function getWarnings() { return storageWarnings.slice(); }

  function clearAllAppData() {
    ['settings', 'playlists', 'channels', 'favorites', 'recents', 'epgSources', 'epgCache', 'lastChannelId'].forEach(remove);
    memory = {};
  }

  global.ElionStorage = {
    ready: ready,
    get: get,
    set: set,
    remove: remove,
    defaultSettings: defaultSettings,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getPlaylists: getPlaylists,
    savePlaylists: savePlaylists,
    getChannels: getChannels,
    saveChannels: saveChannels,
    getFavorites: getFavorites,
    saveFavorites: saveFavorites,
    getRecents: getRecents,
    saveRecents: saveRecents,
    clearRecents: clearRecents,
    getEpgSources: getEpgSources,
    saveEpgSources: saveEpgSources,
    getEpgCache: getEpgCache,
    saveEpgCache: saveEpgCache,
    getWarnings: getWarnings,
    clearAllAppData: clearAllAppData
  };
})(window);
