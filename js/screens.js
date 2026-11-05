(function (global) {
  'use strict';

  var current = 'home';
  var context = {};
  var settingsTab = 'general';

  function navigate(name, ctx) {
    current = name;
    context = ctx || {};
    if (name === 'settings' && ctx && ctx.tab) settingsTab = ctx.tab;
    render(null);
    if (global.ElionApp) ElionApp.updateChrome(name);
    if (name === 'live') {
      setTimeout(function () {
        try {
          if (current !== 'live') return;
          var ch = pickLiveChannel();
          if (ch && global.ElionApp) ElionApp.openPlayer(ch);
        } catch (e) {
          if (global.ElionLog) ElionLog.warn('live autoplay failed', e && e.message);
        }
      }, 120);
    }
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
        if (renderOpts.focusChannelId) focusOpts.channelId = renderOpts.focusChannelId;
        else if (current === 'search' && !(context.query || '').trim()) {
          focusOpts.selector = '#searchInput';
        } else if (current === 'categories') {
          focusOpts.selector = '.category-card';
        } else if (current === 'live' || current === 'channels' || current === 'favorites' ||
                   current === 'recents' || current === 'category' || current === 'search') {
          var lastId = ElionStorage.get('lastChannelId');
          if (lastId) focusOpts.channelId = lastId;
        } else if (current === 'home') {
          focusOpts.selector = '.hub-tile';
        }
        if (ElionFocus.focusPreferred) ElionFocus.focusPreferred(root, focusOpts);
        else ElionFocus.focusFirst(root);
      } catch (f) { /* ignore */ }
    }, 30);
  }

  function screenShell(heading, meta, actionsHtml, bodyHtml) {
    return (
      '<div class="screen-page">' +
        '<header class="screen-header">' +
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
  function hubTile(nav, icon, label, desc, opts) {
    opts = opts || {};
    var extra = opts.more ? ' hub-tile-more' : '';
    var active = opts.active ? ' is-active-tile' : '';
    return (
      '<button class="hub-tile' + extra + active + '" data-focusable data-nav="' + nav + '" type="button">' +
        '<span class="hub-tile-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="hub-tile-label">' + label + '</span>' +
        (desc ? '<span class="hub-tile-desc">' + desc + '</span>' : '') +
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

  function reloadActivePlaylist() {
    if (playlistRefreshBusy) {
      ElionUI.toast('A refresh is already running. Please wait.');
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
    ElionUI.setLoading(true);
    ElionUI.toast('Refreshing playlist…');
    ElionPlaylists.refreshPlaylist(pl.id).then(function (r) {
      playlistRefreshBusy = false;
      ElionUI.setLoading(false);
      if (r && r.ok) {
        ElionUI.toast('Playlist refreshed. ' + (r.channelCount || 0) + ' channels.');
        if (global.ElionApp) ElionApp.updateChrome(current);
        render(null);
        return;
      }
      var raw = (r && r.errors && r.errors[0]) || '';
      var msg = /already in progress/i.test(raw)
        ? 'A refresh is already running. Please wait.'
        : 'Could not refresh the playlist. Your saved channels are still available.';
      ElionUI.toast(msg);
    }).catch(function () {
      playlistRefreshBusy = false;
      ElionUI.setLoading(false);
      ElionUI.toast('Could not refresh the playlist. Your saved channels are still available.');
    });
  }

  function renderHomeHub(extraTop) {
    var s = st();
    var countLabel = s.channelCount
      ? (s.channelCount + (s.channelCount === 1 ? ' channel ready' : ' channels ready'))
      : 'Choose where to go';
    return (
      '<div class="home-hub">' +
        (extraTop || '') +
        '<div class="home-brand-bar">' +
          '<div class="brand-mark lg" aria-hidden="true"></div>' +
          '<div class="home-brand-copy">' +
            '<h2 class="home-title">ELION IPTV</h2>' +
            '<p class="home-sub">' + ElionUtils.escapeHtml(countLabel) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="hub-grid hub-grid-home" role="navigation" aria-label="Main">' +
          hubTile('live', '▶', 'Live TV', 'Start watching now') +
          hubTile('channels', '☰', 'All Channels', 'Browse your full list') +
          hubTile('categories', '▦', 'Categories', 'Browse by group') +
          hubTile('favorites', '★', 'Favorites', 'Channels you marked') +
          hubTile('recents', '↺', 'Recently Watched', 'Jump back in') +
          hubTile('search', '⌕', 'Search', 'Find by channel name') +
          hubTile('epg', '▤', 'TV Guide', 'See what’s on') +
          hubTile('playlists', '＋', 'My Playlists', 'Add or switch lists') +
          hubAction('reload-iptv', '↻', 'Reload IPTV', 'Refresh the active playlist') +
          hubTile('settings', '⚙', 'Settings', 'Picture and options') +
          hubTile('about', 'ℹ', 'About', 'App information') +
        '</div>' +
      '</div>'
    );
  }

  function renderHome() {
    var s = st();
    if (!s.channelCount) return renderWelcome();
    return renderHomeHub('');
  }

  function renderMore() {
    return (
      '<div class="more-hub">' +
        '<div class="toolbar wrap">' +
          '<button data-focusable data-nav="home" type="button">← Back to Home</button>' +
          '<span class="chip">Extra tools</span>' +
        '</div>' +
        '<div class="hub-grid hub-grid-more" role="navigation" aria-label="More">' +
          hubTile('epg', '▤', 'TV Guide', 'See what’s on now') +
          hubTile('search', '⌕', 'Search', 'Find a channel by name') +
          hubTile('playlists', '＋', 'My Playlists', 'Add or switch playlists') +
          hubTile('settings', '⚙', 'Settings', 'Adjust the app') +
          hubTile('about', 'ℹ', 'About', 'App information') +
        '</div>' +
      '</div>'
    );
  }

  function renderWelcome() {
    return (
      '<div class="welcome">' +
        '<div class="brand-mark xl"></div>' +
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

  function afterImportSuccess(channelCount) {
    ElionUI.toast('Your playlist has been added successfully.');
    statusEl('Added ' + channelCount + ' channels. Opening your channel list…', true);
    navigate('channels');
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
  function renderLive() {
    var featured = pickLiveChannel();
    var list = [];
    if (featured) list.push(featured);
    ElionStorage.getRecents().forEach(function (r) {
      var ch = ElionPlaylists.getChannelById(r.id);
      if (ch && (!featured || ch.id !== featured.id)) list.push(ch);
    });
    if (list.length < 12) {
      ElionChannels.getSortedAll().forEach(function (ch) {
        if (list.length >= 40) return;
        if (!list.some(function (x) { return x.id === ch.id; })) list.push(ch);
      });
    }
    if (!list.length) {
      return ElionUI.emptyState(
        'Nothing to watch yet',
        'Add your TV playlist first, then come back here to watch.',
        'ADD PLAYLIST',
        'go-playlists'
      );
    }
    ElionChannels.setBrowseList(list, 'live');
    var nn = featured ? ElionEPG.getNowNext(featured) : { now: null };
    var featuredHtml = featured
      ? (
        '<button class="live-hero" data-focusable data-action="play" data-id="' + ElionUtils.escapeHtml(featured.id) + '" type="button">' +
          '<div class="live-hero-logo">' + ElionUI.channelLogo(featured, 96, { eager: true }) + '</div>' +
          '<div class="live-hero-meta">' +
            '<span class="live-hero-kicker">Now ready</span>' +
            '<h3>' + ElionUtils.escapeHtml(featured.name) + '</h3>' +
            '<p>' + ElionUtils.escapeHtml(featured.group || 'Live TV') +
              (nn.now ? (' · Now: ' + ElionUtils.escapeHtml(nn.now.title)) : '') +
            '</p>' +
            '<span class="live-hero-cta">Press OK to watch · Up/Down changes channel · Back exits</span>' +
          '</div>' +
        '</button>'
      )
      : '';
    return screenShell(
      'Live TV',
      'Full-screen playback opens automatically. Choose another channel below if you prefer.',
      '<button class="primary" data-focusable data-nav="channels">All Channels</button>' +
        '<button data-focusable data-nav="favorites">Favorites</button>' +
        '<button data-focusable data-nav="categories">Categories</button>',
      featuredHtml +
        '<div class="section-title">Quick channels</div>' +
        listHtml(list)
    );
  }

  function renderChannels() {
    var group = context.group || 'all';
    var page = context.page || 0;
    var pageSize = 40;
    var all = ElionChannels.getSortedAll(group === 'all' ? null : group);
    if (!all.length) {
      return ElionUI.emptyState(
        'No channels yet',
        'Add a playlist to fill this list.',
        'ADD PLAYLIST',
        'go-playlists'
      );
    }
    ElionChannels.setBrowseList(all, 'channels');
    var pages = Math.max(1, Math.ceil(all.length / pageSize));
    var slice = all.slice(page * pageSize, page * pageSize + pageSize);
    var cats = st().categories;
    var meta = all.length + ' channels' +
      (group !== 'all' ? (' · ' + group) : '') +
      (pages > 1 ? (' · Page ' + (page + 1) + ' of ' + pages) : '');
    var actions =
      '<button data-focusable data-nav="search">Search</button>' +
      '<button data-focusable data-nav="categories">Categories</button>' +
      '<select id="groupFilter" data-focusable aria-label="Category filter">' +
        '<option value="all"' + (group === 'all' ? ' selected' : '') + '>All categories</option>' +
        cats.map(function (c) {
          return '<option value="' + ElionUtils.escapeHtml(c.name) + '"' + (group === c.name ? ' selected' : '') + '>' + ElionUtils.escapeHtml(c.name) + ' (' + c.count + ')</option>';
        }).join('') +
      '</select>' +
      '<button data-focusable data-action="set-sort" data-sort="playlist">Default</button>' +
      '<button data-focusable data-action="set-sort" data-sort="alpha">A–Z</button>' +
      '<button data-focusable data-action="set-sort" data-sort="category">By category</button>' +
      (page > 0 ? '<button data-focusable data-action="page" data-page="' + (page - 1) + '">Previous</button>' : '') +
      (page + 1 < pages ? '<button data-focusable data-action="page" data-page="' + (page + 1) + '">Next</button>' : '');
    return screenShell('All Channels', meta, actions, listHtml(slice));
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
    var activeGroup = context.highlight || '';
    var cards =
      '<div class="category-grid">' +
        '<button class="category-card category-card-all" data-focusable data-nav="channels" type="button">' +
          '<span class="category-card-icon" aria-hidden="true">☰</span>' +
          '<h3>All Channels</h3>' +
          '<p>' + st().channelCount + ' channel' + (st().channelCount === 1 ? '' : 's') + '</p>' +
        '</button>' +
        cats.map(function (c) {
          var selected = activeGroup && activeGroup === c.name ? ' is-selected' : '';
          return (
            '<button class="category-card' + selected + '" data-focusable data-action="open-category" data-group="' + ElionUtils.escapeHtml(c.name) + '" type="button">' +
              '<span class="category-card-icon" aria-hidden="true">▦</span>' +
              '<h3>' + ElionUtils.escapeHtml(c.name) + '</h3>' +
              '<p>' + c.count + ' channel' + (c.count === 1 ? '' : 's') + '</p>' +
            '</button>'
          );
        }).join('') +
      '</div>';
    return screenShell(
      'Categories',
      cats.length + ' categories · Press OK to open immediately',
      '',
      cards
    );
  }

  function renderCategory() {
    var group = context.group || 'Uncategorized';
    var list = ElionChannels.sortChannels(ElionPlaylists.getChannelsByGroup(group));
    ElionChannels.setBrowseList(list, 'category:' + group);
    var actions =
      '<button data-focusable data-nav="categories">← Categories</button>' +
      '<button data-focusable data-nav="channels">All Channels</button>';
    return screenShell(
      ElionUtils.escapeHtml(group),
      list.length + ' channel' + (list.length === 1 ? '' : 's'),
      actions,
      list.length
        ? listHtml(list)
        : ElionUI.emptyState('No channels found in this category.', 'Try another category or open All Channels.', 'All Channels', 'go-channels')
    );
  }

  function renderFavorites() {
    var list = ElionChannels.sortChannels(ElionFavorites.listChannels());
    if (!list.length) {
      return screenShell(
        'Favorites',
        'Save channels you watch often',
        '<button class="primary" data-focusable data-nav="channels">Browse Channels</button>',
        ElionUI.emptyState(
          'Your favorite channels will appear here.',
          'While watching, press Favorite on the player controls — or use the ★ button beside any channel.',
          'Browse Channels',
          'go-channels'
        )
      );
    }
    ElionChannels.setBrowseList(list, 'favorites');
    return screenShell(
      'Favorites',
      list.length + ' favorite' + (list.length === 1 ? '' : 's') + ' · ★ removes a favorite',
      '<button data-focusable data-nav="channels">All Channels</button>',
      listHtml(list)
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
            ? listHtml(list.slice(0, 100))
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

  function listHtml(list) {
    return '<div class="channel-list" id="listRoot">' + list.map(function (ch) { return ElionUI.channelRow(ch); }).join('') + '</div>';
  }

  /* ---------------- EPG ---------------- */
  function renderEpg() {
    var channels = ElionChannels.getSortedAll().slice(0, 25);
    var guide = ElionEPG.getGuideForChannels(channels, 5);
    var cache = ElionStorage.getEpgCache();
    return (
      '<div class="toolbar wrap"><button data-focusable data-nav="home">← Home</button></div>' +
      '<div class="panel">' +
        '<h3>TV Guide</h3>' +
        '<p class="help">Optional programme guide. Add a guide file from your provider if you have one — watching still works without it.</p>' +
        '<div class="form-grid">' +
          '<div class="full"><label>Guide address (URL)</label><input id="epgUrl" data-focusable type="url" inputmode="url" enterkeyhint="done" placeholder="https://…" value="' + ElionUtils.escapeHtml((cache && cache.source && String(cache.source).indexOf('http') === 0) ? cache.source : '') + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
          '<div class="full"><label>Or paste guide text</label><textarea id="epgText" data-focusable inputmode="text" enterkeyhint="done" placeholder="Paste guide text here" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea></div>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="primary" data-focusable data-action="load-epg">Load guide from address</button>' +
          '<button data-focusable data-action="load-epg-text">Add pasted guide</button>' +
          '<button data-focusable data-action="clear-epg">Clear guide</button>' +
        '</div>' +
        '<div class="status-line" id="epgStatus">' + (cache.updatedAt ? ('Last updated: ' + new Date(cache.updatedAt).toLocaleString() + (ElionEPG.hasData() ? '' : ' — no programmes yet')) : 'No guide loaded yet — this is optional.') + '</div>' +
      '</div>' +
      '<div class="epg-timeline-legend">What’s on now and next</div>' +
      '<div class="epg-grid">' +
        guide.map(function (row) {
          var prog = row.now;
          var pct = prog ? Math.round(ElionEPG.progressOf(prog) * 100) : 0;
          return (
            '<div class="epg-row">' +
              '<button class="epg-channel" data-focusable data-action="play" data-id="' + ElionUtils.escapeHtml(row.channel.id) + '">' +
                ElionUI.channelLogo(row.channel, 48) +
                '<div><strong>' + ElionUtils.escapeHtml(row.channel.name) + '</strong>' +
                '<div class="muted">' + (prog ? ElionUtils.escapeHtml(prog.title) : 'No guide data') + '</div>' +
                (prog ? '<div class="epg-mini-progress"><span style="width:' + pct + '%"></span></div>' : '') +
                '</div>' +
              '</button>' +
              '<div class="epg-programmes">' +
                (row.programmes.length ? row.programmes.map(function (p, idx) {
                  var active = row.now && p.start === row.now.start;
                  return '<div class="epg-item' + (active ? ' active' : '') + '"><div class="time">' + ElionEPG.formatRange(p) + '</div><div>' + ElionUtils.escapeHtml(p.title) + '</div>' +
                    (p.desc && idx < 2 ? '<div class="muted small">' + ElionUtils.escapeHtml(p.desc.slice(0, 90)) + '</div>' : '') +
                    '</div>';
                }).join('') : '<div class="epg-item"><div class="time">—</div><div>No programmes matched</div></div>') +
              '</div>' +
            '</div>'
          );
        }).join('') || '<div class="empty-state"><h3>Import channels to see the guide</h3></div>' +
      '</div>'
    );
  }

  /* ---------------- PLAYLISTS ---------------- */
  function renderPlaylists() {
    var s = st();
    var activeId = s.activePlaylistId || '';
    var rows = s.playlists.map(function (p) {
      var isActive = activeId === p.id;
      var sourceLabel = p.sourceType === 'url' ? 'From web address' : (p.sourceType === 'paste' ? 'Pasted text' : (p.sourceType === 'pair' ? 'Phone / computer' : 'Saved playlist'));
      return (
        '<div class="panel' + (isActive ? ' playlist-active' : '') + '">' +
          '<h3>' + ElionUtils.escapeHtml(p.name) + (isActive ? ' · Currently selected' : '') + '</h3>' +
          '<p class="help">' + sourceLabel +
            (p.url ? ' · ' + ElionUtils.escapeHtml(p.url) : '') +
            ' · ' + p.channelCount + ' channels</p>' +
          '<div class="btn-row">' +
            (!isActive ? '<button class="primary" data-focusable data-action="switch-pl" data-id="' + p.id + '">Select Playlist</button>' : '<span class="chip">Active playlist</span>') +
            (p.sourceType === 'url' && p.url ? '<button data-focusable data-action="refresh-pl" data-id="' + p.id + '">Refresh Channels</button>' : '') +
            '<button data-focusable data-action="replace-pl" data-id="' + p.id + '">Update Playlist</button>' +
            '<button data-focusable data-action="rename-pl" data-id="' + p.id + '">Rename</button>' +
            '<button class="danger" data-focusable data-action="remove-pl" data-id="' + p.id + '">Remove Playlist</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="toolbar wrap"><button data-focusable data-nav="home">← Home</button></div>' +
      '<div class="panel">' +
        '<h3>Add Playlist</h3>' +
        '<p class="help">Add the playlist from your TV provider. No demo channels are included.</p>' +
        '<div class="form-grid">' +
          '<div class="full"><label>Playlist address (URL)</label><input id="m3uUrl" data-focusable type="url" inputmode="url" enterkeyhint="done" placeholder="https://…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
          '<div class="full"><label>Name for this playlist</label><input id="m3uName" data-focusable type="text" inputmode="text" enterkeyhint="done" placeholder="My TV list" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
        '</div>' +
        '<div class="btn-row"><button class="primary" data-focusable data-action="import-url">Add Playlist</button></div>' +
        '<div class="status-line" id="importStatus"></div><div class="loading-bar" id="importLoading"><span></span></div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3>Paste playlist content</h3>' +
        '<p class="help">On a computer, open your playlist file, copy all the text, then paste it here with the TV keyboard.</p>' +
        '<div class="form-grid"><div class="full"><textarea id="m3uText" data-focusable inputmode="text" enterkeyhint="done" placeholder="Paste playlist text here" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea></div>' +
        '<div class="full"><input id="m3uTextName" data-focusable type="text" inputmode="text" enterkeyhint="done" placeholder="Name for this playlist" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div></div>' +
        '<div class="btn-row"><button class="primary" data-focusable data-action="import-text">Add pasted playlist</button></div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3>Import using Phone / PC</h3>' +
        '<p class="help">Optional helper for your home network. Set the companion address in Settings if you use this method.</p>' +
        '<div class="btn-row"><button class="primary" data-focusable data-action="start-pair">Get pairing code</button>' +
        '<button data-focusable data-action="settings-tab" data-tab="general">Open companion settings</button></div>' +
        '<div id="pairPanel"></div>' +
      '</div>' +
      '<div class="section-title">My Playlists</div>' +
      (rows || '<div class="empty-state"><h3>No playlist added yet</h3><p>Use one of the options above to add your first playlist.</p></div>')
    );
  }

  function renderSettings() {
    return ElionSettingsUI.render(settingsTab);
  }

  function renderAbout() {
    return '<div class="panel">' + ElionSettingsUI.info() + '</div>';
  }

  /* ---------------- WIRING ---------------- */
  function wire(root) {
    root.querySelectorAll('[data-nav]').forEach(function (el) {
      el.addEventListener('click', function () { navigate(el.getAttribute('data-nav')); });
    });
    ElionUI.bindChannelList(root, function (ch) {
      var listRoot = root.querySelectorAll('[data-action="play"]');
      var ids = [];
      listRoot.forEach(function (b) { ids.push(b.getAttribute('data-id')); });
      if (ids.length) {
        ElionChannels.setBrowseList(ids.map(function (id) { return ElionPlaylists.getChannelById(id); }).filter(Boolean), current);
      }
      if (global.ElionApp) ElionApp.openPlayer(ch);
    });
    wireActions(root);

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
        box.innerHTML = listHtml(list.slice(0, 100));
        ElionUI.bindChannelList(box, function (ch) {
          if (global.ElionApp) ElionApp.openPlayer(ch);
        });
        wireActions(box);
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
    if (action === 'reload-iptv') return reloadActivePlaylist();
    if (action === 'go-playlists') return navigate('playlists');
    if (action === 'go-channels') return navigate('channels');
    if (action === 'go-live') return navigate('live');
    if (action === 'open-category') return navigate('category', { group: el.getAttribute('data-group') });
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
        el.textContent = nowOn ? '★' : '☆';
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
      ElionUI.setLoading(true);
      statusEl('Refreshing channels…');
      return ElionPlaylists.refreshPlaylist(el.getAttribute('data-id')).then(function (r) {
        ElionUI.setLoading(false);
        if (r.ok) {
          ElionUI.toast('Channels updated · ' + r.channelCount + ' channels');
        } else {
          ElionUI.toast('Unable to refresh channels. Check your internet connection and try again.');
        }
        render();
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
          if (global.ElionApp) ElionApp.updateChrome(current);
          render();
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
    if (action === 'load-epg-text') return loadEpgText();
    if (action === 'clear-epg') {
      ElionStorage.saveEpgCache({ updatedAt: 0, programmes: {}, channels: {} });
      ElionUI.toast('EPG cleared');
      return render();
    }
    if (action === 'save-settings-general') return saveGeneral();
    if (action === 'save-settings-appearance') return saveAppearance();
    if (action === 'save-settings-content') return saveContent();
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
        return ElionParental.setPin(pin).then(function (r) {
          ElionUI.toast(r.ok ? 'PIN saved' : r.error);
          render(null);
        });
      });
    }
    if (action === 'pin-change') {
      return ElionUI.promptDialog('Current PIN', '', 'Change PIN', { inputType: 'password', maxlength: 8 }).then(function (oldPin) {
        if (oldPin == null) return;
        return ElionUI.promptDialog('New PIN (4–8 digits)', '', 'New PIN', { inputType: 'password', maxlength: 8 }).then(function (newPin) {
          if (newPin == null) return;
          return ElionParental.changePin(oldPin, newPin).then(function (r) {
            ElionUI.toast(r.ok ? 'PIN changed' : r.error);
            render();
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
    ElionStorage.saveSettings({
      companionBaseUrl: val('setCompanion'),
      udpProxyEnabled: val('setUdp') === '1',
      udpProxyAddress: val('setUdpHost'),
      udpProxyPort: val('setUdpPort')
    });
    statusEl('General settings saved.', true);
    ElionUI.toast('Saved');
  }

  function saveAppearance() {
    ElionStorage.saveSettings({
      theme: val('setTheme'),
      textSize: val('setText'),
      channelListLayout: val('setLayout'),
      showLogos: val('setLogos') === '1',
      animations: val('setAnim') === '1',
      showChannelNumbers: val('setNumbers') === '1'
    });
    ElionUI.applyAppearance();
    statusEl('Appearance saved.', true);
    ElionUI.toast('Appearance applied');
    render();
  }

  function saveContent() {
    var plId = val('setDefaultPl');
    ElionStorage.saveSettings({
      defaultPlaylistId: plId,
      activePlaylistId: plId,
      channelSort: val('setSort')
    });
    if (plId) ElionPlaylists.setActivePlaylist(plId);
    statusEl('Content settings saved.', true);
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
      rememberLastChannel: val('setRemember') === '1',
      bufferSeconds: isFinite(buf) ? ElionUtils.clamp(buf, 1, 30) : 3
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
        statusEl('Unable to load the playlist. Please check the address and try again.', false);
        ElionUI.toast('Unable to load the playlist. Please check the address and try again.');
        return;
      }
      afterImportSuccess(r.channelCount);
    }).catch(function (err) {
      clearImportLoading();
      var e = ElionErrors.fromException(err, 'NETWORK');
      statusEl(e.message, false);
      ElionUI.toast(e.message);
    });
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
        return;
      }
      afterImportSuccess(r.channelCount);
    }).catch(function (err) {
      clearImportLoading();
      var e = ElionErrors.fromException(err, 'INVALID_PLAYLIST');
      statusEl(e.message, false);
      ElionUI.toast(e.message);
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

  function loadEpgUrl() {
    var url = val('epgUrl');
    if (!ElionUtils.isValidHttpUrl(url)) { statusEl('Enter a valid XMLTV URL.', false); return; }
    statusEl('Loading EPG…');
    ElionUI.setLoading(true);
    ElionEPG.loadFromUrl(url).then(function () {
      ElionUI.setLoading(false);
      ElionUI.toast('EPG loaded');
      render();
    }).catch(function (err) {
      ElionUI.setLoading(false);
      statusEl(err.message || String(err), false);
    });
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
    render: render,
    getCurrent: getCurrent
  };
})(window);
