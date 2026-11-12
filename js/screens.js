(function (global) {
  'use strict';

  var current = 'home';
  var context = {};
  var settingsTab = 'general';
  var navStack = [];

  function copyContext(src) {
    var out = {};
    if (!src) return out;
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
    }
    return out;
  }

  function currentSnap() {
    var body = document.querySelector('#content .screen-body');
    var content = document.getElementById('content');
    var focused = document.activeElement;
    var focusId = focused && focused.getAttribute ? (focused.getAttribute('data-id') || '') : '';
    return {
      name: current,
      context: copyContext(context),
      settingsTab: settingsTab,
      scroll: body ? body.scrollTop : (content ? content.scrollTop : 0),
      focusId: focusId
    };
  }

  function sameEntry(a, b) {
    if (!a || !b) return false;
    if (a.name !== b.name) return false;
    if (a.name === 'settings' && a.settingsTab !== b.settingsTab) return false;
    var ag = (a.context && a.context.group) || '';
    var bg = (b.context && b.context.group) || '';
    if ((a.name === 'category' || a.name === 'channels') && ag !== bg) return false;
    var as = (a.context && a.context.seriesKey) || '';
    var bs = (b.context && b.context.seriesKey) || '';
    if (a.name === 'seriesDetail' && as !== bs) return false;
    return true;
  }

  function fallbackParent() {
    if (current === 'seriesDetail') return { name: 'series', context: {} };
    if (current === 'category') return { name: (context && context.returnTo) || 'live', context: {} };
    if (current === 'channels') return { name: 'live', context: {} };
    if (current === 'about') return { name: 'settings', context: { tab: 'general' } };
    return { name: 'home', context: {} };
  }

  function libraryPhase() {
    try {
      if (ElionPlaylists.getLibraryPhase) return ElionPlaylists.getLibraryPhase();
    } catch (e) { return 'recover'; }
    return 'ready';
  }

  function contentNeedsPlaylist(name) {
    return name === 'live' || name === 'movies' || name === 'series' || name === 'seriesDetail' ||
      name === 'channels' || name === 'categories' || name === 'category' ||
      name === 'favorites' || name === 'recents' || name === 'search' || name === 'epg';
  }

  function navigate(name, ctx, opts) {
    opts = opts || {};
    ctx = ctx || {};
    if (contentNeedsPlaylist(name) && libraryPhase() !== 'ready') name = 'home';
    var nextTab = settingsTab;
    if (name === 'settings') nextTab = ctx.tab || 'general';
    var sameSettingsTab = current === 'settings' && name === 'settings';
    if (!opts.replace && name !== 'home' && !sameSettingsTab) {
      var here = currentSnap();
      var sameScreen = here.name === name &&
        (name !== 'category' || (here.context.group || '') === (ctx.group || '')) &&
        (name !== 'seriesDetail' || (here.context.seriesKey || '') === (ctx.seriesKey || '')) &&
        (name !== 'channels' || (here.context.group || '') === (ctx.group || ''));
      if (!sameScreen && here.name) {
        var top = navStack.length ? navStack[navStack.length - 1] : null;
        if (!sameEntry(top, here)) navStack.push(here);
        if (navStack.length > 24) navStack.shift();
      }
    }
    if (!opts.replace && name === 'home') navStack = [];
    current = name;
    settingsTab = nextTab;
    if (opts.restore) {
      context = copyContext(opts.restore.context);
      settingsTab = opts.restore.settingsTab || settingsTab;
    } else {
      context = ctx;
    }
    if (context.visibleCount == null) context.visibleCount = 48;
    render(opts.restore ? { scrollTop: opts.restore.scroll || 0, focusChannelId: opts.restore.focusId || null } : null);
    if (global.ElionApp) ElionApp.updateChrome(name);
  }

  function goBack() {
    if (current === 'home') return;
    if (current === 'settings' && settingsTab !== 'general') {
      navigate('settings', { tab: 'general' }, { replace: true });
      return;
    }
    var here = currentSnap();
    var prev = null;
    while (navStack.length) {
      prev = navStack.pop();
      if (prev && !sameEntry(prev, here)) break;
      prev = null;
    }
    if (!prev) {
      var parent = fallbackParent();
      navigate(parent.name, parent.context, { replace: true });
      return;
    }
    navigate(prev.name, prev.context, { replace: true, restore: prev });
  }

  function getCurrent() {
    return { name: current, context: context, settingsTab: settingsTab };
  }

  function st() { return ElionPlaylists.getState(); }

  function syncHomeChrome() {
    var isHome = current === 'home';
    try {
      document.body.classList.toggle('screen-home', isHome);
      var app = document.getElementById('app');
      if (app) app.classList.toggle('screen-home', isHome);
      var shell = document.getElementById('shell');
      if (shell) shell.classList.toggle('screen-home', isHome);
      var sideNav = document.querySelector('.side-nav');
      if (sideNav) sideNav.setAttribute('aria-hidden', isHome ? 'true' : 'false');
    } catch (e) {
      if (global.ElionLog) ElionLog.warn('syncHomeChrome failed', e && e.message);
    }
  }

  function render(renderOpts) {
    renderOpts = renderOpts || {};
    listCache = Object.create(null);
    var root = document.getElementById('content');
    if (!root) return;
    try {
      ElionUI.applyAppearance();
    } catch (e) {
      if (global.ElionLog) ElionLog.warn('appearance failed', e && e.message);
    }
    syncHomeChrome();
    var html = '';
    try {
      switch (current) {
        case 'home': html = renderHome(); break;
        case 'more': html = renderMore(); break;
        case 'live': html = renderLive(); break;
        case 'movies': html = renderMovies(); break;
        case 'series': html = renderSeries(); break;
        case 'seriesDetail': html = renderSeriesDetail(); break;
        case 'channels': html = renderChannels(); break;
        case 'categories': html = renderCategories(); break;
        case 'category': html = renderCategory(); break;
        case 'favorites': html = renderFavorites(); break;
        case 'recents': html = renderRecents(); break;
        case 'search': html = renderSearch(); break;
        case 'epg': html = renderEpg(); break;
        case 'playlists': html = renderPlaylists(); break;
        case 'settings': html = renderSettings(); break;
        case 'about': html = renderAbout(); break;
        default: html = renderHome();
      }
    } catch (err) {
      if (global.ElionLog) ElionLog.error('Screen render failed', err && err.message);
      html = '<div class="empty-state"><h3>Something went wrong</h3><p>Please go back to Home and try again.</p>' +
        '<div class="btn-row" style="justify-content:center"><button class="primary" data-focusable data-nav="home">Home</button>' +
        '<button data-focusable data-nav="playlists">My Playlists</button></div></div>';
    }
    if (current !== 'home' && html.indexOf('data-action="go-back"') === -1) {
      html = '<div class="screen-page"><div class="screen-back-row">' + backButton() + '</div>' + html + '</div>';
    }
    try {
      root.innerHTML = html;
      if (global.ElionFocus && ElionFocus.invalidate) ElionFocus.invalidate();
      wire(root);
    } catch (wireErr) {
      if (global.ElionLog) ElionLog.error('Screen wire failed', wireErr && wireErr.message);
      root.innerHTML = '<div class="empty-state"><h3>Something went wrong</h3><p>Open <strong>More</strong>, then <strong>My Playlists</strong>.</p>' +
        '<div class="btn-row" style="justify-content:center"><button class="primary" data-focusable data-nav="playlists">My Playlists</button></div></div>';
      try { wire(root); } catch (e2) { /* ignore */ }
    }
    setTimeout(function () {
      try {
        var focusOpts = {};
        if (renderOpts.scrollTop) {
          var scroller = root.querySelector('.screen-body') || root;
          scroller.scrollTop = renderOpts.scrollTop;
        }
        if (renderOpts.focusChannelId) focusOpts.channelId = renderOpts.focusChannelId;
        else if (current === 'search' && !(context.query || '').trim()) {
          focusOpts.selector = '#searchInput';
        } else if (current === 'categories') {
          focusOpts.selector = '.category-card';
        } else if (context.keepSearchFocus) {
          focusOpts.selector = '#channelSearch';
          context.keepSearchFocus = false;
        } else if (current === 'live') {
          focusOpts.selector = '.category-card';
        } else if (current === 'movies' || current === 'series' || current === 'seriesDetail' ||
                   current === 'channels' || current === 'favorites' ||
                   current === 'recents' || current === 'category' || current === 'search') {
          var lastId = ElionStorage.get('lastChannelId');
          if (lastId) focusOpts.channelId = lastId;
        } else if (current === 'home') {
          var phase = libraryPhase();
          if (phase === 'none' || phase === 'recover') focusOpts.selector = '.welcome-cta';
          else if (phase === 'empty') focusOpts.selector = '.empty-library .primary';
          else focusOpts.selector = '.hub-tile';
        }
        if (ElionFocus.focusPreferred) ElionFocus.focusPreferred(root, focusOpts);
        else ElionFocus.focusFirst(root);
      } catch (f) { /* ignore */ }
    }, 30);
  }

  function backButton() {
    return '<button class="back-btn" data-focusable data-action="go-back" type="button" aria-label="Back">' +
      '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30 10L16 24l14 14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span>BACK</span></button>';
  }

  function screenShell(heading, meta, actionsHtml, bodyHtml) {
    return (
      '<div class="screen-page">' +
        '<header class="screen-header">' +
          backButton() +
          '<div class="screen-header-text">' +
            '<h3 class="screen-heading">' + heading + '</h3>' +
            (meta ? '<p class="screen-meta">' + meta + '</p>' : '') +
          '</div>' +
          (actionsHtml ? '<div class="screen-header-actions">' + actionsHtml + '</div>' : '') +
        '</header>' +
        '<div class="screen-body">' + bodyHtml + '</div>' +
      '</div>'
    );
  }

  function pickLiveChannel() {
    var lastId = ElionStorage.get('lastChannelId');
    var last = lastId ? ElionPlaylists.getChannelById(lastId) : null;
    if (last) return last;
    var recents = ElionStorage.getRecents();
    for (var i = 0; i < recents.length; i++) {
      var ch = ElionPlaylists.getChannelById(recents[i].id);
      if (ch && ch.url) return ch;
    }
    var all = ElionChannels.getSortedAll();
    return all.length ? all[0] : null;
  }

  /* ---------------- HOME ---------------- */
  function icon(name) {
    var s = ' fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
    var paths = {
      live: '<rect x="8" y="12" width="32" height="20" rx="3"' + s + '/><path d="M20 17.5l8 4.5-8 4.5z" fill="currentColor"/><path d="M18 36h12"' + s + '/>',
      movies: '<rect x="8" y="10" width="32" height="28" rx="3"' + s + '/><path d="M8 18h32M15 10l3.5 8M29 10l3.5 8"' + s + '/>',
      series: '<rect x="8" y="14" width="24" height="22" rx="3"' + s + '/><path d="M16 14V9h18a3 3 0 0 1 3 3v16h-5"' + s + '/>',
      epg: '<rect x="8" y="10" width="32" height="28" rx="3"' + s + '/><path d="M8 18h32M16 10v8M32 10v8"' + s + '/>',
      playlist: '<path d="M14 12h16l6 6v18H14z"' + s + '/><path d="M30 12v6h6M20 24h12M20 30h8"' + s + '/>',
      fav: '<path d="M24 38l-1.5-1.4C14 29 8 24 8 17.6 8 13.2 11.4 10 15.8 10c2.6 0 5 1.2 8.2 3.8C27.2 11.2 29.6 10 32.2 10 36.6 10 40 13.2 40 17.6c0 6.4-6 11.4-14.5 19L24 38z"' + s + '/>',
      search: '<circle cx="21" cy="21" r="9"' + s + '/><path d="M28 28l9 9"' + s + '/>',
      settings: '<circle cx="24" cy="24" r="5"' + s + '/><path d="M24 8v4M24 36v4M8 24h4M36 24h4M12.6 12.6l2.8 2.8M32.6 32.6l2.8 2.8M35.4 12.6l-2.8 2.8M15.4 32.6l-2.8 2.8"' + s + '/>',
      about: '<circle cx="24" cy="24" r="14"' + s + '/><path d="M24 22v10"' + s + '/><circle cx="24" cy="16" r="1.7" fill="currentColor"/>',
      grid: '<path d="M8 8h12v12H8zM28 8h12v12H28zM8 28h12v12H8zM28 28h12v12H28z"' + s + '/>'
    };
    return '<svg viewBox="0 0 48 48" aria-hidden="true">' + (paths[name] || paths.grid) + '</svg>';
  }

  function hubTile(nav, iconName, label, desc, count) {
    var countHtml = count > 0 ? '<span class="hub-tile-count">' + count + '</span>' : '';
    return (
      '<button class="hub-tile" data-focusable data-nav="' + nav + '" type="button">' +
        '<span class="hub-tile-icon" aria-hidden="true">' + icon(iconName) + '</span>' +
        '<span class="hub-tile-label">' + label + '</span>' +
        (desc ? '<span class="hub-tile-desc">' + desc + '</span>' : '') +
        countHtml +
      '</button>'
    );
  }

  function hubAction(action, icon, label, desc) {
    return (
      '<button class="hub-tile" data-focusable data-action="' + action + '" type="button">' +
        '<span class="hub-tile-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="hub-tile-label">' + label + '</span>' +
        (desc ? '<span class="hub-tile-desc">' + desc + '</span>' : '') +
      '</button>'
    );
  }

  var playlistRefreshBusy = false;

  function setReloadLabel(busy) {
    var btn = document.getElementById('btnReload');
    if (!btn) return;
    var span = btn.querySelector('span');
    var label = busy ? 'Refreshing...' : 'Reload';
    if (span) span.textContent = label;
    btn.setAttribute('aria-label', busy ? 'Refreshing...' : 'Reload IPTV');
    btn.setAttribute('title', busy ? 'Refreshing...' : 'Reload IPTV');
  }

  function finishReload(ok, message) {
    playlistRefreshBusy = false;
    setReloadLabel(false);
    ElionUI.setLoading(false);
    ElionUI.toast(message, ok ? 'success' : 'error');
    if (global.ElionApp && ElionApp.addMessage) {
      ElionApp.addMessage(ok ? 'Playlist refreshed' : 'Playlist refresh failed', message);
    }
  }

  function reloadActivePlaylist() {
    if (playlistRefreshBusy) {
      ElionUI.toast('Refreshing is already in progress.');
      return;
    }
    var state = st();
    var id = state.activePlaylistId;
    var pl = id ? ElionPlaylists.getPlaylistById(id) : null;
    if (!pl) {
      ElionUI.toast('No playlist is selected. Open My Playlists and choose one.');
      return;
    }
    if (pl.sourceType !== 'url' || !pl.url) {
      ElionUI.toast('This playlist has no web address to refresh. Open My Playlists and update or import it again.');
      return;
    }
    playlistRefreshBusy = true;
    setReloadLabel(true);
    ElionUI.setLoading(true);
    ElionUI.toast('Refreshing...', 120000, 'info');
    var refresh = ElionPlaylists.refreshPlaylist(pl.id);
    refresh.then(function (r) {
      if (r && r.ok) {
        finishReload(true, 'Playlist refreshed. ' + (r.channelCount || 0) + ' channels.');
        if (global.ElionApp) ElionApp.updateChrome(current);
        render(null);
        return;
      }
      var raw = (r && r.errors && r.errors[0]) || '';
      var msg = /already in progress/i.test(raw)
        ? 'Refreshing is already in progress.'
        : 'Could not refresh the playlist. Your saved channels are still available.';
      finishReload(false, msg);
    }).catch(function () {
      finishReload(false, 'Could not refresh the playlist. Your saved channels are still available.');
    });
    return refresh;
  }

  function isGenericSeriesLabel(part) {
    return /^(?:vod\s+|tv\s+)?(?:series|tv\s*shows?|seasons?)(?:\s+(?:hd|fhd|uhd|4k))?$/i.test(String(part || '').trim());
  }

  function isSeriesGroup(group) {
    var g = String(group || '').trim();
    if (!g || g === 'Uncategorized') return false;
    var parts = g.split(/\s*[|;]\s*/);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].replace(/^(?:[a-z]{2}|uk|us)\s+/i, '').trim();
      if (isGenericSeriesLabel(part)) return true;
    }
    return false;
  }

  function isMovieGroup(group) {
    var g = String(group || '').trim();
    if (!g || g === 'Uncategorized') return false;
    if (isSeriesGroup(g) || /\bS\d{1,2}\s*E\d{1,3}\b/i.test(g)) return false;
    var parts = g.split(/\s*[|;]\s*/);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].replace(/^(?:[a-z]{2}|uk|us)\s+/i, '').trim();
      if (/^(?:vod\s+)?(?:movies?|films?|cinema)(?:\s+(?:hd|fhd|uhd|4k))?$/i.test(part)) return true;
      if (/^vod(?:\s+(?:hd|fhd|uhd|4k))?$/i.test(part)) return true;
    }
    return false;
  }

  function pad2(n) {
    n = parseInt(n, 10);
    return (n < 10 ? '0' : '') + n;
  }

  function cleanLabel(text) {
    return String(text || '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s|\-–—:]+|[\s|\-–—:]+$/g, '').trim();
  }

  function parseEpisode(ch) {
    var source = String((ch && (ch.tvgName || ch.name)) || '').trim();
    var patterns = [
      /\bS(\d{1,2})\s*E(\d{1,3})\b/i,
      /\bseason\s+(\d{1,2})\s*(?:episode|ep\.?)\s*(\d{1,3})\b/i
    ];
    var info = {
      channel: ch,
      season: null,
      episode: null,
      seriesName: '',
      episodeTitle: '',
      hasEpisode: false,
      inSeriesGroup: isSeriesGroup(ch && ch.group)
    };
    var match = null;
    for (var i = 0; i < patterns.length; i++) {
      var found = patterns[i].exec(source);
      if (!found) continue;
      var prefix = cleanLabel(source.slice(0, found.index));
      match = found;
      info.seriesName = prefix;
      info.episodeTitle = cleanLabel(source.slice(found.index + found[0].length));
      break;
    }
    if (!match) return info;
    info.hasEpisode = true;
    info.season = parseInt(match[1], 10);
    info.episode = parseInt(match[2], 10);
    if (!info.seriesName) {
      var parts = String((ch && ch.group) || '').split(/\s*[|;]\s*/);
      var specific = [];
      for (var p = 0; p < parts.length; p++) {
        var part = parts[p].replace(/^(?:[a-z]{2}|uk|us)\s+/i, '').trim();
        if (part && !isGenericSeriesLabel(part)) specific.push(part);
      }
      if (specific.length === 1) info.seriesName = specific[0];
    }
    return info;
  }

  function mediaKind(ch) {
    var info = parseEpisode(ch);
    var series = info.inSeriesGroup || info.hasEpisode;
    var movie = isMovieGroup((ch && ch.group) || '');
    if (series && movie) return info.hasEpisode ? 'series' : 'movie';
    if (series) return 'series';
    if (movie) return 'movie';
    return 'live';
  }

  function channelsOfKind(kind) {
    var all = ElionChannels.getSortedAll();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (mediaKind(all[i]) === kind) out.push(all[i]);
    }
    return out;
  }

  function countKind(kind) {
    return channelsOfKind(kind).length;
  }

  function categoryLabel(name) {
    return name || 'Uncategorized';
  }

  function epgMatchedCount() {
    if (!ElionEPG.hasData()) return 0;
    var all = ElionChannels.getSortedAll();
    var n = 0;
    for (var i = 0; i < all.length; i++) {
      var nn = ElionEPG.getNowNext(all[i]);
      if (nn && nn.now) n++;
    }
    return n;
  }

  function renderHomeHub(extraTop) {
    var s = st();
    var liveCount = 0;
    var all = s.channelCount ? ElionChannels.getSortedAll() : [];
    for (var i = 0; i < all.length; i++) {
      if (mediaKind(all[i]) === 'live') liveCount++;
    }
    var movieCount = 0;
    var seriesCount = 0;
    for (var j = 0; j < all.length; j++) {
      var kind = mediaKind(all[j]);
      if (kind === 'movie') movieCount++;
      else if (kind === 'series') seriesCount++;
    }
    var favCount = 0;
    try { favCount = ElionFavorites.listChannels().length; } catch (e) { favCount = 0; }
    var guideCount = s.channelCount ? epgMatchedCount() : 0;
    var countLabel = s.channelCount
      ? (s.channelCount + (s.channelCount === 1 ? ' channel ready' : ' channels ready'))
      : 'Add a playlist to begin';
    return (
      '<div class="home-hub">' +
        (extraTop || '') +
        '<div class="home-brand-bar">' +
          '<div class="home-brand-copy">' +
            '<h2 class="home-title">ELION IPTV</h2>' +
            '<p class="home-sub">' + ElionUtils.escapeHtml(countLabel) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="hub-grid hub-grid-home" role="navigation" aria-label="Main">' +
          hubTile('live', 'live', 'LIVE TV', 'Start watching now', liveCount) +
          hubTile('movies', 'movies', 'MOVIES', 'Films found in your playlist', movieCount) +
          hubTile('series', 'series', 'SERIES', 'Shows found in your playlist', seriesCount) +
          hubTile('epg', 'epg', 'LIVE WITH EPG', 'Guide for channels that have one', guideCount) +
          hubTile('playlists', 'playlist', 'ADD PLAYLIST', 'Add or switch your M3U list', s.playlists.length) +
          hubTile('favorites', 'fav', 'FAVORITES', 'Channels you marked', favCount) +
        '</div>' +
      '</div>'
    );
  }

  function appLogo(className) {
    return '<img class="app-logo ' + className + '" src="assets/images/elion-iptv-logo.png" alt="ELION IPTV">';
  }

  function playlistMark() {
    return '<div class="playlist-mark" aria-hidden="true">' +
      '<svg viewBox="0 0 48 48"><path d="M12 10h18l6 6v20H12z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M30 10v6h6M18 22h12M18 28h8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="34" cy="34" r="8" fill="none" stroke="currentColor" stroke-width="3"/>' +
      '<path d="M32 31.5l5 2.5-5 2.5z" fill="currentColor"/></svg></div>';
  }

  function renderFirstRun() {
    return (
      '<div class="welcome welcome-gate">' +
        appLogo('app-logo-welcome') +
        playlistMark() +
        '<h2>Welcome to ELION IPTV</h2>' +
        '<p class="welcome-lead">Add your IPTV playlist to start watching your favorite content.</p>' +
        '<button class="primary welcome-cta" data-focusable data-nav="playlists" type="button">ADD PLAYLIST</button>' +
      '</div>'
    );
  }

  function renderLibraryRecover() {
    return (
      '<div class="welcome welcome-gate">' +
        appLogo('app-logo-welcome') +
        '<h2>Welcome to ELION IPTV</h2>' +
        '<p class="welcome-lead">Saved playlists could not be restored. Add a playlist to continue.</p>' +
        '<button class="primary welcome-cta" data-focusable data-nav="playlists" type="button">ADD PLAYLIST</button>' +
      '</div>'
    );
  }

  function renderEmptyPlaylist() {
    var active = st().activePlaylist;
    var name = active && active.name ? active.name : 'This playlist';
    return (
      '<div class="welcome welcome-gate empty-library">' +
        playlistMark() +
        '<h2>No channels were found in this playlist.</h2>' +
        '<p class="welcome-lead">' + ElionUtils.escapeHtml(name) + ' is saved, but it has no channels to show.</p>' +
        '<div class="btn-row welcome-actions">' +
          '<button class="primary" data-focusable data-action="reload-iptv" type="button">Refresh Playlist</button>' +
          '<button data-focusable data-action="update-active-playlist" type="button">Update Playlist</button>' +
          '<button data-focusable data-nav="playlists" type="button">Add Another Playlist</button>' +
          '<button class="danger" data-focusable data-action="remove-active-playlist" type="button">Remove Playlist</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderHome() {
    var phase = libraryPhase();
    if (phase === 'none') return renderFirstRun();
    if (phase === 'recover') return renderLibraryRecover();
    if (phase === 'empty') return renderEmptyPlaylist();
    return renderHomeHub('');
  }

  function renderMore() {
    return (
      '<div class="more-hub">' +
        '<div class="toolbar wrap">' +
          '<span class="chip">Extra tools</span>' +
        '</div>' +
        '<div class="hub-grid hub-grid-more" role="navigation" aria-label="More">' +
          hubTile('epg', 'epg', 'TV Guide', 'See what’s on now') +
          hubTile('search', 'search', 'Search', 'Find a channel by name') +
          hubTile('playlists', 'playlist', 'My Playlists', 'Add or switch playlists') +
          hubTile('settings', 'settings', 'Settings', 'Adjust the app') +
          hubTile('about', 'about', 'About', 'App information') +
        '</div>' +
      '</div>'
    );
  }

  function renderWelcome() {
    return (
      '<div class="welcome">' +
        appLogo('app-logo-welcome') +
        '<h2>Welcome to ELION IPTV</h2>' +
        '<p class="welcome-lead">Add your TV playlist to start watching.</p>' +
        '<div class="btn-row" style="justify-content:center">' +
          '<button class="primary welcome-cta" data-focusable data-nav="playlists">ADD PLAYLIST</button>' +
        '</div>' +
        '<div class="welcome-steps">' +
          '<p><strong>How to add a playlist</strong></p>' +
          '<ol>' +
            '<li><strong>Playlist address</strong> — enter the link your provider gave you.</li>' +
            '<li><strong>Paste playlist</strong> — copy the playlist text from a computer and paste it here.</li>' +
            '<li><strong>Phone or computer</strong> — use the optional companion helper on your home network.</li>' +
          '</ol>' +
          '<p class="help">ELION does not include demo channels. Only the playlist you add will appear.</p>' +
        '</div>' +
      '</div>'
    );
  }

  function tryStartConfiguredEpg(playlist) {
    try {
      var settings = ElionStorage.getSettings();
      var url = (settings && settings.epgSourceUrl) || (playlist && playlist.epgUrl) || '';
      if (playlist && playlist.epgUrl && settings && !settings.epgSourceUrl) {
        ElionStorage.saveSettings({ epgSourceUrl: playlist.epgUrl });
        url = playlist.epgUrl;
      }
      if (url && String(url).indexOf('http') === 0 && global.ElionEPG) {
        ElionEPG.loadFromUrl(url).catch(function () { /* guide is optional */ });
      }
    } catch (e) { /* dashboard does not wait on the guide */ }
  }

  function afterImportSuccess(channelCount, playlist) {
    ElionUI.notify('Your playlist has been added successfully.', 'success');
    statusEl('Added ' + channelCount + ' channels.', true);
    tryStartConfiguredEpg(playlist);
    navigate('home', {}, { replace: true });
  }

  function sectionList(title, list, moreNav) {
    if (!list.length) return '';
    return (
      '<div class="section-title">' + title + ' <button class="linkish" data-focusable data-nav="' + moreNav + '">See all</button></div>' +
      '<div class="channel-list compact" id="listRoot">' + list.map(function (ch) { return ElionUI.channelRow(ch); }).join('') + '</div>'
    );
  }

  function epgNowLine(ch) {
    var nn = ElionEPG.getNowNext(ch);
    return nn.now ? (' · ' + nn.now.title) : '';
  }

  /* ---------------- CHANNEL BROWSER ---------------- */
  function sortedCategories() {
    var hidden = {};
    try {
      (ElionStorage.getSettings().hiddenGroups || []).forEach(function (name) { hidden[name] = true; });
    } catch (e) { hidden = {}; }
    return (st().categories || []).filter(function (c) { return c && !hidden[c.name]; });
  }

  function categoryArt(groupName) {
    var list = ElionPlaylists.getChannelsByGroup(groupName);
    for (var i = 0; i < list.length && i < 8; i++) {
      if (list[i].logo) return ElionUI.channelLogo(list[i], 56, { eager: true });
    }
    return icon('grid');
  }

  function resumeNote() {
    var settings = ElionStorage.getSettings();
    if (!settings.rememberLastChannel) return '';
    var group = ElionStorage.get('lastCategory') || '';
    var channel = null;
    var lastId = ElionStorage.get('lastChannelId');
    if (lastId) channel = ElionPlaylists.getChannelById(lastId);
    if (group && (settings.hiddenGroups || []).indexOf(group) !== -1) group = '';
    if (!group && !channel) return '';
    var html = '<div class="resume-bar">';
    if (group) {
      html += '<button data-focusable data-action="open-category" data-group="' + ElionUtils.escapeHtml(group) + '" type="button">Last category: ' + ElionUtils.escapeHtml(categoryLabel(group)) + '</button>';
    }
    if (channel) {
      html += '<button data-focusable data-action="play" data-id="' + ElionUtils.escapeHtml(channel.id) + '" type="button">Last channel: ' + ElionUtils.escapeHtml(channel.name) + '</button>';
    }
    return html + '</div>';
  }

  function categoryCards(includeAll) {
    var cats = sortedCategories();
    var html = '<div class="category-grid">';
    if (includeAll) {
      html +=
        '<button class="category-card category-card-all" data-focusable data-nav="channels" type="button">' +
          '<span class="category-card-icon" aria-hidden="true">' + icon('grid') + '</span>' +
          '<h3>All Channels</h3>' +
          '<p>' + st().channelCount + ' channel' + (st().channelCount === 1 ? '' : 's') + '</p>' +
        '</button>';
    }
    html += cats.map(function (c) {
      return (
        '<button class="category-card" data-focusable data-action="open-category" data-group="' + ElionUtils.escapeHtml(c.name) + '" type="button">' +
          '<span class="category-card-icon" aria-hidden="true">' + categoryArt(c.name) + '</span>' +
          '<h3>' + ElionUtils.escapeHtml(categoryLabel(c.name)) + '</h3>' +
          '<p>' + c.count + ' channel' + (c.count === 1 ? '' : 's') + '</p>' +
        '</button>'
      );
    }).join('');
    html += '</div>';
    return html;
  }

  function renderLive() {
    var cats = st().categories;
    if (!st().channelCount || !cats.length) {
      return ElionUI.emptyState(
        'Nothing to watch yet',
        'Add your TV playlist first, then come back here to watch.',
        'ADD PLAYLIST',
        'go-playlists'
      );
    }
    return screenShell(
      'Live TV',
      cats.length + ' categories from your playlist. Choose All Channels to see every channel.',
      '<button data-focusable data-nav="search">Search</button>',
      resumeNote() + categoryCards(true)
    );
  }

  function movieCards(list) {
    var n = shownCount(list.length);
    var html = '<div class="movie-grid" id="listRoot" data-total="' + list.length + '">';
    for (var i = 0; i < n; i++) {
      var ch = list[i];
      var fav = ElionFavorites.isFavorite(ch.id);
      html += '<div class="movie-card-wrap">' +
        '<button class="movie-card" data-focusable data-action="play" data-id="' + ElionUtils.escapeHtml(ch.id) + '" type="button">' +
          ElionUI.channelLogo(ch, 320, { eager: i < 8 }) +
          '<span class="movie-title">' + ElionUtils.escapeHtml(ch.name || 'Movie') + '</span>' +
        '</button>' +
        '<button class="fav-toggle' + (fav ? ' on' : '') + '" data-focusable data-action="toggle-fav" data-id="' + ElionUtils.escapeHtml(ch.id) + '" type="button" title="' + (fav ? 'Remove favorite' : 'Add favorite') + '" aria-label="' + (fav ? 'Remove favorite' : 'Add favorite') + '">' +
          '<svg class="star-off" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8l4.6 10.2L40 19.2l-8 7.4 2.2 11.2L24 32.8 13.8 37.8 16 26.6 8 19.2l11.4-1z" fill="none" stroke="currentColor" stroke-width="3"/></svg>' +
          '<svg class="star-on" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8l4.6 10.2L40 19.2l-8 7.4 2.2 11.2L24 32.8 13.8 37.8 16 26.6 8 19.2l11.4-1z" fill="currentColor"/></svg>' +
        '</button>' +
      '</div>';
    }
    html += '</div>';
    if (n < list.length) {
      html += '<p class="list-more-hint">' + n + ' of ' + list.length + ' shown. Press Down to load more.</p>';
    }
    return html;
  }

  function renderMovies() {
    var list = channelsOfKind('movie');
    if (!list.length) {
      return screenShell(
        'Movies',
        'Movies are taken from playlist groups named Movies, Films, Cinema, or VOD.',
        '',
        '<div class="empty-state"><h3>No movies found in your current playlist.</h3><p>Live channels stay under Live TV.</p></div>'
      );
    }
    var filtered = filterByQuery(list, context.channelQuery);
    ElionChannels.setBrowseList(filtered, 'movies');
    return screenShell(
      'Movies',
      filtered.length + ' of ' + list.length + ' from movie groups in this playlist',
      channelSearchBox(),
      filtered.length ? movieCards(filtered) : '<div class="empty-state"><h3>No movies found in your current playlist.</h3><p>Try a different search.</p></div>'
    );
  }

  function seriesCatalog() {
    var all = ElionChannels.getSortedAll();
    var shows = Object.create(null);
    var order = [];
    var loose = [];
    for (var i = 0; i < all.length; i++) {
      var info = parseEpisode(all[i]);
      if (!info.inSeriesGroup && !info.hasEpisode) continue;
      if (info.hasEpisode && info.seriesName) {
        if (!shows[info.seriesName]) {
          shows[info.seriesName] = { name: info.seriesName, logo: '', episodes: [] };
          order.push(info.seriesName);
        }
        var show = shows[info.seriesName];
        if (!show.logo && info.channel.logo) show.logo = info.channel.logo;
        show.episodes.push(info);
      } else {
        loose.push(all[i]);
      }
    }
    order.sort(function (a, b) { return a.localeCompare(b); });
    return { shows: shows, order: order, loose: loose };
  }

  function seriesSeasonNumbers(episodes) {
    var seen = Object.create(null);
    var nums = [];
    for (var i = 0; i < episodes.length; i++) {
      var n = episodes[i].season;
      if (n == null || seen[n]) continue;
      seen[n] = true;
      nums.push(n);
    }
    nums.sort(function (a, b) { return a - b; });
    return nums;
  }

  function seriesCardMeta(show) {
    var seasons = seriesSeasonNumbers(show.episodes);
    var count = show.episodes.length + (show.episodes.length === 1 ? ' episode' : ' episodes');
    if (seasons.length > 1) return seasons.length + ' seasons · ' + count;
    if (seasons.length === 1) return 'Season ' + seasons[0] + ' · ' + count;
    return count;
  }

  function seriesCards(order, shows) {
    var n = shownCount(order.length);
    var html = '<div class="movie-grid" data-total="' + order.length + '">';
    for (var i = 0; i < n; i++) {
      var show = shows[order[i]];
      html += '<div class="movie-card-wrap">' +
        '<button class="movie-card" data-focusable data-action="open-series" data-series="' + ElionUtils.escapeHtml(show.name) + '" type="button">' +
          ElionUI.channelLogo({ name: show.name, logo: show.logo }, 320, { eager: i < 8 }) +
          '<span class="movie-title">' + ElionUtils.escapeHtml(show.name) + '</span>' +
          '<span class="series-meta">' + ElionUtils.escapeHtml(seriesCardMeta(show)) + '</span>' +
        '</button></div>';
    }
    html += '</div>';
    if (n < order.length) {
      html += '<p class="list-more-hint">' + n + ' of ' + order.length + ' shown. Press Down to load more.</p>';
    }
    return html;
  }

  function renderSeries() {
    var catalog = seriesCatalog();
    var query = String(context.channelQuery || '').trim().toLowerCase();
    var order = catalog.order.filter(function (name) {
      return !query || name.toLowerCase().indexOf(query) !== -1;
    });
    var loose = catalog.loose.filter(function (ch) {
      return !query || String(ch.name || '').toLowerCase().indexOf(query) !== -1;
    });
    if (!catalog.order.length && !catalog.loose.length) {
      return screenShell(
        'Series',
        'Series appear when a group is named Series or an entry includes a season and episode.',
        '',
        '<div class="empty-state"><h3>No series found in your current playlist.</h3><p>Live channels stay under Live TV.</p></div>'
      );
    }
    var body = '';
    if (order.length) body += seriesCards(order, catalog.shows);
    if (loose.length) {
      body += '<h3 class="season-heading">Listed without season or episode numbers</h3>' +
        '<p class="screen-meta">These entries belong to a series group. The playlist does not identify a season or episode, so they are shown as a list.</p>' +
        listHtml(loose);
    }
    if (!body) {
      body = '<div class="empty-state"><h3>No matching series.</h3><p>Try a different name.</p></div>';
    }
    var meta = '';
    if (order.length) meta = order.length + ' series';
    if (loose.length) {
      var looseLabel = loose.length + ' without episode numbers';
      meta = meta ? (meta + ' · ' + looseLabel) : looseLabel;
    }
    return screenShell(
      'Series',
      meta,
      channelSearchBox('Search series'),
      body
    );
  }

  function episodeButton(info) {
    var ch = info.channel;
    var code = (info.season != null && info.episode != null) ? ('S' + pad2(info.season) + 'E' + pad2(info.episode)) : '';
    var title = info.episodeTitle || code || ch.name || 'Episode';
    var sub = '';
    if (info.episodeTitle && code) sub = code;
    else if (!info.episodeTitle && code && ch.name && ch.name !== code) sub = ch.name;
    return '<div class="channel-row-wrap">' +
      '<button class="channel-row" data-focusable data-action="play" data-id="' + ElionUtils.escapeHtml(ch.id) + '" type="button">' +
        ElionUI.channelLogo(ch, 72, { eager: true }) +
        '<div class="meta"><h4>' + ElionUtils.escapeHtml(title) + '</h4>' +
        (sub ? '<div class="muted">' + ElionUtils.escapeHtml(sub) + '</div>' : '') +
        '</div></button></div>';
  }

  function renderSeriesDetail() {
    var key = context.seriesKey || '';
    var catalog = seriesCatalog();
    var show = catalog.shows[key];
    var episodes = show ? show.episodes.slice() : [];
    episodes.sort(function (a, b) {
      var as = a.season == null ? 999 : a.season;
      var bs = b.season == null ? 999 : b.season;
      if (as !== bs) return as - bs;
      var ae = a.episode == null ? 999 : a.episode;
      var be = b.episode == null ? 999 : b.episode;
      if (ae !== be) return ae - be;
      return String(a.channel.name || '').localeCompare(String(b.channel.name || ''));
    });
    if (episodes.length) {
      ElionChannels.setBrowseList(episodes.map(function (info) { return info.channel; }), 'series:' + key);
    }
    var seasons = seriesSeasonNumbers(episodes);
    var html = '';
    if (!episodes.length) {
      html = '<div class="empty-state"><h3>No series found in your current playlist.</h3></div>';
    } else if (seasons.length > 1) {
      for (var s = 0; s < seasons.length; s++) {
        var num = seasons[s];
        var rows = episodes.filter(function (info) { return info.season === num; });
        html += '<h3 class="season-heading">Season ' + num + '</h3><div class="channel-list">' +
          rows.map(episodeButton).join('') + '</div>';
      }
    } else {
      html = '<div class="channel-list">' + episodes.map(episodeButton).join('') + '</div>';
    }
    var meta = show ? seriesCardMeta(show) : '';
    return screenShell(
      ElionUtils.escapeHtml(key || 'Series'),
      meta,
      '',
      html
    );
  }

  function renderChannels() {
    var group = context.group || 'all';
    var all = ElionChannels.getSortedAll(group === 'all' ? null : group);
    if (!all.length) {
      return ElionUI.emptyState(
        'No channels yet',
        'Add a playlist to fill this list.',
        'ADD PLAYLIST',
        'go-playlists'
      );
    }
    var filtered = filterByQuery(all, context.channelQuery);
    ElionChannels.setBrowseList(filtered, 'channels');
    var cats = st().categories;
    var meta = filtered.length + ' of ' + all.length + ' channels' +
      (group !== 'all' ? (' · ' + categoryLabel(group)) : ' · All Channels');
    var actions =
      '<button data-focusable data-nav="search">Search</button>' +
      '<button data-focusable data-nav="live">Categories</button>' +
      '<select id="groupFilter" data-focusable aria-label="Category filter">' +
        '<option value="all"' + (group === 'all' ? ' selected' : '') + '>All categories</option>' +
        cats.map(function (c) {
          return '<option value="' + ElionUtils.escapeHtml(c.name) + '"' + (group === c.name ? ' selected' : '') + '>' + ElionUtils.escapeHtml(categoryLabel(c.name)) + ' (' + c.count + ')</option>';
        }).join('') +
      '</select>' +
      '<button data-focusable data-action="set-sort" data-sort="playlist">Default</button>' +
      '<button data-focusable data-action="set-sort" data-sort="alpha">A–Z</button>' +
      '<button data-focusable data-action="set-sort" data-sort="category">By category</button>' +
      channelSearchBox();
    return screenShell('All Channels', meta, actions, listHtml(filtered));
  }

  function renderCategories() {
    var cats = st().categories;
    if (!cats.length) {
      return ElionUI.emptyState(
        'No categories yet',
        'Categories appear automatically from your playlist groups after you add a playlist.',
        'ADD PLAYLIST',
        'go-playlists'
      );
    }
    return screenShell(
      'Categories',
      cats.length + ' categories · Press OK to open immediately',
      '',
      categoryCards(true)
    );
  }

  function renderCategory() {
    var group = context.group || 'Uncategorized';
    var list = ElionChannels.sortChannels(ElionPlaylists.getChannelsByGroup(group), 'playlist');
    var filtered = filterByQuery(list, context.channelQuery);
    if (filtered.length) ElionChannels.setBrowseList(filtered, 'category:' + group);
    var actions =
      '<button data-focusable data-nav="channels">All Channels</button>' +
      channelSearchBox();
    return screenShell(
      ElionUtils.escapeHtml(categoryLabel(group)),
      filtered.length + ' of ' + list.length + ' channel' + (list.length === 1 ? '' : 's'),
      actions,
      filtered.length
        ? listHtml(filtered)
        : ElionUI.emptyState('No channels found in this category.', 'Try another category or open All Channels.', 'All Channels', 'go-channels')
    );
  }

  function unavailableFavoriteCount() {
    var ids = ElionFavorites.getIds();
    var gone = 0;
    for (var i = 0; i < ids.length; i++) {
      if (!ElionPlaylists.getChannelById(ids[i])) gone++;
    }
    return gone;
  }

  function renderFavorites() {
    var list = ElionChannels.sortChannels(ElionFavorites.listChannels());
    var channels = [];
    var movies = [];
    var series = [];
    for (var i = 0; i < list.length; i++) {
      var kind = mediaKind(list[i]);
      if (kind === 'movie') movies.push(list[i]);
      else if (kind === 'series') series.push(list[i]);
      else channels.push(list[i]);
    }
    var gone = unavailableFavoriteCount();
    var hidden = ElionFavorites.getIds().length - list.length - gone;
    if (hidden < 0) hidden = 0;
    if (!list.length) {
      var emptyNote = gone
        ? '<p class="screen-meta">' + gone + ' saved favorite' + (gone === 1 ? ' is' : 's are') + ' no longer in your playlists.</p>' +
          '<button data-focusable data-action="drop-missing-favs">Remove unavailable favorites</button>'
        : '';
      return screenShell(
        'Favorites',
        'Channels, movies, and series you mark',
        '<button class="danger" data-focusable data-action="clear-favorites">Clear Favorites</button>',
        ElionUI.emptyState(
          'Your favorite channels will appear here.',
          'Movies and series you mark are saved here too. Favorites stay after a restart or playlist refresh.',
          'Live TV',
          'go-live'
        ) + emptyNote
      );
    }
    ElionChannels.setBrowseList(channels.concat(movies, series), 'favorites');
    function block(title, items) {
      if (!items.length) return '';
      return '<h3 class="season-heading">' + title + '</h3>' + listHtml(items);
    }
    var note = '';
    if (gone) {
      note += '<p class="screen-meta">' + gone + ' saved favorite' + (gone === 1 ? ' is' : 's are') + ' no longer in your playlists.</p>' +
        '<button data-focusable data-action="drop-missing-favs">Remove unavailable favorites</button>';
    }
    if (hidden) {
      note += '<p class="screen-meta">' + hidden + ' favorite' + (hidden === 1 ? ' belongs' : 's belong') + ' to another playlist and will return when that playlist is active.</p>';
    }
    return screenShell(
      'Favorites',
      list.length + ' in the active playlist',
      '<button class="danger" data-focusable data-action="clear-favorites">Clear Favorites</button>',
      note + block('Channels', channels) + block('Movies', movies) + block('Series', series)
    );
  }

  function renderRecents() {
    var list = ElionStorage.getRecents().map(function (r) {
      return ElionPlaylists.getChannelById(r.id) || r;
    }).filter(function (c) { return c && c.url; });
    if (!list.length) {
      return screenShell(
        'Recently Watched',
        'Your watch history appears here',
        '<button class="primary" data-focusable data-nav="live">Watch Live TV</button>',
        ElionUI.emptyState(
          'No recently watched channels yet.',
          'Channels you watch will show up here for a quick return.',
          'Watch Live TV',
          'go-live'
        )
      );
    }
    ElionChannels.setBrowseList(list, 'recents');
    return screenShell(
      'Recently Watched',
      'Most recent first · ' + list.length + ' channel' + (list.length === 1 ? '' : 's'),
      '<button class="danger" data-focusable data-action="clear-recents">Clear history</button>',
      listHtml(list)
    );
  }

  function renderSearch() {
    var q = context.query || '';
    var list = q ? ElionChannels.sortChannels(ElionPlaylists.searchChannels(q), 'alpha') : [];
    if (list.length) ElionChannels.setBrowseList(list, 'search');
    var searchBar =
      '<div class="search-stage">' +
        '<div class="search-field-row">' +
          '<input id="searchInput" class="search-input-lg" data-focusable type="text" inputmode="search" enterkeyhint="search" placeholder="Type a channel name…" value="' + ElionUtils.escapeHtml(q) + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
          '<button class="primary" data-focusable data-action="run-search">Search</button>' +
          (q ? '<button data-focusable data-action="clear-search">Clear</button>' : '') +
        '</div>' +
        '<p class="search-hint" id="searchCount">' +
          (q ? (list.length + ' result' + (list.length === 1 ? '' : 's')) : 'Press OK on the search box to open the TV keyboard') +
        '</p>' +
      '</div>';
    var results =
      '<div id="searchResults" class="search-results">' +
        (q
          ? (list.length
            ? listHtml(list)
            : '<div class="empty-state"><h3>No channels found</h3><p>Try a shorter name or check the spelling.</p></div>')
          : '<div class="empty-state empty-state-soft"><h3>Search your channels</h3><p>Type part of a channel name. Results appear as you type.</p></div>') +
      '</div>';
    return screenShell(
      'Search',
      st().channelCount + ' channels available',
      '',
      searchBar + results
    );
  }

  function toolbar(label, count) {
    return '<div class="toolbar"><span class="chip">' + ElionUtils.escapeHtml(label) + (count != null ? ' · ' + count : '') + '</span></div>';
  }

  function filterByQuery(list, q) {
    var needle = String(q || '').trim().toLowerCase();
    if (!needle) return list;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].name || '').toLowerCase().indexOf(needle) !== -1) out.push(list[i]);
    }
    return out;
  }

  function channelSearchBox(placeholder) {
    return (
      '<div class="search-field-row">' +
        '<input id="channelSearch" data-focusable type="text" inputmode="search" enterkeyhint="search" placeholder="' + ElionUtils.escapeHtml(placeholder || 'Filter channels') + '" value="' + ElionUtils.escapeHtml(context.channelQuery || '') + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '</div>'
    );
  }

  var LIST_STEP = 48;
  var listCache = Object.create(null);
  var listSeq = 0;

  function shownCount(total) {
    var n = context.visibleCount || LIST_STEP;
    if (n < LIST_STEP) n = LIST_STEP;
    if (n > total) n = total;
    return n;
  }

  function listHtml(list) {
    var n = shownCount(list.length);
    var key = 'L' + (++listSeq);
    listCache[key] = list;
    var html = '<div class="channel-list" id="listRoot" data-list-key="' + key + '" data-total="' + list.length + '">' +
      list.slice(0, n).map(function (ch) { return ElionUI.channelRow(ch); }).join('') +
      '</div>';
    if (n < list.length) {
      html += '<p class="list-more-hint">' + n + ' of ' + list.length + ' shown. Press Down to load more.</p>';
    }
    return html;
  }

  /* ---------------- EPG ---------------- */
  function epgTitle(programme) {
    var title = programme && programme.title ? String(programme.title).trim() : '';
    return title || 'No title';
  }

  function renderEpgGuide() {
    if (!ElionEPG.hasData()) {
      return '<div class="empty-state"><h3>No EPG source is configured.</h3><p>Live TV works without a guide. Add an XMLTV address from your provider when you have one. ELION does not create programme listings.</p></div>';
    }
    var all = ElionChannels.getSortedAll();
    var matched = [];
    for (var i = 0; i < all.length && matched.length < 40; i++) {
      if (ElionEPG.resolveEpgKey(all[i])) matched.push(all[i]);
    }
    if (!matched.length) {
      return '<div class="empty-state"><h3>No channels matched this guide.</h3><p>The guide is loaded, but none of the active playlist channels match its channel ids or names. Programme titles are not guessed.</p></div>';
    }
    var guide = ElionEPG.getGuideForChannels(matched, 3);
    var now = ElionEPG.guideNow();
    var span = 3 * 3600000;
    var ruler = '';
    for (var m = 0; m <= 150; m += 30) {
      ruler += '<span style="left:' + ((m / 180) * 100) + '%">' + ElionEPG.formatRange({ start: now + m * 60000 }) + '</span>';
    }
    var rows = guide.map(function (row) {
      var current = row.now;
      var next = row.next;
      var pct = current ? Math.round(ElionEPG.progressOf(current) * 100) : 0;
      var blocks = row.programmes.map(function (p) {
        var begin = Math.max(p.start, now);
        var finish = p.stop > p.start ? Math.min(p.stop, now + span) : Math.min(p.start + 60000, now + span);
        var left = ((begin - now) / span) * 100;
        var width = ((finish - begin) / span) * 100;
        if (width < 1) width = 1;
        if (left >= 100) return '';
        return '<div class="epg-block' + (current && p.start === current.start ? ' is-now' : '') + '" style="left:' + left + '%;width:' + width + '%">' +
          '<strong>' + ElionUtils.escapeHtml(epgTitle(p)) + '</strong>' +
          '<span>' + ElionUtils.escapeHtml(ElionEPG.formatRange(p)) + '</span></div>';
      }).join('');
      return '<div class="epg-row">' +
        '<button class="epg-channel" data-focusable data-action="play" data-id="' + ElionUtils.escapeHtml(row.channel.id) + '" type="button">' +
          ElionUI.channelLogo(row.channel, 56) +
          '<div><strong>' + ElionUtils.escapeHtml(row.channel.name) + '</strong>' +
          '<div class="muted">Now: ' + (current ? ElionUtils.escapeHtml(epgTitle(current)) : 'No current programme') + '</div>' +
          (current ? '<div class="muted">' + ElionUtils.escapeHtml(ElionEPG.formatRange(current)) + '</div><div class="epg-mini-progress"><span style="width:' + pct + '%"></span></div>' : '') +
          '<div class="muted">Next: ' + (next ? ElionUtils.escapeHtml(epgTitle(next) + ' · ' + ElionEPG.formatRange(next)) : 'No next programme') + '</div>' +
          '</div></button>' +
        '<div class="epg-track"><div class="epg-now-line"></div>' + blocks + '</div></div>';
    }).join('');
    return '<div class="epg-ruler">' + ruler + '</div><div class="epg-grid">' + rows + '</div>' +
      '<p class="list-more-hint">' + matched.length + ' matched channel' + (matched.length === 1 ? '' : 's') + ' shown.</p>';
  }

  function renderEpg() {
    var cache = ElionStorage.getEpgCache() || {};
    var settings = ElionStorage.getSettings();
    var source = cache.source && String(cache.source).indexOf('http') === 0 ? cache.source : '';
    var status = 'No EPG source is configured.';
    if (cache.updatedAt && ElionEPG.hasData()) status = 'Guide updated ' + formatStamp(cache.updatedAt) + '.';
    else if (cache.updatedAt) status = 'The last guide did not contain programmes.';
    return screenShell(
      'Live with EPG',
      'Optional XMLTV guide. Live TV stays available while a guide loads.',
      '',
      '<div class="panel">' +
        '<div class="form-grid">' +
          '<div class="full"><label>XMLTV address</label><input id="epgUrl" data-focusable type="url" inputmode="url" enterkeyhint="done" placeholder="https://…" value="' + ElionUtils.escapeHtml(source) + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
          '<div class="full"><label>Or paste XMLTV</label><textarea id="epgText" data-focusable inputmode="text" enterkeyhint="done" placeholder="Paste XMLTV here" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea></div>' +
          '<div><label>EPG time offset (minutes)</label><input id="epgOffset" data-focusable type="number" inputmode="numeric" min="-720" max="720" step="1" value="' + ElionUtils.escapeHtml(String(settings.epgOffsetMinutes || 0)) + '"></div>' +
        '</div>' +
        '<p class="help">Offset only shifts which programme is current. It does not change titles or invent listings.</p>' +
        '<div class="btn-row">' +
          '<button class="primary" data-focusable data-action="load-epg">Load guide</button>' +
          '<button data-focusable data-action="refresh-epg">Refresh EPG</button>' +
          '<button data-focusable data-action="load-epg-text">Add pasted guide</button>' +
          '<button data-focusable data-action="save-epg-offset">Save offset</button>' +
          '<button data-focusable data-action="clear-epg">Clear guide</button>' +
        '</div>' +
        '<div class="status-line" id="epgStatus">' + ElionUtils.escapeHtml(status) + '</div>' +
      '</div>' +
      renderEpgGuide()
    );
  }

  /* ---------------- PLAYLISTS ---------------- */
  function playlistSourceLine(p) {
    if (p.sourceType === 'url' && p.url) return 'M3U URL · ' + p.url;
    if (p.sourceType === 'file') return 'Local file · ' + (p.fileName || 'imported file');
    if (p.sourceType === 'paste') return 'Pasted playlist';
    if (p.sourceType === 'pair') return 'Phone / computer';
    return 'Saved playlist';
  }

  function renderPlaylists() {
    var s = st();
    var activeId = s.activePlaylistId || '';
    var rows = s.playlists.map(function (p) {
      var isActive = activeId === p.id;
      var status = p.channelCount > 0 ? 'Ready' : 'No channels';
      return (
        '<div class="panel playlist-card' + (isActive ? ' playlist-active' : '') + '">' +
          '<h3>' + ElionUtils.escapeHtml(p.name) + '</h3>' +
          '<p class="help">' + ElionUtils.escapeHtml(playlistSourceLine(p)) + '</p>' +
          '<p class="playlist-facts">' +
            '<span>Channels ' + p.channelCount + '</span>' +
            '<span>Updated ' + ElionUtils.escapeHtml(formatStamp(p.updatedAt)) + '</span>' +
            '<span>Status ' + status + '</span>' +
            '<span>' + (isActive ? 'Active' : 'Inactive') + '</span>' +
          '</p>' +
          '<div class="btn-row">' +
            (!isActive ? '<button class="primary" data-focusable data-action="switch-pl" data-id="' + p.id + '">Select Playlist</button>' : '<span class="chip">Active</span>') +
            '<button data-focusable data-action="rename-pl" data-id="' + p.id + '">Rename</button>' +
            '<button data-focusable data-action="refresh-pl" data-id="' + p.id + '">Refresh Channels</button>' +
            '<button data-focusable data-action="replace-pl" data-id="' + p.id + '">Update URL</button>' +
            '<button class="danger" data-focusable data-action="remove-pl" data-id="' + p.id + '">Remove Playlist</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    return screenShell(
      'Add Playlist',
      'Add your own M3U playlist. Nothing is loaded until you do.',
      '',
      '<div class="panel">' +
        '<h3>M3U URL</h3>' +
        '<div class="form-grid">' +
          '<div class="full"><label>Playlist name</label><input id="m3uName" data-focusable type="text" inputmode="text" enterkeyhint="done" placeholder="My TV list" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
          '<div class="full"><label>M3U/M3U8 URL</label><input id="m3uUrl" data-focusable type="url" inputmode="url" enterkeyhint="done" placeholder="https://…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
        '</div>' +
        '<div class="btn-row"><button class="primary" data-focusable data-action="import-url">ADD PLAYLIST</button></div>' +
        '<div class="status-line" id="importStatus"></div><div class="loading-bar" id="importLoading"><span></span></div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3>Local file</h3>' +
        '<p class="help">Choose an M3U file when this TV provides a file picker.</p>' +
        '<div class="form-grid">' +
          '<div class="full"><label>Playlist name</label><input id="m3uFileName" data-focusable type="text" inputmode="text" enterkeyhint="done" placeholder="Local playlist" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
          '<div class="full"><label>M3U file</label><input id="m3uFile" data-focusable type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain"></div>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3>Paste playlist</h3>' +
        '<p class="help">Paste the M3U text. One bad line does not discard the rest of the list.</p>' +
        '<div class="form-grid"><div class="full"><label>Playlist name</label><input id="m3uTextName" data-focusable type="text" inputmode="text" enterkeyhint="done" placeholder="Pasted playlist" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
        '<div class="full"><textarea id="m3uText" data-focusable inputmode="text" enterkeyhint="done" placeholder="#EXTM3U" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea></div></div>' +
        '<div class="btn-row"><button class="primary" data-focusable data-action="import-text">Add pasted playlist</button></div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3>Phone / PC</h3>' +
        '<p class="help">Optional helper on your home network.</p>' +
        '<div class="btn-row"><button data-focusable data-action="start-pair">Get pairing code</button></div>' +
        '<div id="pairPanel"></div>' +
      '</div>' +
      '<div class="section-title">Playlists</div>' +
      (rows || '<div class="empty-state"><h3>No playlist added yet</h3><p>The library stays empty until you add an M3U address, file, or pasted list.</p></div>')
    );
  }

  function formatStamp(ts) {
    if (!ts) return 'Not yet';
    var d = new Date(ts);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var hours = d.getHours();
    var time;
    try {
      if (ElionStorage.getSettings().clockFormat === '12') {
        var suffix = hours >= 12 ? 'PM' : 'AM';
        var h12 = hours % 12;
        if (!h12) h12 = 12;
        time = h12 + ':' + pad(d.getMinutes()) + ' ' + suffix;
      } else {
        time = pad(hours) + ':' + pad(d.getMinutes());
      }
    } catch (e) {
      time = pad(hours) + ':' + pad(d.getMinutes());
    }
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ' ' + time;
  }

  function renderSettings() {
    return screenShell('Settings', 'Choose a section', '', ElionSettingsUI.render(settingsTab));
  }

  function renderAbout() {
    return screenShell('About', '', '', '<div class="panel">' + ElionSettingsUI.info() + '</div>');
  }

  /* ---------------- WIRING ---------------- */
  function playFromList(ch, root) {
    var browse = [];
    try { browse = ElionChannels.getBrowseList(); } catch (e) { browse = []; }
    var found = false;
    for (var i = 0; i < browse.length; i++) {
      if (browse[i] && browse[i].id === ch.id) { found = true; break; }
    }
    if (!found) {
      var ids = [];
      root.querySelectorAll('[data-action="play"]').forEach(function (b) { ids.push(b.getAttribute('data-id')); });
      if (ids.length) {
        ElionChannels.setBrowseList(ids.map(function (id) { return ElionPlaylists.getChannelById(id); }).filter(Boolean), current);
      }
    }
    if (global.ElionApp) ElionApp.openPlayer(ch);
  }

  function wireListGrowth(root) {
    if (!root || root.getAttribute('data-growth') === '1') return;
    root.setAttribute('data-growth', '1');
    root.addEventListener('focusin', function (e) {
      var wrap = e.target && e.target.closest ? (e.target.closest('.channel-row-wrap') || e.target.closest('.movie-card-wrap')) : null;
      if (!wrap || !wrap.parentElement) return;
      var total = parseInt(wrap.parentElement.getAttribute('data-total') || '0', 10);
      var shown = context.visibleCount || LIST_STEP;
      if (!total || shown >= total) return;
      var children = wrap.parentElement.children;
      var idx = -1;
      for (var i = 0; i < children.length; i++) {
        if (children[i] === wrap) { idx = i; break; }
      }
      if (idx < shown - 8) return;
      var key = wrap.parentElement.getAttribute('data-list-key');
      var list = key ? listCache[key] : null;
      var nextCount = Math.min(total, shown + LIST_STEP);
      if (list && wrap.classList.contains('channel-row-wrap') && ElionUI.appendHtml) {
        var extra = list.slice(shown, nextCount);
        if (!extra.length) return;
        ElionUI.appendHtml(wrap.parentElement, extra.map(function (ch) { return ElionUI.channelRow(ch); }).join(''));
        context.visibleCount = Math.min(total, shown + extra.length);
        var hint = wrap.parentElement.nextElementSibling;
        if (hint && hint.classList && hint.classList.contains('list-more-hint')) {
          if (context.visibleCount >= total) hint.parentNode.removeChild(hint);
          else hint.textContent = context.visibleCount + ' of ' + total + ' shown. Press Down to load more.';
        }
        ElionUI.bindChannelList(wrap.parentElement, function (ch) { playFromList(ch, root); });
        wireActions(wrap.parentElement);
        return;
      }
      context.visibleCount = nextCount;
      var idBtn = wrap.querySelector('[data-id]');
      render({ focusChannelId: idBtn ? idBtn.getAttribute('data-id') : null });
    });
  }

  function wirePlaylistFile(root) {
    var input = root.querySelector('#m3uFile');
    if (!input || input.getAttribute('data-wired') === '1') return;
    input.setAttribute('data-wired', '1');
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) doImportFile(file);
    });
  }

  function wireChannelSearch(root) {
    var input = root.querySelector('#channelSearch');
    if (!input || input.getAttribute('data-wired') === '1') return;
    input.setAttribute('data-wired', '1');
    var apply = ElionUtils.debounce(function () {
      context.channelQuery = input.value || '';
      context.visibleCount = LIST_STEP;
      context.keepSearchFocus = true;
      render(null);
    }, 180);
    input.addEventListener('input', apply);
  }

  function wire(root) {
    root.querySelectorAll('[data-nav]').forEach(function (el) {
      el.addEventListener('click', function () { navigate(el.getAttribute('data-nav')); });
    });
    ElionUI.bindChannelList(root, function (ch) { playFromList(ch, root); });
    wireListGrowth(root);
    wireChannelSearch(root);
    wirePlaylistFile(root);
    wireActions(root);

    var themeSelect = root.querySelector('#setTheme');
    if (themeSelect && !themeSelect.getAttribute('data-bound')) {
      themeSelect.setAttribute('data-bound', '1');
      themeSelect.addEventListener('change', function () {
        ElionStorage.saveSettings({ theme: themeSelect.value === 'light' ? 'light' : 'dark' });
        ElionUI.applyAppearance();
      });
    }

    var groupFilter = root.querySelector('#groupFilter');
    if (groupFilter) {
      groupFilter.addEventListener('change', function () {
        navigate('channels', { group: groupFilter.value || 'all', page: 0 });
      });
    }

    var searchInput = root.querySelector('#searchInput');
    if (searchInput) {
      var liveSearch = ElionUtils.debounce(function () {
        context.query = searchInput.value || '';
        var list = context.query ? ElionPlaylists.searchChannels(context.query) : [];
        if (list.length) ElionChannels.setBrowseList(list, 'search');
        var box = document.getElementById('searchResults');
        var count = document.getElementById('searchCount');
        if (count) count.textContent = context.query ? (list.length + ' found') : (st().channelCount + ' channels');
        if (!box) return;
        if (!context.query) {
          box.innerHTML = '<div class="empty-state empty-state-soft"><h3>Search your channels</h3><p>Type part of a channel name. Results appear as you type.</p></div>';
          return;
        }
        if (!list.length) {
          box.innerHTML = '<div class="empty-state"><h3>No channels found</h3><p>Try a shorter name or check the spelling.</p></div>';
          return;
        }
        box.innerHTML = listHtml(list);
        ElionUI.bindChannelList(box, function (ch) {
          if (global.ElionApp) ElionApp.openPlayer(ch);
        });
        wireActions(box);
        wireListGrowth(box);
      }, 160);
      searchInput.addEventListener('input', liveSearch);
      searchInput.addEventListener('keydown', function (e) {
        if ((e.keyCode || e.which) !== 13 && e.key !== 'Enter') return;
        // Only submit after the LG IME is up (first OK opens the keyboard)
        if (ElionFocus.isKeyboardVisible && !ElionFocus.isKeyboardVisible()) return;
        e.preventDefault();
        handleAction('run-search', searchInput);
      });
    }
  }

  function wireActions(root) {
    if (!root) return;
    root.querySelectorAll('[data-action]').forEach(function (el) {
      var action = el.getAttribute('data-action');
      if (action === 'play') return; // handled by bindChannelList
      if (el.getAttribute('data-bound') === '1') return;
      el.setAttribute('data-bound', '1');
      el.addEventListener('click', function () { handleAction(action, el); });
    });
  }

  function statusEl(msg, ok) {
    var el = document.getElementById('settingsStatus') || document.getElementById('importStatus') || document.getElementById('epgStatus');
    if (!el) return;
    el.className = 'status-line ' + (ok ? 'ok' : (ok === false ? 'error' : ''));
    el.textContent = msg;
  }

  function handleAction(action, el) {
    if (action === 'go-back') {
      if (global.ElionApp && ElionApp.handleBack) return ElionApp.handleBack();
      return goBack();
    }
    if (action === 'reload-iptv') return reloadActivePlaylist();
    if (action === 'go-playlists') return navigate('playlists');
    if (action === 'go-channels') return navigate('channels');
    if (action === 'go-live') return navigate('live');
    if (action === 'go-series') return navigate('series');
    if (action === 'open-category') {
      var openedGroup = el.getAttribute('data-group') || '';
      if (openedGroup && ElionStorage.getSettings().rememberLastChannel) {
        ElionStorage.set('lastCategory', openedGroup);
      }
      return navigate('category', { group: openedGroup, returnTo: current === 'categories' ? 'categories' : 'live' });
    }
    if (action === 'update-active-playlist') {
      var updating = ElionPlaylists.getPlaylistById(st().activePlaylistId);
      if (!updating) return navigate('playlists');
      if (updating.sourceType === 'url' && updating.url) {
        return ElionUI.promptDialog('New M3U address', updating.url, 'Update Playlist', {
          inputType: 'url', inputMode: 'url', maxlength: 2000
        }).then(function (newUrl) {
          if (!newUrl) return;
          if (!ElionUtils.isValidHttpUrl(newUrl)) {
            ElionUI.notify('That address does not look right. Use a link that starts with http:// or https://', 'error');
            return;
          }
          ElionUI.setLoading(true);
          return ElionPlaylists.replacePlaylistUrl(updating.id, newUrl, updating.name).then(function (r) {
            ElionUI.setLoading(false);
            if (!r || !r.ok) {
              ElionUI.notify((r && r.errors && r.errors[0]) || 'Unable to load the playlist. Please check the address and try again.', 'error');
              return;
            }
            afterImportSuccess(r.channelCount, r.playlist);
          });
        });
      }
      return navigate('playlists');
    }
    if (action === 'remove-active-playlist') {
      var activePl = ElionPlaylists.getPlaylistById(st().activePlaylistId);
      if (!activePl) {
        ElionUI.toast('No playlist is selected');
        return navigate('playlists');
      }
      return ElionUI.confirmDialog(
        'Remove the active playlist "' + activePl.name + '"? Other playlists are kept.',
        'Remove Playlist'
      ).then(function (ok) {
        if (!ok) return;
        ElionPlaylists.removePlaylist(activePl.id);
        ElionUI.toast('Playlist removed');
        if (global.ElionApp) ElionApp.updateChrome('home');
        navigate('home', {}, { replace: true });
      });
    }
    if (action === 'open-series') return navigate('seriesDetail', { seriesKey: el.getAttribute('data-series') || '' });
    if (action === 'drop-missing-favs') {
      var kept = ElionFavorites.getIds().filter(function (id) { return !!ElionPlaylists.getChannelById(id); });
      ElionStorage.saveFavorites(kept);
      ElionUI.toast('Unavailable favorites removed');
      return render();
    }
    if (action === 'clear-favorites') {
      return ElionUI.confirmDialog('Clear all favorites?', 'Clear Favorites').then(function (ok) {
        if (!ok) return;
        ElionStorage.saveFavorites([]);
        ElionUI.toast('Favorites cleared');
        render(null);
      });
    }
    if (action === 'page') return navigate('channels', { page: parseInt(el.getAttribute('data-page'), 10) || 0, group: context.group || 'all' });
    if (action === 'settings-tab') { settingsTab = el.getAttribute('data-tab') || 'general'; return navigate('settings', { tab: settingsTab }); }
    if (action === 'set-audio-track') {
      var audioResult = ElionPlayer.selectAudioTrack(el.getAttribute('data-index'));
      ElionUI.toast(audioResult.message || (audioResult.ok ? 'Audio updated' : 'Audio track unavailable'));
      if (audioResult.ok) return navigate('settings', { tab: 'playback' });
      return;
    }
    if (action === 'set-subtitle-track') {
      var subResult = ElionPlayer.selectTextTrack(el.getAttribute('data-index'));
      ElionUI.toast(subResult.message || (subResult.ok ? 'Subtitles updated' : 'Subtitles unavailable'));
      if (subResult.ok) return navigate('settings', { tab: 'playback' });
      return;
    }
    if (action === 'set-sort') {
      var sortKey = el.getAttribute('data-sort');
      ElionStorage.saveSettings({ channelSort: sortKey });
      var sortLabel = sortKey === 'alpha' ? 'A–Z' : (sortKey === 'category' ? 'By category' : 'Default order');
      ElionUI.toast('Channel list sorted: ' + sortLabel);
      return navigate('channels', { group: context.group || 'all', page: 0 });
    }
    if (action === 'apply-group') {
      var sel = document.getElementById('groupFilter');
      return navigate('channels', { group: sel ? sel.value : 'all', page: 0 });
    }
    if (action === 'toggle-fav') {
      var favId = el.getAttribute('data-id');
      if (!favId) return;
      var nowOn = ElionFavorites.toggle(favId);
      ElionUI.toast(nowOn ? 'Added to favorites' : 'Removed from favorites');
      if (current === 'favorites' && !nowOn) {
        return render({ focusChannelId: favId });
      }
      if (el && el.classList) {
        el.classList.toggle('on', nowOn);
        el.setAttribute('title', nowOn ? 'Remove favorite' : 'Add favorite');
        el.setAttribute('aria-label', nowOn ? 'Remove favorite' : 'Add favorite');
      }
      return;
    }
    if (action === 'run-search') {
      return navigate('search', { query: ((document.getElementById('searchInput') || {}).value || '') });
    }
    if (action === 'clear-search') {
      return navigate('search', { query: '' });
    }
    if (action === 'clear-recents') {
      return ElionUI.confirmDialog('Clear recently watched history?', 'Clear history').then(function (ok) {
        if (ok) { ElionStorage.clearRecents(); ElionUI.toast('History cleared'); render(null); }
      });
    }
    if (action === 'import-url') return doImportUrl();
    if (action === 'import-text') return doImportText();
    if (action === 'refresh-pl') {
      var refreshId = el.getAttribute('data-id');
      var refreshPl = ElionPlaylists.getPlaylistById(refreshId);
      if (!refreshPl || refreshPl.sourceType !== 'url' || !refreshPl.url) {
        ElionUI.toast('Refresh is available for playlists added from a web address.');
        return;
      }
      if (playlistRefreshBusy) {
        ElionUI.toast('Refreshing is already in progress.');
        return;
      }
      playlistRefreshBusy = true;
      setReloadLabel(true);
      ElionUI.setLoading(true);
      statusEl('Refreshing...');
      return ElionPlaylists.refreshPlaylist(refreshId).then(function (r) {
        playlistRefreshBusy = false;
        setReloadLabel(false);
        ElionUI.setLoading(false);
        if (r.superseded) return;
        if (r.ok) {
          ElionUI.notify('Channels updated · ' + r.channelCount + ' channels', 'success');
        } else if (r.errors && /already in progress/i.test(r.errors[0] || '')) {
          ElionUI.toast('Refreshing is already in progress.');
        } else {
          ElionUI.toast('Could not refresh the playlist. Your saved channels are still available.', 'error');
        }
        render();
      }).catch(function () {
        playlistRefreshBusy = false;
        setReloadLabel(false);
        ElionUI.setLoading(false);
        ElionUI.toast('Could not refresh the playlist. Your saved channels are still available.', 'error');
      });
    }
    if (action === 'switch-pl') {
      var sid = el.getAttribute('data-id');
      var sw = ElionPlaylists.setActivePlaylist(sid);
      if (sw.ok) {
        ElionUI.toast('Playlist selected. Opening channels…');
        if (global.ElionApp) ElionApp.updateChrome('channels');
        return navigate('channels');
      }
      ElionUI.toast(sw.error || 'Could not select that playlist.');
      return render();
    }
    if (action === 'replace-pl') {
      var repId = el.getAttribute('data-id');
      var pl = ElionPlaylists.getPlaylistById(repId);
      return ElionUI.promptDialog(
        'Enter the new playlist address. Your channel list will be updated.',
        (pl && pl.url) || '',
        'Update Playlist',
        { inputType: 'url', inputMode: 'url', maxlength: 2000 }
      ).then(function (newUrl) {
        if (!newUrl) return;
        if (!ElionUtils.isValidHttpUrl(newUrl)) {
          ElionUI.toast('That address does not look right. Use a link that starts with http:// or https://');
          return;
        }
        ElionUI.setLoading(true);
        statusEl('Updating playlist…');
        return ElionPlaylists.replacePlaylistUrl(repId, newUrl).then(function (r) {
          ElionUI.setLoading(false);
          if (!r.ok) {
            statusEl('Unable to load the playlist. Please check the address and try again.', false);
            ElionUI.toast('Unable to load the playlist. Please check the address and try again.');
            return;
          }
          statusEl('Playlist updated · ' + r.channelCount + ' channels', true);
          ElionUI.toast('Playlist updated successfully.');
          render();
        });
      });
    }
    if (action === 'rename-pl') {
      var id = el.getAttribute('data-id');
      var cur = ElionPlaylists.getPlaylistById(id);
      return ElionUI.promptDialog('New playlist name', (cur && cur.name) || '', 'Rename').then(function (name) {
        if (name) {
          ElionPlaylists.renamePlaylist(id, name);
          ElionUI.toast('Playlist renamed');
          render();
        }
      });
    }
    if (action === 'default-pl') {
      var did = el.getAttribute('data-id');
      ElionPlaylists.setActivePlaylist(did);
      ElionUI.toast('Active playlist set');
      return render();
    }
    if (action === 'remove-pl') {
      var rid = el.getAttribute('data-id');
      var doomed = ElionPlaylists.getPlaylistById(rid);
      var label = doomed && doomed.name ? ('"' + doomed.name + '"') : 'this playlist';
      return ElionUI.confirmDialog(
        'Remove ' + label + ' and all of its channels? This cannot be undone.',
        'Remove Playlist'
      ).then(function (ok) {
        if (ok) {
          ElionPlaylists.removePlaylist(rid);
          ElionUI.toast('Playlist removed');
          if (global.ElionApp) ElionApp.updateChrome('home');
          navigate('home', {}, { replace: true });
        }
      });
    }
    if (action === 'start-pair' || action === 'start-pair-settings') return startPair(document.getElementById('pairPanel'));
    if (action === 'pair-disconnect') {
      ElionPairing.stop();
      ElionUI.toast('Pairing session cleared');
      var panel = document.getElementById('pairPanel');
      if (panel) panel.innerHTML = '';
      return;
    }
    if (action === 'load-epg') return loadEpgUrl();
    if (action === 'refresh-epg') return refreshEpg();
    if (action === 'save-epg-offset') return saveEpgOffset();
    if (action === 'load-epg-text') return loadEpgText();
    if (action === 'clear-epg') {
      ElionStorage.saveEpgCache({ updatedAt: 0, programmes: {}, channels: {} });
      ElionUI.toast('EPG cleared');
      return render();
    }
    if (action === 'save-settings-general') return saveGeneral();
    if (action === 'save-settings-appearance') return saveAppearance();
    if (action === 'save-settings-content') return saveContent();
    if (action === 'save-settings-epg') return saveEpgSettings();
    if (action === 'save-settings-time') return saveTime();
    if (action === 'save-settings-playback') return savePlayback();
    if (action === 'refresh-epg-settings') return refreshEpgFromSettings();
    if (action === 'save-settings-parental') return saveParental();
    if (action === 'save-settings-misc') return saveMisc();
    if (action === 'set-lang') {
      ElionStorage.saveSettings({ language: el.getAttribute('data-lang') });
      ElionUI.toast('Language: ' + el.getAttribute('data-lang'));
      return render();
    }
    if (action === 'operator-select') {
      return ElionUI.promptDialog('Operator / provider display name', ElionStorage.getSettings().operatorName || '', 'Operator').then(function (v) {
        if (v != null) {
          ElionStorage.saveSettings({ operatorName: v.trim(), operatorId: v.trim() ? ElionUtils.hashString(v.trim()) : '' });
          render();
        }
      });
    }
    if (action === 'operator-clear') {
      ElionStorage.saveSettings({ operatorName: '', operatorId: '' });
      ElionUI.toast('Operator cleared');
      return render();
    }
    if (action === 'pin-create') {
      return ElionUI.promptDialog('Create a 4–8 digit PIN', '', 'Set PIN', { inputType: 'password', maxlength: 8 }).then(function (pin) {
        if (pin == null) return;
        return ElionUI.promptDialog('Enter the same PIN again', '', 'Confirm PIN', { inputType: 'password', maxlength: 8 }).then(function (again) {
          if (again == null) return;
          if (String(pin) !== String(again)) {
            ElionUI.toast('The PIN entries do not match');
            return;
          }
          return ElionParental.setPin(pin).then(function (r) {
            ElionUI.toast(r.ok ? 'PIN saved' : r.error);
            render(null);
          });
        });
      });
    }
    if (action === 'pin-change') {
      return ElionUI.promptDialog('Current PIN', '', 'Change PIN', { inputType: 'password', maxlength: 8 }).then(function (oldPin) {
        if (oldPin == null) return;
        return ElionUI.promptDialog('New PIN (4–8 digits)', '', 'New PIN', { inputType: 'password', maxlength: 8 }).then(function (newPin) {
          if (newPin == null) return;
          return ElionUI.promptDialog('Enter the new PIN again', '', 'Confirm PIN', { inputType: 'password', maxlength: 8 }).then(function (again) {
            if (again == null) return;
            if (String(newPin) !== String(again)) {
              ElionUI.toast('The PIN entries do not match');
              return;
            }
            return ElionParental.changePin(oldPin, newPin).then(function (r) {
              ElionUI.toast(r.ok ? 'PIN changed' : r.error);
              render();
            });
          });
        });
      });
    }
    if (action === 'pin-lock-now') {
      ElionParental.clearSession();
      ElionUI.toast('Session locked');
      return;
    }
    if (action === 'lock-channels-match') {
      var q = ((document.getElementById('lockChannelQuery') || {}).value || '').trim().toLowerCase();
      if (!q) return ElionUI.toast('Enter match text');
      var ids = st().channels.filter(function (c) {
        return (c.name || '').toLowerCase().indexOf(q) !== -1;
      }).map(function (c) { return c.id; });
      var locked = ElionStorage.getSettings().lockedChannels || [];
      ids.forEach(function (id) { if (locked.indexOf(id) === -1) locked.push(id); });
      ElionStorage.saveSettings({ lockedChannels: locked });
      ElionUI.toast('Locked ' + ids.length + ' channel(s)');
      return render();
    }
    if (action === 'unlock-all-channels') {
      ElionStorage.saveSettings({ lockedChannels: [] });
      ElionUI.toast('Channel locks cleared');
      return render();
    }
    if (action === 'net-diag') return runDiag();
    if (action === 'clear-cache') {
      ElionStorage.saveEpgCache({ updatedAt: 0, programmes: {}, channels: {} });
      ElionUI.toast('Cache cleared');
      statusEl('EPG cache cleared', true);
      return;
    }
    if (action === 'reset-settings') {
      return ElionUI.confirmDialog('Reset all settings to defaults? Playlists are kept.', 'Reset').then(function (ok) {
        if (!ok) return;
        var pinHash = ElionStorage.getSettings().parentalPinHash;
        ElionStorage.set('settings', Object.assign(ElionStorage.defaultSettings(), { parentalPinHash: pinHash }));
        ElionUI.applyAppearance();
        ElionUI.toast('Settings reset');
        render();
      });
    }
    if (action === 'clear-data') {
      return ElionUI.confirmDialog('Delete all playlists, channels, favorites and recents?', 'Clear data').then(function (ok) {
        if (!ok) return;
        ElionPlaylists.clearAll();
        ElionStorage.saveFavorites([]);
        ElionStorage.clearRecents();
        ElionStorage.saveEpgCache({ updatedAt: 0, programmes: {}, channels: {} });
        ElionUI.toast('Data cleared');
        navigate('home');
      });
    }
  }

  function saveGeneral() {
    var remember = val('setRemember') !== '0';
    ElionStorage.saveSettings({
      theme: val('setTheme') === 'light' ? 'light' : 'dark',
      companionBaseUrl: val('setCompanion'),
      udpProxyEnabled: val('setUdp') === '1',
      udpProxyAddress: val('setUdpHost'),
      udpProxyPort: val('setUdpPort'),
      rememberLastChannel: remember
    });
    if (!remember) {
      ElionStorage.set('lastChannelId', '');
      ElionStorage.set('lastCategory', '');
    }
    ElionUI.applyAppearance();
    statusEl('General settings saved.', true);
    ElionUI.toast('Saved');
    render();
  }

  function saveEpgSettings() {
    var offset = parseInt(val('setEpgOffset'), 10);
    var url = val('setEpgUrl');
    if (url && !ElionUtils.isValidHttpUrl(url)) {
      statusEl('Enter an http or https XMLTV address, or leave it empty.', false);
      return;
    }
    ElionStorage.saveSettings({
      epgSourceUrl: url,
      epgAutoRefresh: val('setEpgAuto') === '1',
      epgOffsetMinutes: isFinite(offset) ? Math.max(-720, Math.min(720, offset)) : 0
    });
    statusEl('EPG settings saved.', true);
    ElionUI.toast('Saved');
  }

  function refreshEpgFromSettings() {
    var url = val('setEpgUrl') || ElionStorage.getSettings().epgSourceUrl;
    if (!ElionUtils.isValidHttpUrl(url)) {
      statusEl('Save an XMLTV address before refreshing the guide.', false);
      return;
    }
    statusEl('Refreshing the guide. Live TV stays available.');
    ElionEPG.loadFromUrl(url).then(function () {
      ElionStorage.saveSettings({ epgSourceUrl: url });
      ElionUI.toast('Guide updated');
      if (getCurrent() === 'settings') render();
    }).catch(function (err) {
      statusEl((err && err.message) || 'The guide could not be refreshed.', false);
    });
  }

  function saveTime() {
    ElionStorage.saveSettings({ clockFormat: val('setClock') === '12' ? '12' : '24' });
    if (global.ElionApp && ElionApp.updateClock) ElionApp.updateClock();
    statusEl('Time format saved.', true);
    ElionUI.toast('Saved');
  }

  function saveAppearance() {
    ElionStorage.saveSettings({
      theme: val('setTheme'),
      textSize: val('setText'),
      channelListLayout: val('setLayout'),
      showLogos: val('setLogos') === '1',
      animations: val('setAnim') === '1',
      showChannelNumbers: val('setNumbers') === '1',
      clockFormat: document.getElementById('setClock') ? (val('setClock') === '12' ? '12' : '24') : ElionStorage.getSettings().clockFormat
    });
    if (global.ElionApp && ElionApp.updateClock) ElionApp.updateClock();
    ElionUI.applyAppearance();
    statusEl('Appearance saved.', true);
    ElionUI.toast('Appearance applied');
    render();
  }

  function saveContent() {
    var hidden = [];
    document.querySelectorAll('[data-show-group]').forEach(function (cb) {
      if (!cb.checked) hidden.push(cb.getAttribute('data-show-group'));
    });
    var sort = val('setSort');
    if (sort !== 'alpha' && sort !== 'category') sort = 'playlist';
    ElionStorage.saveSettings({
      channelSort: sort,
      hiddenGroups: hidden,
      textSize: val('setText') || 'medium',
      channelListLayout: val('setLayout') === 'compact' ? 'compact' : 'detailed',
      showLogos: val('setLogos') !== '0',
      showChannelNumbers: val('setNumbers') !== '0',
      animations: val('setAnim') !== '0'
    });
    ElionUI.applyAppearance();
    statusEl('Content settings saved.', true);
    ElionUI.toast('Saved');
    render();
  }

  function savePlayback() {
    var buf = parseInt(val('setBuffer'), 10);
    ElionStorage.saveSettings({
      autoplayNext: val('setAutoplay') === '1',
      bufferSeconds: isFinite(buf) ? ElionUtils.clamp(buf, 1, 30) : 3,
      playerControlsPinned: val('setControls') === 'pinned'
    });
    statusEl('Playback settings saved.', true);
    ElionUI.toast('Saved');
  }

  function saveParental() {
    var lockedGroups = [];
    document.querySelectorAll('[data-lock-group]').forEach(function (cb) {
      if (cb.checked) lockedGroups.push(cb.getAttribute('data-lock-group'));
    });
    ElionStorage.saveSettings({
      parentalEnabled: val('setParentalOn') === '1',
      lockedGroups: lockedGroups
    });
    statusEl('Parental settings saved.', true);
    ElionUI.toast('Saved');
  }

  function saveMisc() {
    var buf = parseInt(val('setBuffer'), 10);
    ElionStorage.saveSettings({
      rememberLastChannel: document.getElementById('setRemember') ? val('setRemember') === '1' : ElionStorage.getSettings().rememberLastChannel,
      bufferSeconds: document.getElementById('setBuffer') ? (isFinite(buf) ? ElionUtils.clamp(buf, 1, 30) : 3) : ElionStorage.getSettings().bufferSeconds
    });
    statusEl('Preferences saved.', true);
    ElionUI.toast('Saved');
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function clearImportLoading() {
    ElionUI.setLoading(false);
    var loading = document.getElementById('importLoading');
    if (loading) loading.classList.remove('active');
  }

  function doImportUrl() {
    var url = val('m3uUrl');
    var name = val('m3uName');
    var loading = document.getElementById('importLoading');
    if (!url) {
      statusEl('Please enter your playlist address.', false);
      ElionUI.toast('Please enter your playlist address.');
      return;
    }
    if (!ElionUtils.isValidHttpUrl(url)) {
      statusEl('Unable to load the playlist. Please check the address and try again.', false);
      ElionUI.toast('Unable to load the playlist. Please check the address and try again.');
      return;
    }
    statusEl('Loading your playlist…');
    if (loading) loading.classList.add('active');
    ElionUI.setLoading(true);
    ElionPlaylists.importFromUrl(url, name).then(function (r) {
      clearImportLoading();
      if (!r.ok) {
        statusEl((r.errors && r.errors[0]) || 'Unable to load the playlist. Please check the address and try again.', false);
        ElionUI.notify((r.errors && r.errors[0]) || 'Unable to load the playlist. Please check the address and try again.', 'error');
        return;
      }
      afterImportSuccess(r.channelCount, r.playlist);
    }).catch(function (err) {
      clearImportLoading();
      if (err && /superseded/i.test(err.message || '')) return;
      var e = ElionErrors.show(err);
      statusEl(e.message, false);
    });
  }

  function doImportFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      var fallback = String(file.name || 'Local playlist').replace(/\.m3u8?$/i, '');
      var name = val('m3uFileName') || fallback || 'Local playlist';
      statusEl('Reading the selected file…');
      var loading = document.getElementById('importLoading');
      if (loading) loading.classList.add('active');
      ElionUI.setLoading(true);
      ElionPlaylists.importFromTextAsync(text, {
        name: name,
        sourceType: 'file',
        url: '',
        fileName: file.name || 'playlist.m3u'
      }).then(function (r) {
        clearImportLoading();
        if (!r.ok) {
          statusEl('That file does not look like a valid playlist.', false);
          ElionUI.notify('That file does not look like a valid playlist.', 'error');
          return;
        }
        afterImportSuccess(r.channelCount, r.playlist);
      }).catch(function (err) {
        clearImportLoading();
        statusEl((err && err.message) || 'The file could not be imported.', false);
      });
    };
    reader.onerror = function () {
      statusEl('This TV could not read that file. Paste the playlist text instead.', false);
    };
    try {
      reader.readAsText(file, 'UTF-8');
    } catch (e) {
      statusEl('A file picker is not available on this TV. Paste the playlist text instead.', false);
    }
  }

  function doImportText() {
    var text = ((document.getElementById('m3uText') || {}).value || '');
    var name = val('m3uTextName') || 'Pasted playlist';
    if (!String(text).trim()) {
      statusEl('Paste your playlist text first.', false);
      ElionUI.toast('Paste your playlist text first.');
      return;
    }
    ElionUI.setLoading(true);
    statusEl('Reading your playlist…');
    ElionPlaylists.importFromTextAsync(text, { name: name, sourceType: 'paste' }).then(function (r) {
      clearImportLoading();
      if (!r.ok) {
        ElionErrors.show(ElionErrors.create(r.errors && /empty/i.test(r.errors[0]) ? 'EMPTY_PLAYLIST' : 'INVALID_PLAYLIST', (r.errors || []).join(' ')));
        statusEl('That text does not look like a valid playlist. Please check and try again.', false);
        ElionUI.notify('That text does not look like a valid playlist. Please check and try again.', 'error');
        return;
      }
      afterImportSuccess(r.channelCount, r.playlist);
    }).catch(function (err) {
      clearImportLoading();
      var e = ElionErrors.fromException(err, 'INVALID_PLAYLIST');
      statusEl(e.message, false);
      ElionUI.notify(e.message, 'error');
    });
  }

  function startPair(panel) {
    if (!panel) return;
    panel.innerHTML = '<p class="help">Connecting to companion…</p>';
    ElionPairing.startSession(function (session) {
      if (!session) return;
      var qr = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(session.pairUrl || '');
      panel.innerHTML =
        '<div class="pair-code">' + ElionUtils.escapeHtml(session.code) + '</div>' +
        '<div class="qr-box"><img alt="QR" src="' + qr + '"></div>' +
        '<p class="help" style="text-align:center">Open:<br><strong>' + ElionUtils.escapeHtml(session.pairUrl || '') + '</strong></p>' +
        '<div class="status-line" style="text-align:center">Status: ' + ElionUtils.escapeHtml(session.status) +
          (session.error ? (' · ' + ElionUtils.escapeHtml(session.error)) : '') +
          (session.result && session.result.ok ? (' · Imported ' + session.result.channelCount + ' channels') : '') +
        '</div>';
      if (session.status === 'done') {
        var count = session.result && session.result.channelCount ? session.result.channelCount : 0;
        setTimeout(function () { afterImportSuccess(count || st().channelCount); }, 500);
      }
    }).then(function (res) {
      if (!res.ok) panel.innerHTML = '<div class="status-line error">' + ElionUtils.escapeHtml(res.error) + '</div>';
    });
  }

  function finishEpgLoad() {
    ElionUI.toast('Guide updated');
    if (getCurrent() === 'epg') render();
  }

  function loadEpgUrl() {
    var url = val('epgUrl');
    if (!ElionUtils.isValidHttpUrl(url)) { statusEl('Enter a valid XMLTV URL.', false); return; }
    statusEl('Loading the guide. Live TV stays available.');
    ElionEPG.loadFromUrl(url).then(finishEpgLoad).catch(function (err) {
      statusEl(err.message || String(err), false);
      ElionUI.toast('The guide could not be loaded. Live TV is unchanged.');
    });
  }

  function refreshEpg() {
    var cache = ElionStorage.getEpgCache() || {};
    var url = val('epgUrl') || (cache.source && String(cache.source).indexOf('http') === 0 ? cache.source : '');
    if (!ElionUtils.isValidHttpUrl(url)) {
      statusEl('Add an XMLTV address before refreshing the guide.', false);
      return;
    }
    statusEl('Refreshing the guide. Live TV stays available.');
    ElionEPG.loadFromUrl(url).then(finishEpgLoad).catch(function (err) {
      statusEl(err.message || String(err), false);
      ElionUI.toast('The guide could not be refreshed. The previous guide is unchanged.');
    });
  }

  function saveEpgOffset() {
    var n = parseInt(val('epgOffset'), 10);
    if (!isFinite(n)) n = 0;
    n = Math.max(-720, Math.min(720, n));
    ElionStorage.saveSettings({ epgOffsetMinutes: n });
    ElionUI.toast('Guide time offset saved');
    if (getCurrent() === 'epg') render();
  }

  function loadEpgText() {
    var text = ((document.getElementById('epgText') || {}).value || '');
    try {
      ElionEPG.loadFromText(text, 'pasted');
      ElionUI.toast('EPG imported');
      render();
    } catch (e) {
      statusEl(e.message || String(e), false);
    }
  }

  function runDiag() {
    var out = document.getElementById('diagOut');
    var lines = [];
    lines.push('Time: ' + new Date().toISOString());
    lines.push('Online: ' + (navigator.onLine ? 'yes' : 'no'));
    lines.push('User agent: ' + navigator.userAgent);
    lines.push('Channels: ' + st().channelCount);
    lines.push('Companion: ' + (ElionStorage.getSettings().companionBaseUrl || '(not set)'));
    if (out) out.textContent = lines.join('\n');
    var base = ElionStorage.getSettings().companionBaseUrl;
    if (!base) { statusEl('Diagnostics listed below. Set companion URL to test relay.', true); return; }
    fetch(base.replace(/\/$/, '') + '/').then(function (res) {
      lines.push('Companion HTTP: ' + res.status);
      if (out) out.textContent = lines.join('\n');
      statusEl('Diagnostics complete.', true);
    }).catch(function (err) {
      lines.push('Companion error: ' + (err.message || err));
      if (out) out.textContent = lines.join('\n');
      statusEl('Companion unreachable.', false);
    });
  }

  // Auto-refresh home when playlists change
  if (global.ElionPlaylists) {
    // deferred bind in app boot via onChange
  }

  global.ElionScreens = {
    navigate: navigate,
    goBack: goBack,
    render: render,
    getCurrent: getCurrent,
    reloadActivePlaylist: reloadActivePlaylist
  };
})(window);
