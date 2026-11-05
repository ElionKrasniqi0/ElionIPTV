(function (global) {
  'use strict';

  function getIds() {
    return ElionStorage.getFavorites() || [];
  }

  function isFavorite(channelId) {
    return getIds().indexOf(channelId) !== -1;
  }

  function toggle(channelId) {
    var ids = getIds();
    var idx = ids.indexOf(channelId);
    if (idx === -1) ids.unshift(channelId);
    else ids.splice(idx, 1);
    ElionStorage.saveFavorites(ids);
    return idx === -1;
  }

  function add(channelId) {
    var ids = getIds();
    if (ids.indexOf(channelId) === -1) {
      ids.unshift(channelId);
      ElionStorage.saveFavorites(ids);
    }
  }

  function remove(channelId) {
    ElionStorage.saveFavorites(getIds().filter(function (id) { return id !== channelId; }));
  }

  function listChannels(opts) {
    opts = opts || {};
    var ids = getIds();
    var activeId = null;
    if (opts.allPlaylists) {
      activeId = null;
    } else {
      var st = ElionPlaylists.getState();
      activeId = st.activePlaylistId || null;
    }
    var out = [];
    ids.forEach(function (id) {
      var ch = ElionPlaylists.getChannelById(id);
      if (!ch) return;
      // Prefer favorites that belong to the active playlist when switching libraries
      if (activeId && ch.playlistId && ch.playlistId !== activeId) return;
      out.push(ch);
    });
    return out;
  }

  global.ElionFavorites = {
    getIds: getIds,
    isFavorite: isFavorite,
    toggle: toggle,
    add: add,
    remove: remove,
    listChannels: listChannels
  };
})(window);
