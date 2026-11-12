(function (global) {
  'use strict';

  var playerUiTimer = null;
  var clockTimer = null;
  var epgRefreshTimer = null;

  function refreshEpgIfEnabled() {
    var settings = ElionStorage.getSettings();
    if (!settings.epgAutoRefresh) return;
    var url = settings.epgSourceUrl || '';
    if (!url || url.indexOf('http') !== 0) return;
    ElionEPG.loadFromUrl(url).catch(function () { /* keep the previous guide */ });
  }
  var booted = false;
  var bootFinished = false;
  var messages = [];
  var overlayReturn = null;
  var lastPlaybackError = '';
  var titles = {
    home: 'Home',
    live: 'Live TV',
    channels: 'All Channels',
    categories: 'Categories',
    category: 'Category',
    favorites: 'Favorites',
    more: 'More',
    recents: 'Recently Watched',
    search: 'Search',
    epg: 'TV Guide',
    playlists: 'My Playlists',
    settings: 'Settings',
    about: 'About'
  };

  /* More hub remains reachable from the side rail; primary destinations Back to Home. */
  var moreScreens = {
    more: true
  };

  function safe(fn, label) {
    try {
      return fn();
    } catch (e) {
      if (global.ElionLog) ElionLog.error(label || 'boot step failed', e && e.message);
      return null;
    }
  }

  function hideSplash() {
    var splash = document.getElementById('splash');
    if (!splash) return;
    try {
      splash.classList.add('fade');
      setTimeout(function () {
        try { splash.remove(); } catch (e) {
          if (splash.parentNode) splash.parentNode.removeChild(splash);
        }
      }, 500);
    } catch (e2) {
      try { splash.remove(); } catch (e3) { /* ignore */ }
    }
  }

  function finishBoot() {
    if (bootFinished) return;
    bootFinished = true;
    safe(function () { ElionScreens.navigate('home'); }, 'navigate home');
    setTimeout(function () {
      hideSplash();
      safe(function () {
        // Home hides the side rail — focus the hub tiles in #content.
        var scope = document.getElementById('content') || document.getElementById('app');
        ElionFocus.focusFirst(scope);
      }, 'initial focus');
    }, 400);
  }

  function boot() {
    if (booted) return;
    booted = true;

    safe(function () { ElionErrors.installGlobalHandlers(); }, 'error handlers');
    safe(function () { if (global.ElionNet) ElionNet.init(); }, 'network monitor');
    safe(function () { ElionUI.applyAppearance(); }, 'appearance');
    safe(function () { ElionFocus.init(document.getElementById('app')); }, 'focus');
    safe(function () { ElionPlayer.bindVideo(document.getElementById('playerVideo')); }, 'player bind');

    safe(wireNav, 'wire nav');
    safe(wireHeader, 'wire header');
    safe(wirePlayerChrome, 'wire player');
    safe(updateClock, 'clock');
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(function () {
      safe(updateClock, 'clock tick');
    }, 1000);
    if (epgRefreshTimer) clearInterval(epgRefreshTimer);
    epgRefreshTimer = setInterval(function () {
      safe(refreshEpgIfEnabled, 'epg refresh');
    }, 6 * 60 * 60 * 1000);
    setTimeout(function () {
      if (!bootFinished) {
        var status = document.getElementById('splashStatus');
        if (status) status.textContent = 'Opening ELION IPTV…';
        finishBoot();
      }
    }, 8000);

    safe(function () {
      ElionPlaylists.onChange(function () {
        try {
          updateChrome(ElionScreens.getCurrent().name);
          var cur = ElionScreens.getCurrent();
          if (cur.name === 'home' || cur.name === 'playlists') {
            ElionScreens.render();
          }
        } catch (e) {
          ElionLog.warn('playlist onChange UI failed', e && e.message);
        }
      });
    }, 'playlist listener');

    ElionLog.info('Booting ELION IPTV');

    var ready = ElionStorage.ready ? ElionStorage.ready() : Promise.resolve();
    ready.then(function () {
      safe(function () { ElionPlaylists.loadFromStorage(); }, 'load playlists');
      safe(function () { loadMessages(); renderMessages(); }, 'load messages');
      safe(function () {
        var warnings = ElionStorage.getWarnings();
        if (warnings.length) ElionUI.toast('Recovered from storage issue');
      }, 'storage warnings');
      finishBoot();
    }).catch(function (err) {
      ElionLog.error('Boot storage failed', err && err.message);
      // Keep going with whatever is in memory / localStorage — never wipe user data
      safe(function () { ElionPlaylists.loadFromStorage(); }, 'load playlists fallback');
      safe(function () { loadMessages(); renderMessages(); }, 'load messages fallback');
      finishBoot();
    });
  }

  function wireNav() {
    document.querySelectorAll('.nav-item[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        try {
          ElionScreens.navigate(btn.getAttribute('data-nav'));
        } catch (e) {
          ElionLog.error('nav failed', e && e.message);
          ElionUI.toast('Could not open that screen');
        }
      });
    });
  }

  function updateChrome(name) {
    try {
      var title = document.getElementById('screenTitle');
      if (title) title.textContent = titles[name] || 'ELION IPTV';

      document.querySelectorAll('.nav-item[data-nav]').forEach(function (btn) {
        var nav = btn.getAttribute('data-nav');
        var active = nav === name ||
          (name === 'category' && nav === 'categories') ||
          (nav === 'more' && !!moreScreens[name] && name !== 'home');
        btn.classList.toggle('active', active);
      });

      var count = document.getElementById('channelCountChip');
      if (count) {
        var n = ElionPlaylists.getState().channelCount;
        count.textContent = n + (n === 1 ? ' channel' : ' channels');
      }

      // Keep Home chrome in sync with screens.syncHomeChrome (body + app + shell).
      var isHomeHub = name === 'home';
      document.body.classList.toggle('screen-home', isHomeHub);
      var appEl = document.getElementById('app');
      if (appEl) appEl.classList.toggle('screen-home', isHomeHub);
      var shell = document.getElementById('shell');
      if (shell) shell.classList.toggle('screen-home', isHomeHub);
      var sideNav = document.querySelector('.side-nav');
      if (sideNav) {
        sideNav.setAttribute('aria-hidden', isHomeHub ? 'true' : 'false');
      }
    } catch (e) {
      ElionLog.warn('updateChrome failed', e && e.message);
    }
  }

  function updateClock() {
    var el = document.getElementById('clock');
    var dateEl = document.getElementById('headerDate');
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var settings = {};
    try { settings = ElionStorage.getSettings() || {}; } catch (e) { settings = {}; }
    var hours = d.getHours();
    var timeText;
    if (settings.clockFormat === '12') {
      var suffix = hours >= 12 ? 'PM' : 'AM';
      var h = hours % 12;
      if (h === 0) h = 12;
      timeText = h + ':' + pad(d.getMinutes()) + ' ' + suffix;
    } else {
      timeText = pad(hours) + ':' + pad(d.getMinutes());
    }
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var dateText = days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
    if (el && el.textContent !== timeText) el.textContent = timeText;
    if (dateEl && dateEl.textContent !== dateText) dateEl.textContent = dateText;
    updatePlayerClock(timeText);
  }

  function updatePlayerClock(wallTime) {
    var el = document.getElementById('playerClock');
    var screen = document.getElementById('playerScreen');
    if (!el || !screen || !screen.classList.contains('active')) return;
    var text = wallTime || '';
    try {
      var video = ElionPlayer.getVideo();
      if (video && isFinite(video.duration) && video.duration > 1 && video.duration < 86400) {
        text = ElionUtils.formatDuration(video.currentTime) + ' / ' + ElionUtils.formatDuration(video.duration);
      }
    } catch (e) { /* keep the wall clock */ }
    if (el.textContent !== text) el.textContent = text;
  }

  function setPlayerStatus(text) {
    var el = document.getElementById('playerStatus');
    if (el && el.textContent !== text) el.textContent = text;
  }

  function unreadCount() {
    var n = 0;
    for (var i = 0; i < messages.length; i++) {
      if (!messages[i].read) n++;
    }
    return n;
  }

  function persistMessages() {
    try { ElionStorage.set('messages', messages); } catch (e) { /* keep the in-memory list */ }
  }

  function loadMessages() {
    var saved = [];
    try { saved = ElionStorage.get('messages', []) || []; } catch (e) { saved = []; }
    if (!Array.isArray(saved)) saved = [];
    messages = [];
    for (var i = 0; i < saved.length && messages.length < 40; i++) {
      var item = saved[i];
      if (!item || !item.title) continue;
      messages.push({
        id: item.id || ElionUtils.uid('msg'),
        title: String(item.title),
        body: String(item.body || ''),
        when: String(item.when || ''),
        at: Number(item.at) || 0,
        read: !!item.read
      });
    }
  }

  function renderMessages() {
    var body = document.getElementById('messagesBody');
    var badge = document.getElementById('messageBadge');
    var unread = unreadCount();
    if (badge) {
      if (unread > 0) {
        badge.hidden = false;
        badge.textContent = String(unread);
      } else {
        badge.hidden = true;
        badge.textContent = '0';
      }
    }
    if (!body) return;
    if (!messages.length) {
      body.innerHTML = '<div class="empty-state"><h3>No messages</h3><p>Playlist refresh results and playback notices will appear here.</p></div>';
      return;
    }
    body.innerHTML = messages.map(function (m) {
      return '<article class="message-item' + (m.read ? '' : ' is-unread') + '"><h3>' + ElionUtils.escapeHtml(m.title) + '</h3><p>' + ElionUtils.escapeHtml(m.body) + '</p><time>' + ElionUtils.escapeHtml(m.when) + '</time></article>';
    }).join('');
  }

  function addMessage(title, body) {
    title = title || 'Notice';
    body = body || '';
    var now = Date.now();
    if (messages.length && messages[0].title === title && messages[0].body === body && (now - (messages[0].at || 0)) < 5000) {
      return messages[0];
    }
    messages.unshift({
      id: ElionUtils.uid('msg'),
      title: title,
      body: body,
      when: new Date().toLocaleString(),
      at: now,
      read: false
    });
    if (messages.length > 40) messages.length = 40;
    persistMessages();
    renderMessages();
    return messages[0];
  }

  function markAllMessagesRead() {
    var changed = false;
    for (var i = 0; i < messages.length; i++) {
      if (!messages[i].read) {
        messages[i].read = true;
        changed = true;
      }
    }
    if (changed) persistMessages();
    renderMessages();
  }

  function openOverlay(id) {
    var panel = document.getElementById(id);
    if (!panel) return false;
    overlayReturn = document.activeElement;
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
    if (id === 'messagesPanel' && panel.classList.contains('active')) markAllMessagesRead();
    setTimeout(function () {
      var btn = panel.querySelector('[data-focusable]');
      if (btn) ElionFocus.focusEl(btn);
    }, 30);
    return true;
  }

  function closeOverlay(id) {
    var panel = document.getElementById(id);
    if (!panel || !panel.classList.contains('active')) return false;
    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
    var back = overlayReturn;
    overlayReturn = null;
    setTimeout(function () {
      if (back && ElionFocus.isFocusable && ElionFocus.isFocusable(back)) ElionFocus.focusEl(back);
      else ElionFocus.focusFirst(document.getElementById('content'));
    }, 30);
    return true;
  }

  function anyOverlayOpen() {
    var messagesPanel = document.getElementById('messagesPanel');
    var helpPanel = document.getElementById('helpPanel');
    return (messagesPanel && messagesPanel.classList.contains('active')) ||
      (helpPanel && helpPanel.classList.contains('active'));
  }

  function exitApplication() {
    ElionUI.showModal({
      title: 'Exit',
      message: 'Do you really want to exit ELION IPTV?',
      okText: 'YES',
      cancelText: 'NO'
    }).then(function (result) {
      if (!result || !result.ok) return;
      try {
        if (window.webOS && typeof webOS.platformBack === 'function') {
          webOS.platformBack();
          return;
        }
      } catch (e) { /* try the next supported exit */ }
      try {
        if (window.PalmSystem && typeof PalmSystem.exit === 'function') {
          PalmSystem.exit();
          return;
        }
      } catch (e2) { /* explain below */ }
      ElionUI.toast('This device did not close the app. Use the Home button on the remote to leave ELION IPTV.');
    });
  }

  function wireHeader() {
    function bind(id, fn) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', function () {
        try { fn(); } catch (err) {
          ElionLog.warn('header action failed', id, err && err.message);
        }
      });
    }
    bind('btnReload', function () {
      if (ElionScreens.reloadActivePlaylist) ElionScreens.reloadActivePlaylist();
    });
    bind('btnMessages', function () { openOverlay('messagesPanel'); });
    bind('btnCloseMessages', function () { closeOverlay('messagesPanel'); });
    bind('btnSettings', function () { ElionScreens.navigate('settings'); });
    bind('btnHelp', function () { openOverlay('helpPanel'); });
    bind('btnCloseHelp', function () { closeOverlay('helpPanel'); });
    bind('btnExit', exitApplication);
    renderMessages();
  }

  var lastPlayedChannelId = null;
  var zapLockedUntil = 0;
  var zapOsdTimer = null;
  var channelListOpen = false;
  var categoryListOpen = false;
  var channelListRestoreFocus = null;
  var ZAP_COOLDOWN_MS = 420;
  var ZAP_OSD_MS = 2800;

  function ensureZapBrowseContext(channel) {
    try {
      var browse = ElionChannels.getBrowseList();
      var found = false;
      for (var i = 0; i < browse.length; i++) {
        if (browse[i] && browse[i].id === channel.id) { found = true; break; }
      }
      if (!found) {
        ElionChannels.setBrowseList(ElionChannels.getSortedAll(), 'playlist');
      }
    } catch (e) {
      ElionLog.warn('ensureZapBrowseContext failed', e && e.message);
    }
  }

  function hideChannelZapOsd() {
    var osd = document.getElementById('channelZapOsd');
    if (!osd) return;
    osd.classList.remove('active');
    osd.setAttribute('aria-hidden', 'true');
  }

  function showChannelZapOsd(channel, statusText) {
    if (!channel) return;
    var osd = document.getElementById('channelZapOsd');
    if (!osd) return;
    try {
      var logo = document.getElementById('channelZapLogo');
      var num = document.getElementById('channelZapNumber');
      var name = document.getElementById('channelZapName');
      var prog = document.getElementById('channelZapProgram');
      var st = document.getElementById('channelZapStatus');
      if (logo) logo.innerHTML = ElionUI.channelLogo(channel, 72, { eager: true });
      if (num) {
        var n = channel.number != null && channel.number !== '' ? String(channel.number) : '';
        num.textContent = n ? ('CH ' + n) : '';
        num.style.display = n ? '' : 'none';
      }
      if (name) name.textContent = channel.name || 'Channel';
      var nn = { now: null };
      try { nn = ElionEPG.getNowNext(channel); } catch (e1) { /* ignore */ }
      if (prog) {
        prog.textContent = nn.now ? ('Now: ' + nn.now.title) : (channel.group || '');
      }
      if (st) st.textContent = statusText || 'Loading…';
      osd.classList.add('active');
      osd.setAttribute('aria-hidden', 'false');
      clearTimeout(zapOsdTimer);
      zapOsdTimer = setTimeout(hideChannelZapOsd, ZAP_OSD_MS);
    } catch (e) {
      ElionLog.warn('showChannelZapOsd failed', e && e.message);
    }
  }

  function isPlayerChannelListOpen() {
    return !!channelListOpen;
  }

  function isPlayerCategoryOpen() {
    return !!categoryListOpen;
  }

  function closePlayerCategoryList() {
    var list = document.getElementById('playerCategoryList');
    categoryListOpen = false;
    if (list) {
      list.classList.remove('active');
      list.setAttribute('aria-hidden', 'true');
    }
  }

  function closePlayerChannelList() {
    var list = document.getElementById('playerChannelList');
    var screen = document.getElementById('playerScreen');
    var wasOpen = channelListOpen;
    channelListOpen = false;
    if (list) {
      list.classList.remove('active');
      list.setAttribute('aria-hidden', 'true');
    }
    if (screen) screen.classList.remove('channel-list-open');
    if (!wasOpen) {
      channelListRestoreFocus = null;
      return;
    }
    if (channelListRestoreFocus && ElionFocus.isFocusable(channelListRestoreFocus)) {
      try { ElionFocus.focusEl(channelListRestoreFocus); } catch (e) { /* ignore */ }
    } else {
      try { ElionFocus.focusEl(document.getElementById('btnChannelList') || document.getElementById('btnPlayPause')); } catch (e2) { /* ignore */ }
    }
    channelListRestoreFocus = null;
  }

  function openPlayerCategoryList() {
    var list = document.getElementById('playerCategoryList');
    var body = document.getElementById('playerCategoryListBody');
    if (!list || !body) return;
    closePlayerChannelList();
    var state = ElionPlaylists.getState();
    var hidden = {};
    try {
      (ElionStorage.getSettings().hiddenGroups || []).forEach(function (name) { hidden[name] = true; });
    } catch (eHide) { hidden = {}; }
    var cats = (state.categories || []).filter(function (c) { return c && !hidden[c.name]; });
    var html = '<button class="player-channel-list-item" data-focusable data-action="player-category" data-group="" type="button"><span class="pcl-name">All channels</span></button>';
    html += cats.map(function (c) {
      var label = c.name || 'Uncategorized';
      return '<button class="player-channel-list-item" data-focusable data-action="player-category" data-group="' + ElionUtils.escapeHtml(c.name) + '" type="button"><span class="pcl-name">' + ElionUtils.escapeHtml(label) + ' (' + c.count + ')</span></button>';
    }).join('');
    body.innerHTML = html || '<div class="empty-state"><p>No categories in this playlist.</p></div>';
    body.querySelectorAll('[data-action="player-category"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var group = btn.getAttribute('data-group');
        var channels = group
          ? ElionChannels.sortChannels(ElionPlaylists.getChannelsByGroup(group), 'playlist')
          : ElionChannels.getSortedAll();
        if (channels.length) ElionChannels.setBrowseList(channels, group ? ('category:' + group) : 'playlist');
        closePlayerCategoryList();
        openPlayerChannelList();
      });
    });
    categoryListOpen = true;
    list.classList.add('active');
    list.setAttribute('aria-hidden', 'false');
    bumpPlayerUi();
    setTimeout(function () {
      var first = body.querySelector('.player-channel-list-item') || document.getElementById('btnCloseCategories');
      if (first) ElionFocus.focusEl(first);
    }, 40);
  }

  function openPlayerChannelList() {
    var list = document.getElementById('playerChannelList');
    var body = document.getElementById('playerChannelListBody');
    var screen = document.getElementById('playerScreen');
    if (!list || !body) return;
    try {
      channelListRestoreFocus = document.activeElement;
      if (ElionFocus.isFocusable && ElionFocus.isFocusable(channelListRestoreFocus)) {
        ElionFocus.remember(channelListRestoreFocus);
      }
      var channels = ElionChannels.getBrowseList();
      if (!channels.length) channels = ElionChannels.getSortedAll();
      var current = ElionPlayer.getCurrentChannel();
      var currentId = current && current.id;
      var listStart = 0;
      if (channels.length > 120) {
        var at = 0;
        for (var ci = 0; ci < channels.length; ci++) {
          if (channels[ci] && channels[ci].id === currentId) { at = ci; break; }
        }
        listStart = Math.max(0, at - 40);
        if (listStart + 120 > channels.length) listStart = Math.max(0, channels.length - 120);
        channels = channels.slice(listStart, listStart + 120);
      }
      body.innerHTML = channels.map(function (ch, idx) {
        var active = currentId && ch.id === currentId ? ' is-current' : '';
        var num = ch.number != null && ch.number !== '' ? ('<span class="pcl-num">' + ElionUtils.escapeHtml(String(ch.number)) + '</span>') : '<span class="pcl-num">' + (listStart + idx + 1) + '</span>';
        return (
          '<button class="player-channel-list-item' + active + '" data-focusable data-action="play-from-list" data-id="' + ElionUtils.escapeHtml(ch.id) + '" type="button">' +
            num +
            ElionUI.channelLogo(ch, 48, { eager: idx < 20 }) +
            '<span class="pcl-name">' + ElionUtils.escapeHtml(ch.name || 'Channel') + '</span>' +
          '</button>'
        );
      }).join('') || '<div class="empty-state"><p>No channels in this list.</p></div>';

      body.querySelectorAll('[data-action="play-from-list"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var ch = ElionPlaylists.getChannelById(btn.getAttribute('data-id'));
          if (!ch) return;
          closePlayerChannelList();
          lastPlayedChannelId = ch.id;
          showChannelZapOsd(ch, 'Loading…');
          updatePlayerHeader(ch);
          var buf = document.getElementById('playerBuffering');
          if (buf) buf.classList.add('active');
          ElionPlayer.playChannel(ch).then(function () {
            showChannelZapOsd(ch, 'Playing');
          }).catch(function () {
            showChannelZapOsd(ch, 'Unable to play');
          });
        });
      });

      channelListOpen = true;
      list.classList.add('active');
      list.setAttribute('aria-hidden', 'false');
      if (screen) screen.classList.add('channel-list-open');
      bumpPlayerUi();
      setTimeout(function () {
        var curBtn = body.querySelector('.player-channel-list-item.is-current') || body.querySelector('.player-channel-list-item');
        if (curBtn) ElionFocus.focusEl(curBtn);
        else ElionFocus.focusEl(document.getElementById('btnCloseChannelList'));
      }, 40);
    } catch (e) {
      ElionLog.warn('openPlayerChannelList failed', e && e.message);
    }
  }

  function openPlayer(channel) {
    numberEntryClear();
    openPlayerNow(channel);
  }

  function openPlayerNow(channel) {
    try {
      if (!channel) {
        ElionUI.toast('No channel selected');
        return;
      }
      lastPlayedChannelId = channel.id || null;
      ensureZapBrowseContext(channel);
      closePlayerChannelList();
      closePlayerCategoryList();
      hideChannelZapOsd();
      try {
        if (document.activeElement) ElionFocus.remember(document.activeElement);
      } catch (remErr) { /* ignore */ }
      var screen = document.getElementById('playerScreen');
      if (!screen) return;
      screen.classList.add('active', 'show-ui');
      updatePlayerHeader(channel);
      var errBox = document.getElementById('playerErrorBox');
      if (errBox) errBox.style.display = 'none';
      var buf = document.getElementById('playerBuffering');
      if (buf) buf.classList.add('active');
      var info = document.getElementById('playerInfo');
      if (info) info.textContent = '';

      ElionPlayer.playChannel(channel).catch(function () { /* status via onChange */ });

      bumpPlayerUi();
      setTimeout(function () {
        try { ElionFocus.focusEl(document.getElementById('btnPlayPause')); } catch (e) { /* ignore */ }
      }, 50);
    } catch (e) {
      ElionLog.error('openPlayer failed', e && e.message);
      ElionUI.toast('Could not open player');
    }
  }

  function updatePlayerHeader(channel) {
    if (!channel) return;
    try {
      var title = document.getElementById('playerTitle');
      if (title) title.textContent = channel.name || 'Channel';
      var nn = { now: null, next: null };
      try { nn = ElionEPG.getNowNext(channel); } catch (e) { /* EPG must not break player */ }
      var sub = channel.group || '';
      if (nn.now) sub += (sub ? ' · ' : '') + 'Now: ' + nn.now.title;
      var subEl = document.getElementById('playerSub');
      if (subEl) subEl.textContent = sub;
      var logoWrap = document.getElementById('playerLogo');
      if (logoWrap) {
        logoWrap.innerHTML = ElionUI.channelLogo(channel, 72, { eager: true });
      }
      updateFavButton(channel);
    } catch (e) {
      ElionLog.warn('updatePlayerHeader failed', e && e.message);
    }
  }

  function setCtrlContent(btn, iconText, labelText, titleText) {
    if (!btn) return;
    var icon = btn.querySelector('.ctrl-icon');
    var label = null;
    if (btn.parentNode && btn.parentNode.querySelector) {
      label = btn.parentNode.querySelector('.ctrl-label');
    }
    if (!label) label = btn.querySelector('.ctrl-label');
    if (icon) icon.textContent = iconText;
    if (label) label.textContent = labelText;
    if (titleText) {
      btn.setAttribute('title', titleText);
      btn.setAttribute('aria-label', labelText || titleText);
    }
  }

  function updatePlayPauseButton(paused) {
    var btn = document.getElementById('btnPlayPause');
    if (!btn) return;
    var label = btn.parentNode && btn.parentNode.querySelector ? btn.parentNode.querySelector('.ctrl-label') : null;
    if (paused) {
      btn.classList.add('is-paused');
      btn.setAttribute('title', 'Play');
      btn.setAttribute('aria-label', 'Play');
      if (label) label.textContent = 'Play';
    } else {
      btn.classList.remove('is-paused');
      btn.setAttribute('title', 'Pause');
      btn.setAttribute('aria-label', 'Pause');
      if (label) label.textContent = 'Pause';
    }
  }

  function updateFavButton(channel) {
    var favBtn = document.getElementById('btnFav');
    if (!favBtn || !channel) return;
    var on = ElionFavorites.isFavorite(channel.id);
    setCtrlContent(favBtn, on ? '★' : '☆', on ? 'Favorited' : 'Favorite', on ? 'Remove from favorites' : 'Add to favorites');
    favBtn.classList.toggle('is-fav-on', on);
  }

  var entryDigits = '';
  var entryRejected = false;
  var entryHideTimer = null;
  var NUMBER_HIDE_MS = 1800;
  var LIVE_NUMBER_SCREENS = { live: 1, categories: 1, category: 1, channels: 1, epg: 1 };

  function clearEntryTimers() {
    if (entryHideTimer) {
      clearTimeout(entryHideTimer);
      entryHideTimer = null;
    }
  }

  function numberEntryAllowed() {
    var active = document.activeElement;
    if (ElionFocus.isTextEntryField && ElionFocus.isTextEntryField(active)) return false;
    if (ElionFocus.isKeyboardVisible && ElionFocus.isKeyboardVisible()) return false;
    var blockIds = ['modalHost', 'helpPanel', 'messagesPanel'];
    for (var i = 0; i < blockIds.length; i++) {
      var el = document.getElementById(blockIds[i]);
      if (el && el.classList.contains('active')) return false;
    }
    if (isPlayerActive()) return true;
    try {
      var cur = ElionScreens.getCurrent();
      return !!(cur && LIVE_NUMBER_SCREENS[cur.name]);
    } catch (e) {
      return false;
    }
  }

  function hideNumberOverlay() {
    var box = document.getElementById('channelNumberEntry');
    if (!box) return;
    box.classList.remove('active', 'is-missing');
    box.setAttribute('aria-hidden', 'true');
  }

  function paintNumberOverlay(digits, name, detail, missing) {
    var box = document.getElementById('channelNumberEntry');
    if (!box) return;
    var digitsEl = document.getElementById('channelNumberDigits');
    var nameEl = document.getElementById('channelNumberName');
    var detailEl = document.getElementById('channelNumberDetail');
    if (digitsEl) digitsEl.textContent = digits || '';
    if (nameEl) nameEl.textContent = name || '';
    if (detailEl) detailEl.textContent = detail || '';
    box.classList.toggle('is-missing', !!missing);
    box.classList.add('active');
    box.setAttribute('aria-hidden', 'false');
  }

  function previewNumberEntry(digits) {
    var result = ElionChannels.classifyDigits(digits);
    if (result.channel) paintNumberOverlay(digits, result.channel.name || 'Channel', result.channel.group || '', false);
    else paintNumberOverlay(digits, '', '', false);
  }

  function scheduleNumberHide() {
    if (entryHideTimer) clearTimeout(entryHideTimer);
    entryHideTimer = setTimeout(function () {
      entryHideTimer = null;
      if (!entryDigits) hideNumberOverlay();
    }, NUMBER_HIDE_MS);
  }

  function showNumberMissing(raw) {
    paintNumberOverlay(raw, '', 'Channel Not Found', true);
    scheduleNumberHide();
  }

  function tuneNumberChannel(ch) {
    paintNumberOverlay(String(ch.number || ''), ch.name || 'Channel', ch.group || '', false);
    if (isPlayerActive()) {
      if (categoryListOpen) closePlayerCategoryList();
      if (channelListOpen) closePlayerChannelList();
      lastPlayedChannelId = ch.id;
      ensureZapBrowseContext(ch);
      updatePlayerHeader(ch);
      showChannelZapOsd(ch, 'Loading…');
      var buf = document.getElementById('playerBuffering');
      if (buf) buf.classList.add('active');
      ElionPlayer.playChannel(ch).then(function (ok) {
        showChannelZapOsd(ch, ok === false ? 'Unable to play' : 'Playing');
        scheduleNumberHide();
      }).catch(function () {
        showChannelZapOsd(ch, 'Unable to play');
        scheduleNumberHide();
      });
      return;
    }
    openPlayerNow(ch);
    scheduleNumberHide();
  }

  function finishNumberEntry(raw) {
    var result = ElionChannels.classifyDigits(raw);
    if (result.status === 'tune' && result.channel) {
      entryDigits = '';
      entryRejected = false;
      tuneNumberChannel(result.channel);
      return 'tune';
    }
    if (result.status === 'none') {
      entryDigits = '';
      entryRejected = true;
      showNumberMissing(raw);
      return 'none';
    }
    entryDigits = raw;
    entryRejected = false;
    previewNumberEntry(raw);
    return 'partial';
  }

  function numberEntryDigit(digit) {
    if (!numberEntryAllowed()) return false;
    if (entryHideTimer) {
      clearTimeout(entryHideTimer);
      entryHideTimer = null;
    }
    var base = entryRejected ? '' : entryDigits;
    var next = ElionChannels.reduceNumberEntry(base, String(digit));
    if (next === base) return false;
    finishNumberEntry(next);
    return true;
  }

  function numberEntryConfirm() {
    if (entryRejected || !entryDigits) return false;
    var result = ElionChannels.classifyDigits(entryDigits);
    if (!result.channel) return false;
    entryDigits = '';
    entryRejected = false;
    tuneNumberChannel(result.channel);
    return true;
  }

  function numberEntryEdit() {
    if (entryRejected) {
      entryRejected = false;
      entryDigits = '';
      clearEntryTimers();
      hideNumberOverlay();
      return true;
    }
    if (!entryDigits) return false;
    entryDigits = ElionChannels.reduceNumberEntry(entryDigits, 'backspace');
    if (!entryDigits) {
      clearEntryTimers();
      hideNumberOverlay();
      return true;
    }
    previewNumberEntry(entryDigits);
    return true;
  }

  function numberEntryClear() {
    entryDigits = '';
    entryRejected = false;
    clearEntryTimers();
    hideNumberOverlay();
    return true;
  }

  function numberEntryPending() {
    return !!entryDigits || entryRejected;
  }

  function closePlayer() {
    numberEntryClear();
    var restoreId = lastPlayedChannelId;
    try {
      var cur = ElionPlayer.getCurrentChannel();
      if (cur && cur.id) restoreId = cur.id;
    } catch (e0) { /* ignore */ }
    closePlayerChannelList();
    closePlayerCategoryList();
    hideChannelZapOsd();
    try {
      ElionPlayer.stop();
    } catch (e) {
      ElionLog.warn('player stop failed', e && e.message);
    }
    var screen = document.getElementById('playerScreen');
    if (screen) screen.classList.remove('active', 'show-ui', 'channel-list-open');
    try {
      ElionScreens.render({ focusChannelId: restoreId });
    } catch (e2) {
      try { ElionScreens.render(); } catch (e3) { /* ignore */ }
    }
  }

  function bumpPlayerUi() {
    var screen = document.getElementById('playerScreen');
    if (!screen) return;
    screen.classList.add('show-ui');
    clearTimeout(playerUiTimer);
    try {
      if (ElionStorage.getSettings().playerControlsPinned) return;
    } catch (ePin) { /* keep the auto-hide timer */ }
    playerUiTimer = setTimeout(function () {
      try {
        if (ElionPlayer.getStatus().playing && !ElionPlayer.getStatus().error) {
          screen.classList.remove('show-ui');
        }
      } catch (e) { /* ignore */ }
    }, 5000);
  }

  function isPlayerUiVisible() {
    var screen = document.getElementById('playerScreen');
    return !!(screen && screen.classList.contains('active') && screen.classList.contains('show-ui'));
  }

  function isPlayerActive() {
    var screen = document.getElementById('playerScreen');
    return !!(screen && screen.classList.contains('active'));
  }

  /**
   * Up/Down while watching changes channel (delta +1 next, -1 previous).
   * One physical press → one change; key-repeat / rapid presses are ignored.
   * Works with the control bar visible or hidden.
   */
  function playableChannel(ch) {
    if (!ch || !ch.url) return false;
    var url = String(ch.url).trim();
    if (!url || /^(javascript|data):/i.test(url)) return false;
    return true;
  }

  function resolveZapTarget(current, delta) {
    var startId = current && current.id;
    var cursor = startId;
    var seen = {};
    var steps = 0;
    var maxSteps = 80;
    try {
      var listed = ElionChannels.getBrowseList().length;
      if (listed > maxSteps) maxSteps = Math.min(listed, 400);
    } catch (eMax) { /* keep the default cap */ }
    while (steps < maxSteps) {
      var target = null;
      try {
        target = delta < 0
          ? ElionChannels.prevChannel(cursor)
          : ElionChannels.nextChannel(cursor);
      } catch (eStep) {
        return null;
      }
      if (!target || !target.id || seen[target.id]) return null;
      seen[target.id] = true;
      if (startId && target.id === startId) return target;
      if (playableChannel(target)) return target;
      cursor = target.id;
      steps++;
    }
    return null;
  }

  /** CH+ / CH−. Closes an open list, then uses the same step as Up and Down. */
  function playerChannelKey(delta) {
    if (!isPlayerActive()) return Promise.resolve(false);
    if (categoryListOpen) closePlayerCategoryList();
    if (channelListOpen) closePlayerChannelList();
    return playerChannelStep(delta);
  }

  function playerChannelStep(delta) {
    var now = Date.now();
    if (now < zapLockedUntil) return Promise.resolve(false);
    if (channelListOpen) return Promise.resolve(false);
    if (!isPlayerActive()) return Promise.resolve(false);

    zapLockedUntil = now + ZAP_COOLDOWN_MS;

    var current = null;
    try { current = ElionPlayer.getCurrentChannel(); } catch (e0) { /* ignore */ }
    if (current) ensureZapBrowseContext(current);

    var target = null;
    try {
      target = resolveZapTarget(current, delta);
    } catch (e1) {
      ElionLog.warn('channel step resolve failed', e1 && e1.message);
    }

    if (!target) {
      ElionUI.toast(delta < 0 ? 'No previous channel' : 'No next channel');
      return Promise.resolve(false);
    }

    // Single-channel list: still "predictable" — stay on same channel, show OSD.
    if (current && target.id === current.id) {
      showChannelZapOsd(target, 'Only channel in list');
      return Promise.resolve(true);
    }

    lastPlayedChannelId = target.id;
    showChannelZapOsd(target, 'Loading…');
    updatePlayerHeader(target);
    var buf = document.getElementById('playerBuffering');
    if (buf) buf.classList.add('active');

    // Play the resolved target from the active browse/playlist order.
    return ElionPlayer.playChannel(target).then(function (ok) {
      showChannelZapOsd(target, ok === false ? 'Unable to play' : 'Playing');
      return true;
    }).catch(function () {
      showChannelZapOsd(target, 'Unable to play');
      return false;
    });
  }

  /** Magic Remote OK while watching: show controls if hidden. */
  function playerOkAction() {
    if (!isPlayerActive()) return false;
    if (!isPlayerUiVisible()) {
      bumpPlayerUi();
      try { ElionFocus.focusEl(document.getElementById('btnPlayPause')); } catch (e) { /* ignore */ }
      return true;
    }
    return false;
  }

  function wirePlayerChrome() {
    ElionPlayer.onChange(function (st) {
      try {
        var buf = document.getElementById('playerBuffering');
        var errBox = document.getElementById('playerErrorBox');
        var errTitle = document.getElementById('playerErrorTitle');
        var errText = document.getElementById('playerErrorText');
        if (buf) {
          // Overlay only for intentional channel load / recovery — not mid-stream waits.
          var showLoadOverlay = !st.error && !!(st.loading || st.recovering);
          buf.classList.toggle('active', showLoadOverlay);
          buf.textContent = (st.recovering && st.recoveryDetail) ? st.recoveryDetail : 'Loading channel…';
        }
        if (st.error) setPlayerStatus(st.errorTitle || 'Playback error');
        else if (st.recovering) setPlayerStatus(st.errorTitle || 'Reconnecting');
        else if (st.loading) setPlayerStatus('Loading');
        else if (st.buffering && st.playing) setPlayerStatus('Buffering');
        else if (st.buffering) setPlayerStatus('Loading');
        else if (st.paused) setPlayerStatus('Paused');
        else if (st.playing) setPlayerStatus('Playing');
        updatePlayerClock();
        if (errBox) {
          if (st.error) {
            errBox.style.display = 'block';
            if (errTitle) errTitle.textContent = st.errorTitle || 'Playback error';
            if (errText) errText.textContent = st.error;
            if (st.error !== lastPlaybackError) {
              lastPlaybackError = st.error;
              addMessage('Playback error', st.error);
            }
          } else {
            errBox.style.display = 'none';
            lastPlaybackError = '';
          }
        }
        updatePlayPauseButton(!!st.paused);
        if (st.channel) updatePlayerHeader(st.channel);
        var info = document.getElementById('playerInfo');
        if (info && st.streamInfo) {
          var bits = [];
          var res = st.streamInfo.resolution || '';
          if (/^\d+x\d+$/i.test(res)) {
            var h = parseInt(String(res).split('x')[1], 10);
            bits.push(h >= 2000 ? '4K' : (h >= 700 ? 'HD' : 'SD'));
          } else if (res) {
            bits.push(res);
          }
          var audioN = (st.streamInfo.tracks || []).filter(function (t) { return t.type === 'audio'; }).length;
          var subN = (st.streamInfo.tracks || []).filter(function (t) { return t.type === 'text'; }).length;
          if (audioN > 1) bits.push('Multiple audio');
          if (subN) bits.push('Subtitles available');
          info.textContent = bits.join(' · ');
        }
      } catch (e) {
        ElionLog.warn('player UI sync failed', e && e.message);
      }
    });

    function bind(id, fn) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', function () {
        try { fn(); } catch (e) {
          ElionLog.warn('player control failed', id, e && e.message);
        }
      });
    }

    bind('btnPlayPause', function () { ElionPlayer.togglePlayPause(); bumpPlayerUi(); });
    bind('btnPrev', function () { playerChannelStep(-1); });
    bind('btnNext', function () { playerChannelStep(1); });
    bind('btnChannelList', function () {
      closePlayerCategoryList();
      if (channelListOpen) closePlayerChannelList();
      else openPlayerChannelList();
    });
    bind('btnCategories', function () {
      if (categoryListOpen) closePlayerCategoryList();
      else openPlayerCategoryList();
    });
    bind('btnCloseChannelList', closePlayerChannelList);
    bind('btnCloseCategories', closePlayerCategoryList);
    bind('btnFav', function () {
      var ch = ElionPlayer.getCurrentChannel();
      if (!ch) return;
      var on = ElionFavorites.toggle(ch.id);
      updateFavButton(ch);
      ElionUI.toast(on ? 'Added to favorites' : 'Removed from favorites');
      bumpPlayerUi();
    });
    bind('btnMute', function () {
      var video = ElionPlayer.getVideo();
      if (!video) return;
      video.muted = !video.muted;
      var btn = document.getElementById('btnMute');
      var label = btn && btn.parentNode ? btn.parentNode.querySelector('.ctrl-label') : null;
      if (btn) {
        btn.classList.toggle('is-muted', video.muted);
        btn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
        btn.setAttribute('title', video.muted ? 'Unmute' : 'Mute');
      }
      if (label) label.textContent = video.muted ? 'Unmute' : 'Mute';
      bumpPlayerUi();
    });
    bind('btnFullscreen', function () {
      var screen = document.getElementById('playerScreen');
      if (!screen) return;
      var active = document.fullscreenElement || document.webkitFullscreenElement;
      if (active) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
        return;
      }
      var req = screen.requestFullscreen || screen.webkitRequestFullscreen;
      if (!req) {
        ElionUI.toast('The player already fills the TV screen.');
        return;
      }
      try {
        var pending = req.call(screen);
        if (pending && pending.catch) {
          pending.catch(function () {
            ElionUI.toast('The player already fills the TV screen.');
          });
        }
      } catch (e) {
        ElionUI.toast('The player already fills the TV screen.');
      }
      bumpPlayerUi();
    });
    bind('btnErrorRetry', function () { ElionPlayer.retry().catch(function () {}); bumpPlayerUi(); });
    bind('btnErrorNext', function () { playerChannelStep(1); });
    bind('btnErrorBack', closePlayer);

    var screen = document.getElementById('playerScreen');
    if (screen) {
      var lastMove = 0;
      screen.addEventListener('mousemove', function () {
        var now = Date.now();
        if (now - lastMove < 400) return;
        lastMove = now;
        bumpPlayerUi();
      });
      screen.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        bumpPlayerUi();
      });
    }
  }

  function handleBack() {
    try {
      if (closeOverlay('helpPanel')) return;
      if (closeOverlay('messagesPanel')) return;

      var modal = document.getElementById('modalHost');
      if (modal && modal.classList.contains('active')) {
        var cancel = document.getElementById('modalCancel') || document.getElementById('modalOk');
        if (cancel) cancel.click();
        return;
      }

      if (numberEntryPending()) {
        numberEntryClear();
        return;
      }

      var player = document.getElementById('playerScreen');
      if (player && player.classList.contains('active')) {
        // In-player channel list: first Back closes the list, second exits player.
        if (categoryListOpen) {
          closePlayerCategoryList();
          return;
        }
        if (channelListOpen) {
          closePlayerChannelList();
          return;
        }
        // One Back press always returns to the channel list (OK still shows controls).
        closePlayer();
        return;
      }

      var cur = ElionScreens.getCurrent();
      if (!cur || cur.name === 'home') return;
      if (ElionScreens.goBack) ElionScreens.goBack();
      else ElionScreens.navigate('home');
    } catch (e) {
      ElionLog.warn('handleBack failed', e && e.message);
      try { ElionScreens.navigate('home'); } catch (e2) { /* ignore */ }
    }
  }

  global.ElionApp = {
    openPlayer: openPlayer,
    closePlayer: closePlayer,
    handleBack: handleBack,
    updateChrome: updateChrome,
    updateClock: updateClock,
    addMessage: addMessage,
    playerChannelStep: playerChannelStep,
    numberEntryDigit: numberEntryDigit,
    numberEntryEdit: numberEntryEdit,
    numberEntryConfirm: numberEntryConfirm,
    numberEntryClear: numberEntryClear,
    numberEntryAllowed: numberEntryAllowed,
    numberEntryPending: numberEntryPending,
    playerChannelKey: playerChannelKey,
    playerOkAction: playerOkAction,
    isPlayerActive: isPlayerActive,
    isPlayerUiVisible: isPlayerUiVisible,
    isPlayerChannelListOpen: isPlayerChannelListOpen,
    isPlayerCategoryOpen: isPlayerCategoryOpen,
    openPlayerChannelList: openPlayerChannelList,
    closePlayerChannelList: closePlayerChannelList,
    showChannelZapOsd: showChannelZapOsd,
    bumpPlayerUi: bumpPlayerUi,
    ZAP_COOLDOWN_MS: ZAP_COOLDOWN_MS
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
