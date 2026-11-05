(function (global) {
  'use strict';

  /**
   * Channel browsing helpers: sort, filter, navigation list context.
   */

  var browseContext = {
    ids: [],
    source: 'all'
  };

  function setBrowseList(channels, source) {
    browseContext.ids = (channels || []).map(function (c) { return c.id; });
    browseContext.source = source || 'all';
  }

  function getBrowseList() {
    return browseContext.ids.map(function (id) {
      return ElionPlaylists.getChannelById(id);
    }).filter(Boolean);
  }

  function indexOf(channelId) {
    return browseContext.ids.indexOf(channelId);
  }

  function nextChannel(channelId) {
    var list = getBrowseList();
    if (!list.length) {
      list = ElionPlaylists.getState().channels; // active playlist only
    }
    if (!list.length) return null;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === channelId) { idx = i; break; }
    }
    if (idx === -1) return list[0];
    return list[(idx + 1) % list.length];
  }

  function prevChannel(channelId) {
    var list = getBrowseList();
    if (!list.length) {
      list = ElionPlaylists.getState().channels; // active playlist only
    }
    if (!list.length) return null;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === channelId) { idx = i; break; }
    }
    if (idx === -1) return list[0];
    return list[(idx - 1 + list.length) % list.length];
  }

  function sortChannels(channels, mode) {
    var list = (channels || []).slice();
    mode = mode || ElionStorage.getSettings().channelSort || 'playlist';
    if (mode === 'alpha') {
      list.sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
      });
    } else if (mode === 'category') {
      var rank = Object.create(null);
      var cats = [];
      try { cats = ElionPlaylists.getState().categories || []; } catch (e) { cats = []; }
      for (var i = 0; i < cats.length; i++) rank[cats[i].name] = i;
      list.sort(function (a, b) {
        var ga = rank[a.group || 'Uncategorized'];
        var gb = rank[b.group || 'Uncategorized'];
        if (ga == null) ga = 1000000;
        if (gb == null) gb = 1000000;
        if (ga !== gb) return ga - gb;
        return (a.number || 0) - (b.number || 0);
      });
    }
    // playlist = original order
    return list;
  }

  function filterByGroup(channels, group) {
    if (!group || group === 'all') return channels.slice();
    return channels.filter(function (c) { return (c.group || 'Uncategorized') === group; });
  }

  function getSortedAll(group) {
    var channels = ElionPlaylists.getState().channels;
    channels = filterByGroup(channels, group);
    return sortChannels(channels);
  }

  global.ElionChannels = {
    setBrowseList: setBrowseList,
    getBrowseList: getBrowseList,
    nextChannel: nextChannel,
    prevChannel: prevChannel,
    sortChannels: sortChannels,
    filterByGroup: filterByGroup,
    getSortedAll: getSortedAll,
    indexOf: indexOf
  };
})(window);
