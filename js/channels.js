(function (global) {
  'use strict';

  /**
   * Channel browsing helpers: sort, filter, navigation list context.
   */

  var browseContext = {
    ids: [],
    source: 'all'
  };
  var numberIndex = null;
  var numberIndexKey = '';
  var NUMBER_ENTRY_MAX = 10;

  function reduceNumberEntry(digits, action) {
    digits = digits ? String(digits) : '';
    if (action === 'clear') return '';
    if (action === 'backspace' || action === 'delete') return digits.slice(0, -1);
    if (!/^[0-9]$/.test(action || '')) return digits;
    if (digits.length >= NUMBER_ENTRY_MAX) return digits;
    return digits + action;
  }

  function channelNumberIndex() {
    var state = ElionPlaylists.getState();
    var list = state.channels || [];
    var playlist = state.activePlaylist;
    var key = (state.activePlaylistId || '') + '|' + (playlist && playlist.updatedAt || 0) + '|' + list.length;
    if (numberIndex && numberIndexKey === key) return numberIndex;
    var byNumber = Object.create(null);
    var exact = Object.create(null);
    var extendable = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var ch = list[i];
      if (!ch) continue;
      var n = parseInt(ch.number, 10);
      if (!n || n < 1) n = i + 1;
      if (byNumber[n]) continue;
      byNumber[n] = ch;
      var text = String(n);
      exact[text] = ch;
      for (var p = 1; p < text.length; p++) extendable[text.slice(0, p)] = true;
    }
    numberIndex = { byNumber: byNumber, exact: exact, extendable: extendable };
    numberIndexKey = key;
    return numberIndex;
  }

  function findByNumber(number) {
    var n = parseInt(number, 10);
    if (!n || n < 1) return null;
    return channelNumberIndex().byNumber[n] || null;
  }

  /**
   * tune: these digits are a channel and no longer channel starts with them.
   * partial: more digits could still match a channel.
   * none: no channel can match these digits.
   */
  function classifyDigits(digits) {
    digits = String(digits || '');
    if (!/^[0-9]+$/.test(digits)) return { status: 'empty', channel: null, canExtend: false };
    var index = channelNumberIndex();
    var channel = index.exact[digits] || null;
    var canExtend = !!index.extendable[digits];
    var status = 'partial';
    if (!channel && !canExtend) status = 'none';
    else if (channel && !canExtend) status = 'tune';
    return { status: status, channel: channel, canExtend: canExtend };
  }

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
    indexOf: indexOf,
    findByNumber: findByNumber,
    reduceNumberEntry: reduceNumberEntry,
    classifyDigits: classifyDigits,
    NUMBER_ENTRY_MAX: NUMBER_ENTRY_MAX
  };
})(window);
