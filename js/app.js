(function (global) {
  'use strict';

  var playerUiTimer = null;
  var clockTimer = null;
  var booted = false;
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
    safe(wirePlayerChrome, 'wire player');
    safe(updateClock, 'clock');
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(function () {
      safe(updateClock, 'clock tick');
    }, 15000);

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
      safe(function () {
        var warnings = ElionStorage.getWarnings();
        if (warnings.length) ElionUI.toast('Recovered from storage issue');
      }, 'storage warnings');
      finishBoot();
    }).catch(function (err) {
      ElionLog.error('Boot storage failed', err && err.message);
      // Keep going with whatever is in memory / localStorage — never wipe user data
      safe(function () { ElionPlaylists.loadFromStorage(); }, 'load playlists fallback');
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
    if (el) el.textContent = ElionUtils.formatClock();
  }

  var lastPlayedChannelId = null;
  var zapLockedUntil = 0;
  var zapOsdTimer = null;
  var channelListOpen = false;
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
      body.innerHTML = channels.map(function (ch, idx) {
        var active = currentId && ch.id === currentId ? ' is-current' : '';
        var num = ch.number != null && ch.number !== '' ? ('<span class="pcl-num">' + ElionUtils.escapeHtml(String(ch.number)) + '</span>') : '<span class="pcl-num">' + (idx + 1) + '</span>';
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
    try {
      if (!channel) {
        ElionUI.toast('No channel selected');
        return;
      }
      lastPlayedChannelId = channel.id || null;
      ensureZapBrowseContext(channel);
      closePlayerChannelList();
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

  function closePlayer() {
    var restoreId = lastPlayedChannelId;
    try {
      var cur = ElionPlayer.getCurrentChannel();
      if (cur && cur.id) restoreId = cur.id;
    } catch (e0) { /* ignore */ }
    closePlayerChannelList();
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
      target = delta < 0
        ? ElionChannels.prevChannel(current && current.id)
        : ElionChannels.nextChannel(current && current.id);
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
        var errText = document.getElementById('playerErrorText');
        if (buf) buf.classList.toggle('active', !!st.buffering && !st.error);
        if (errBox) {
          if (st.error) {
            errBox.style.display = 'block';
            if (errText) errText.textContent = st.error;
          } else {
            errBox.style.display = 'none';
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
      if (channelListOpen) closePlayerChannelList();
      else openPlayerChannelList();
    });
    bind('btnCloseChannelList', closePlayerChannelList);
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
      var modal = document.getElementById('modalHost');
      if (modal && modal.classList.contains('active')) {
        var cancel = document.getElementById('modalCancel') || document.getElementById('modalOk');
        if (cancel) cancel.click();
        return;
      }

      var player = document.getElementById('playerScreen');
      if (player && player.classList.contains('active')) {
        // In-player channel list: first Back closes the list, second exits player.
        if (channelListOpen) {
          closePlayerChannelList();
          return;
        }
        // One Back press always returns to the channel list (OK still shows controls).
        closePlayer();
        return;
      }

      var cur = ElionScreens.getCurrent();
      if (cur.name === 'category') {
        ElionScreens.navigate('categories');
        return;
      }
      if (cur.name === 'settings' && cur.settingsTab && cur.settingsTab !== 'general') {
        ElionScreens.navigate('settings', { tab: 'general' });
        return;
      }
      if (moreScreens[cur.name] && cur.name !== 'more' && cur.name !== 'home') {
        ElionScreens.navigate('more');
        return;
      }
      if (cur.name === 'more') {
        ElionScreens.navigate('home');
        return;
      }
      if (cur.name !== 'home') {
        ElionScreens.navigate('home');
        return;
      }

      if (window.webOS && webOS.platformBack) webOS.platformBack();
      else if (window.close) window.close();
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
    playerChannelStep: playerChannelStep,
    playerOkAction: playerOkAction,
    isPlayerActive: isPlayerActive,
    isPlayerUiVisible: isPlayerUiVisible,
    isPlayerChannelListOpen: isPlayerChannelListOpen,
    openPlayerChannelList: openPlayerChannelList,
    closePlayerChannelList: closePlayerChannelList,
    showChannelZapOsd: showChannelZapOsd,
    bumpPlayerUi: bumpPlayerUi,
    ZAP_COOLDOWN_MS: ZAP_COOLDOWN_MS
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
