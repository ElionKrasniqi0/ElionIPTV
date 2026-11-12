(function (global) {
  'use strict';

  var TABS = [
    { id: 'general', title: 'General Settings', sub: 'Theme, startup, and app behavior' },
    { id: 'epg', title: 'EPG', sub: 'Guide source, refresh, and time offset' },
    { id: 'time', title: 'Time Format', sub: '12-hour or 24-hour clock' },
    { id: 'content', title: 'Content', sub: 'Categories, sorting, and display' },
    { id: 'playback', title: 'Playback', sub: 'Autoplay, timeout, and controls' },
    { id: 'parental', title: 'Parental Controls', sub: 'PIN and locked categories' },
    { id: 'info', title: 'Information', sub: 'Version and platform' }
  ];

  function render(tab) {
    return (
      '<div class="settings-layout">' +
        '<div class="settings-nav">' +
          TABS.map(function (t) {
            return '<button class="settings-nav-item' + (tab === t.id ? ' active' : '') + '" data-focusable data-action="settings-tab" data-tab="' + t.id + '">' +
              '<strong>' + t.title + '</strong><span>' + t.sub + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="settings-panel">' + panel(tab) + '</div>' +
      '</div>'
    );
  }

  function panel(tab) {
    var s = ElionStorage.getSettings();
    if (tab === 'epg') return epg(s);
    if (tab === 'time') return time(s);
    if (tab === 'content') return content(s);
    if (tab === 'playback') return playback(s);
    if (tab === 'parental') return parental(s);
    if (tab === 'info') return info();
    return general(s);
  }

  function general(s) {
    return (
      '<h3>General Settings</h3>' +
      '<div class="settings-block">' +
        '<h4>Theme</h4>' +
        '<div class="form-grid"><div><label>Theme</label><select id="setTheme" data-focusable><option value="dark"' + (s.theme !== 'light' ? ' selected' : '') + '>Dark</option><option value="light"' + (s.theme === 'light' ? ' selected' : '') + '>Light</option></select></div></div>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Language</h4>' +
        '<p class="help">English is the supported language.</p>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Startup preferences</h4>' +
        '<p class="help">When this is on, a restart keeps the active playlist and can reopen the last category and channel. It does not start playback by itself.</p>' +
        '<div class="form-grid"><div><label>Remember Last List and Channel</label><select id="setRemember" data-focusable><option value="1"' + (s.rememberLastChannel !== false ? ' selected' : '') + '>On</option><option value="0"' + (s.rememberLastChannel === false ? ' selected' : '') + '>Off</option></select></div></div>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Application behavior</h4>' +
        '<p class="help">The helper address is used only when you request a pairing code. The network helper is used only for udp:// streams.</p>' +
        '<div class="form-grid">' +
          '<div class="full"><label>Helper address</label><input id="setCompanion" data-focusable type="url" inputmode="url" enterkeyhint="done" value="' + ElionUtils.escapeHtml(s.companionBaseUrl || '') + '" placeholder="http://192.168.1.20:8787" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
          '<div><label>UDP helper</label><select id="setUdp" data-focusable><option value="0"' + (!s.udpProxyEnabled ? ' selected' : '') + '>Off</option><option value="1"' + (s.udpProxyEnabled ? ' selected' : '') + '>On</option></select></div>' +
          '<div><label>Address</label><input id="setUdpHost" data-focusable type="text" inputmode="text" enterkeyhint="done" value="' + ElionUtils.escapeHtml(s.udpProxyAddress || '') + '" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
          '<div><label>Port</label><input id="setUdpPort" data-focusable type="number" inputmode="numeric" enterkeyhint="done" value="' + ElionUtils.escapeHtml(String(s.udpProxyPort || '')) + '" autocomplete="off"></div>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button data-focusable data-action="start-pair-settings">Get pairing code</button>' +
          '<button data-focusable data-action="pair-disconnect">Disconnect</button>' +
        '</div>' +
        '<div id="pairPanel"></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="primary" data-focusable data-action="save-settings-general">Save settings</button>' +
        '<button data-focusable data-action="reset-settings">Reset settings</button>' +
      '</div>' +
      '<div class="status-line" id="settingsStatus"></div>'
    );
  }

  function epg(s) {
    var cache = {};
    try { cache = ElionStorage.getEpgCache() || {}; } catch (e) { cache = {}; }
    var url = s.epgSourceUrl || (cache.source && String(cache.source).indexOf('http') === 0 ? cache.source : '');
    return (
      '<h3>EPG</h3>' +
      '<div class="settings-block">' +
        '<h4>EPG source URL</h4>' +
        '<p class="help">Optional. Leave this empty and Live TV still works. No programme titles are created here.</p>' +
        '<div class="form-grid"><div class="full"><label>XMLTV address</label><input id="setEpgUrl" data-focusable type="url" inputmode="url" enterkeyhint="done" placeholder="https://…" value="' + ElionUtils.escapeHtml(url) + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div></div>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Automatic refresh</h4>' +
        '<p class="help">When on, the saved XMLTV address is downloaded again about every 6 hours. A failed download keeps the current guide.</p>' +
        '<div class="form-grid"><div><label>Automatic refresh</label><select id="setEpgAuto" data-focusable><option value="0"' + (!s.epgAutoRefresh ? ' selected' : '') + '>Off</option><option value="1"' + (s.epgAutoRefresh ? ' selected' : '') + '>On</option></select></div>' +
          '<div><label>Time offset (minutes)</label><input id="setEpgOffset" data-focusable type="number" inputmode="numeric" min="-720" max="720" step="1" value="' + ElionUtils.escapeHtml(String(s.epgOffsetMinutes || 0)) + '"></div></div>' +
        '<p class="help">Offset only changes which programme is treated as current. Range: −720 to 720 minutes.</p>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="primary" data-focusable data-action="save-settings-epg">Save EPG settings</button>' +
        '<button data-focusable data-action="refresh-epg-settings">EPG refresh</button>' +
        '<button data-focusable data-nav="epg">Open Live with EPG</button>' +
        '<button data-focusable data-action="clear-cache">Clear TV guide cache</button>' +
      '</div>' +
      '<div class="status-line" id="settingsStatus"></div>'
    );
  }

  function time(s) {
    return (
      '<h3>Time Format</h3>' +
      '<div class="settings-block">' +
        '<div class="form-grid"><div><label>Clock</label><select id="setClock" data-focusable>' +
          '<option value="24"' + (s.clockFormat !== '12' ? ' selected' : '') + '>24-hour format</option>' +
          '<option value="12"' + (s.clockFormat === '12' ? ' selected' : '') + '>12-hour format</option>' +
        '</select></div></div>' +
        '<p class="help">Used by the header clock and by programme start and end times.</p>' +
      '</div>' +
      '<div class="btn-row"><button class="primary" data-focusable data-action="save-settings-time">Save time format</button></div>' +
      '<div class="status-line" id="settingsStatus"></div>'
    );
  }

  function content(s) {
    var state = ElionPlaylists.getState();
    var hidden = s.hiddenGroups || [];
    var cats = state.categories || [];
    return (
      '<h3>Content</h3>' +
      '<div class="settings-block">' +
        '<h4>Content sorting</h4>' +
        '<div class="form-grid"><div><label>Channel list order</label><select id="setSort" data-focusable>' +
          '<option value="playlist"' + (s.channelSort === 'playlist' ? ' selected' : '') + '>Playlist order</option>' +
          '<option value="alpha"' + (s.channelSort === 'alpha' ? ' selected' : '') + '>A–Z</option>' +
          '<option value="category"' + (s.channelSort === 'category' ? ' selected' : '') + '>By category</option>' +
        '</select></div></div>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Show or hide categories</h4>' +
        '<p class="help">Hidden categories stay in All Channels. They are removed from the category grids only.</p>' +
        '<div class="check-grid">' +
          (cats.map(function (c) {
            var on = hidden.indexOf(c.name) === -1;
            var label = c.name || 'Uncategorized';
            return '<label class="check"><input type="checkbox" data-show-group="' + ElionUtils.escapeHtml(c.name) + '"' + (on ? ' checked' : '') + '> ' + ElionUtils.escapeHtml(label) + '</label>';
          }).join('') || '<p class="help">Add a playlist to choose categories.</p>') +
        '</div>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Display preferences</h4>' +
        '<div class="form-grid">' +
          '<div><label>Text size</label><select id="setText" data-focusable><option value="small"' + (s.textSize === 'small' ? ' selected' : '') + '>Small</option><option value="medium"' + (s.textSize !== 'small' && s.textSize !== 'large' ? ' selected' : '') + '>Medium</option><option value="large"' + (s.textSize === 'large' ? ' selected' : '') + '>Large</option></select></div>' +
          '<div><label>Channel list</label><select id="setLayout" data-focusable><option value="detailed"' + (s.channelListLayout !== 'compact' ? ' selected' : '') + '>Detailed</option><option value="compact"' + (s.channelListLayout === 'compact' ? ' selected' : '') + '>Compact</option></select></div>' +
          '<div><label>Logos</label><select id="setLogos" data-focusable><option value="1"' + (s.showLogos !== false ? ' selected' : '') + '>Show</option><option value="0"' + (s.showLogos === false ? ' selected' : '') + '>Hide</option></select></div>' +
          '<div><label>Channel numbers</label><select id="setNumbers" data-focusable><option value="1"' + (s.showChannelNumbers !== false ? ' selected' : '') + '>Show</option><option value="0"' + (s.showChannelNumbers === false ? ' selected' : '') + '>Hide</option></select></div>' +
          '<div><label>Animations</label><select id="setAnim" data-focusable><option value="1"' + (s.animations !== false ? ' selected' : '') + '>On</option><option value="0"' + (s.animations === false ? ' selected' : '') + '>Off</option></select></div>' +
        '</div>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Clear Favorites</h4>' +
        '<p class="help">This removes every saved favorite. Channels, movies, and series in the playlist are kept.</p>' +
        '<button class="danger" data-focusable data-action="clear-favorites">Clear Favorites</button>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Remove Playlist</h4>' +
        '<p class="help">Removes only the active playlist. Other playlists stay. If none remain, the playlist screen is empty.</p>' +
        '<button class="danger" data-focusable data-action="remove-active-playlist">Remove Playlist</button>' +
      '</div>' +
      '<div class="btn-row"><button class="primary" data-focusable data-action="save-settings-content">Save settings</button></div>' +
      '<div class="status-line" id="settingsStatus"></div>'
    );
  }

  function playback(s) {
    var audio = { supported: false, tracks: [], message: 'Start a channel to choose an audio track.' };
    var text = { supported: false, tracks: [], message: 'Start a channel to choose subtitles.' };
    try {
      if (global.ElionPlayer && ElionPlayer.listAudioTracks) audio = ElionPlayer.listAudioTracks();
      if (global.ElionPlayer && ElionPlayer.listTextTracks) text = ElionPlayer.listTextTracks();
    } catch (e) { /* keep unavailable messages */ }

    var audioBody;
    if (!audio.tracks.length) {
      audioBody = '<p class="help">' + ElionUtils.escapeHtml(audio.message || 'Audio track selection is not available.') + '</p>';
    } else if (audio.tracks.length === 1) {
      audioBody = '<p class="help">' + ElionUtils.escapeHtml(audio.message) + '</p>' +
        '<p class="help">Current track: ' + ElionUtils.escapeHtml(audio.tracks[0].label) + '</p>';
    } else {
      audioBody = audio.tracks.map(function (t) {
        return '<button class="lang-item' + (t.enabled ? ' active' : '') + '" data-focusable data-action="set-audio-track" data-index="' + t.index + '">' +
          ElionUtils.escapeHtml(t.label) + (t.enabled ? ' · Current' : '') + '</button>';
      }).join('');
    }

    var textBody;
    if (!text.tracks.length) {
      textBody = '<p class="help">' + ElionUtils.escapeHtml(text.message || 'Subtitles are not available.') + '</p>';
    } else {
      textBody =
        '<button class="lang-item' + (text.off ? ' active' : '') + '" data-focusable data-action="set-subtitle-track" data-index="-1">Off' + (text.off ? ' · Current' : '') + '</button>' +
        text.tracks.map(function (t) {
          return '<button class="lang-item' + (t.enabled ? ' active' : '') + '" data-focusable data-action="set-subtitle-track" data-index="' + t.index + '">' +
            ElionUtils.escapeHtml(t.label) + (t.enabled ? ' · Current' : '') + '</button>';
        }).join('');
    }

    return (
      '<h3>Playback Settings</h3>' +
      '<div class="settings-block">' +
        '<h4>Autoplay</h4>' +
        '<p class="help">When a movie or episode finishes, play the next item in the current list. Live channels are not advanced automatically.</p>' +
        '<div class="form-grid"><div><label>Autoplay next</label><select id="setAutoplay" data-focusable><option value="0"' + (!s.autoplayNext ? ' selected' : '') + '>Off</option><option value="1"' + (s.autoplayNext ? ' selected' : '') + '>On</option></select></div>' +
          '<div><label>Loading timeout (seconds)</label><input id="setBuffer" data-focusable type="number" inputmode="numeric" min="1" max="30" step="1" value="' + ElionUtils.escapeHtml(String(s.bufferSeconds || 3)) + '"></div>' +
          '<div><label>Player controls</label><select id="setControls" data-focusable><option value="auto"' + (!s.playerControlsPinned ? ' selected' : '') + '>Hide after 5 seconds</option><option value="pinned"' + (s.playerControlsPinned ? ' selected' : '') + '>Keep visible</option></select></div></div>' +
        '<p class="help">The timeout is how long a channel may take to start before it is reported as failed. Failed streams are not retried without a limit.</p>' +
      '</div>' +
      '<div class="settings-block"><h4>Audio</h4>' +
        (s.preferredAudio ? '<p class="help">Saved preference: ' + ElionUtils.escapeHtml(s.preferredAudio) + '</p>' : '') +
        '<div class="lang-list">' + audioBody + '</div></div>' +
      '<div class="settings-block"><h4>Subtitles</h4>' +
        (s.preferredSubtitle ? '<p class="help">Saved preference: ' + ElionUtils.escapeHtml(s.preferredSubtitle === 'off' ? 'Off' : s.preferredSubtitle) + '</p>' : '') +
        '<div class="lang-list">' + textBody + '</div></div>' +
      '<div class="btn-row"><button class="primary" data-focusable data-action="save-settings-playback">Save playback</button></div>' +
      '<div class="status-line" id="settingsStatus"></div>'
    );
  }

  function parental(s) {
    var cats = ElionPlaylists.getState().categories || [];
    var cfg = ElionParental.getConfig();
    return (
      '<h3>Parental Controls</h3>' +
      '<p class="help">Optional. A PIN is stored as a hash, never as the digits you type.</p>' +
      '<div class="form-grid">' +
        '<div><label>Protection</label><select id="setParentalOn" data-focusable><option value="0"' + (!s.parentalEnabled ? ' selected' : '') + '>Off</option><option value="1"' + (s.parentalEnabled ? ' selected' : '') + '>On</option></select></div>' +
        '<div><label>PIN</label><p class="help">' + (cfg.pinHash ? 'A PIN is set' : 'No PIN set') + '</p></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button data-focusable data-action="pin-create">Set PIN</button>' +
        '<button data-focusable data-action="pin-change">Change PIN</button>' +
        '<button data-focusable data-action="pin-lock-now">Lock now</button>' +
      '</div>' +
      '<div class="settings-block"><h4>Protected categories</h4>' +
        '<div class="check-grid">' +
          (cats.map(function (c) {
            var on = (s.lockedGroups || []).indexOf(c.name) !== -1;
            var label = c.name || 'Uncategorized';
            return '<label class="check"><input type="checkbox" data-lock-group="' + ElionUtils.escapeHtml(c.name) + '"' + (on ? ' checked' : '') + '> ' + ElionUtils.escapeHtml(label) + '</label>';
          }).join('') || '<p class="help">Add a playlist to choose categories.</p>') +
        '</div>' +
      '</div>' +
      ((s.lockedChannels && s.lockedChannels.length)
        ? '<div class="settings-block"><h4>Locked channels</h4><p class="help">' + s.lockedChannels.length + ' channels are locked by name.</p><button data-focusable data-action="unlock-all-channels">Unlock those channels</button></div>'
        : '') +
      '<div class="btn-row"><button class="primary" data-focusable data-action="save-settings-parental">Save parental settings</button></div>' +
      '<div class="status-line" id="settingsStatus"></div>'
    );
  }

  function info() {
    return (
      '<h3>Information</h3>' +
      '<img class="app-logo app-logo-about" src="assets/images/elion-iptv-logo.png" alt="ELION IPTV">' +
      '<ul class="checklist">' +
        '<li><strong>Application</strong> ELION IPTV</li>' +
        '<li><strong>Version</strong> 1.1.1</li>' +
        '<li><strong>Made for</strong> LG Smart TVs (webOS)</li>' +
        '<li><strong>Remote</strong> Magic Remote ready — arrows, OK, and Back</li>' +
        '<li><strong>Content</strong> Uses only the playlists you add</li>' +
      '</ul>'
    );
  }

  global.ElionSettingsUI = {
    render: render,
    info: info,
    TABS: TABS
  };
})(window);
