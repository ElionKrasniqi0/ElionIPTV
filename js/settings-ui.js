(function (global) {
  'use strict';

  /**
   * SS IPTV–style settings panels (left categories / right content).
   * Render-only; actions are handled by ElionScreens.
   */

  var LANGS = [
    { id: 'en', label: 'English' },
    { id: 'de', label: 'German' },
    { id: 'es', label: 'Spanish' },
    { id: 'pt', label: 'Portuguese' },
    { id: 'ru', label: 'Russian' },
    { id: 'uk', label: 'Ukrainian' },
    { id: 'lt', label: 'Lithuanian' },
    { id: 'ca', label: 'Catalan' },
    { id: 'be', label: 'Belarusian' }
  ];

  var TABS = [
    { id: 'general', title: 'General', sub: 'Operator, language, pairing, UDP proxy' },
    { id: 'appearance', title: 'Appearance', sub: 'Theme, logos, text size, animations' },
    { id: 'content', title: 'Content', sub: 'Playlists, categories, channel sorting' },
    { id: 'playback', title: 'Playback', sub: 'Audio and subtitles' },
    { id: 'parental', title: 'Parental controls', sub: 'PIN and locked categories/channels' },
    { id: 'misc', title: 'Miscellaneous', sub: 'Playback, network, reset' },
    { id: 'info', title: 'Information', sub: 'Version and platform details' }
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
    if (tab === 'appearance') return appearance(s);
    if (tab === 'content') return content(s);
    if (tab === 'playback') return playback(s);
    if (tab === 'parental') return parental(s);
    if (tab === 'misc') return misc(s);
    if (tab === 'info') return info();
    return general(s);
  }

  function general(s) {
    return (
      '<h3>General</h3>' +
      '<div class="settings-block">' +
        '<h4>Provider name (optional)</h4>' +
        '<p class="help">' + (s.operatorName ? ElionUtils.escapeHtml(s.operatorName) : 'Not set') + '</p>' +
        '<div class="btn-row">' +
          '<button data-focusable data-action="operator-select">Set name</button>' +
          '<button data-focusable data-action="operator-clear">Clear</button>' +
        '</div>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Phone / computer helper</h4>' +
        '<p class="help">Optional. Lets you send a playlist from a phone or computer on your home network.</p>' +
        '<div class="form-grid"><div class="full"><label>Helper address</label><input id="setCompanion" data-focusable type="url" inputmode="url" enterkeyhint="done" value="' + ElionUtils.escapeHtml(s.companionBaseUrl) + '" placeholder="http://192.168.1.20:8787" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div></div>' +
        '<div class="btn-row">' +
          '<button class="primary" data-focusable data-action="start-pair-settings">Get code</button>' +
          '<button data-focusable data-action="pair-disconnect">Disconnect</button>' +
          '<button data-focusable data-nav="playlists">My Playlists</button>' +
        '</div>' +
        '<div id="pairPanel"></div>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Advanced network helper</h4>' +
        '<p class="help">Only needed for special home setups. Most users can leave this off.</p>' +
        '<div class="form-grid">' +
          '<div><label>Use transformation</label><select id="setUdp" data-focusable><option value="0"' + (!s.udpProxyEnabled ? ' selected' : '') + '>No</option><option value="1"' + (s.udpProxyEnabled ? ' selected' : '') + '>Yes</option></select></div>' +
          '<div><label>Address</label><input id="setUdpHost" data-focusable type="text" inputmode="text" enterkeyhint="done" value="' + ElionUtils.escapeHtml(s.udpProxyAddress) + '" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
          '<div><label>Port</label><input id="setUdpPort" data-focusable type="number" inputmode="numeric" enterkeyhint="done" value="' + ElionUtils.escapeHtml(s.udpProxyPort) + '" autocomplete="off"></div>' +
        '</div>' +
      '</div>' +
      '<div class="settings-block">' +
        '<h4>Interface language</h4>' +
        '<div class="lang-list">' +
          LANGS.map(function (l) {
            return '<button class="lang-item' + (s.language === l.id ? ' active' : '') + '" data-focusable data-action="set-lang" data-lang="' + l.id + '">' + l.label + '</button>';
          }).join('') +
        '</div>' +
        '<p class="help">Your choice is saved. English is fully supported; other languages may show English labels.</p>' +
      '</div>' +
      '<div class="btn-row"><button class="primary" data-focusable data-action="save-settings-general">Save settings</button></div>' +
      '<div class="status-line" id="settingsStatus"></div>'
    );
  }

  function appearance(s) {
    return (
      '<h3>Appearance</h3>' +
      '<div class="form-grid">' +
        '<div><label>Theme</label><select id="setTheme" data-focusable><option value="dark"' + (s.theme === 'dark' ? ' selected' : '') + '>Dark</option><option value="light"' + (s.theme === 'light' ? ' selected' : '') + '>Light</option></select></div>' +
        '<div><label>Text size</label><select id="setText" data-focusable><option value="small"' + (s.textSize === 'small' ? ' selected' : '') + '>Small</option><option value="medium"' + (s.textSize === 'medium' ? ' selected' : '') + '>Medium</option><option value="large"' + (s.textSize === 'large' ? ' selected' : '') + '>Large</option></select></div>' +
        '<div><label>Channel list layout</label><select id="setLayout" data-focusable><option value="detailed"' + (s.channelListLayout === 'detailed' ? ' selected' : '') + '>Detailed (EPG)</option><option value="compact"' + (s.channelListLayout === 'compact' ? ' selected' : '') + '>Compact</option></select></div>' +
        '<div><label>Show logos</label><select id="setLogos" data-focusable><option value="1"' + (s.showLogos ? ' selected' : '') + '>Yes</option><option value="0"' + (!s.showLogos ? ' selected' : '') + '>No</option></select></div>' +
        '<div><label>Animations</label><select id="setAnim" data-focusable><option value="1"' + (s.animations !== false ? ' selected' : '') + '>On</option><option value="0"' + (s.animations === false ? ' selected' : '') + '>Off</option></select></div>' +
        '<div><label>Show channel numbers</label><select id="setNumbers" data-focusable><option value="1"' + (s.showChannelNumbers ? ' selected' : '') + '>Yes</option><option value="0"' + (!s.showChannelNumbers ? ' selected' : '') + '>No</option></select></div>' +
      '</div>' +
      '<div class="btn-row"><button class="primary" data-focusable data-action="save-settings-appearance">Save appearance</button></div>' +
      '<div class="status-line" id="settingsStatus"></div>'
    );
  }

  function content(s) {
    var state = ElionPlaylists.getState();
    return (
      '<h3>Content</h3>' +
      '<p class="help">Manage your playlists and how channels are sorted.</p>' +
      '<div class="btn-row"><button class="primary" data-focusable data-nav="playlists">My Playlists</button></div>' +
      '<div class="form-grid" style="margin-top:16px">' +
        '<div><label>Selected playlist</label><select id="setDefaultPl" data-focusable>' +
          '<option value="">None</option>' +
          state.playlists.map(function (p) {
            var selected = (s.activePlaylistId || s.defaultPlaylistId) === p.id;
            return '<option value="' + p.id + '"' + (selected ? ' selected' : '') + '>' + ElionUtils.escapeHtml(p.name) + '</option>';
          }).join('') +
        '</select></div>' +
        '<div><label>Channel list order</label><select id="setSort" data-focusable>' +
          '<option value="playlist"' + (s.channelSort === 'playlist' ? ' selected' : '') + '>Default order</option>' +
          '<option value="alpha"' + (s.channelSort === 'alpha' ? ' selected' : '') + '>A–Z</option>' +
          '<option value="category"' + (s.channelSort === 'category' ? ' selected' : '') + '>By category</option>' +
        '</select></div>' +
      '</div>' +
      '<div class="settings-block"><h4>Categories available</h4><p class="help">' +
        (state.categories.length ? state.categories.map(function (c) { return ElionUtils.escapeHtml(c.name) + ' (' + c.count + ')'; }).join(', ') : 'None yet — add a playlist first.') +
      '</p></div>' +
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
      var offOn = text.off ? ' active' : '';
      textBody =
        '<button class="lang-item' + offOn + '" data-focusable data-action="set-subtitle-track" data-index="-1">Off' + (text.off ? ' · Current' : '') + '</button>' +
        text.tracks.map(function (t) {
          return '<button class="lang-item' + (t.enabled ? ' active' : '') + '" data-focusable data-action="set-subtitle-track" data-index="' + t.index + '">' +
            ElionUtils.escapeHtml(t.label) + (t.enabled ? ' · Current' : '') + '</button>';
        }).join('');
    }

    return (
      '<h3>Playback Settings</h3>' +
      '<p class="help">Choices apply to the channel that is playing now. A saved preference is used later only when that channel has a matching track.</p>' +
      '<div class="settings-block"><h4>Audio</h4>' +
        (s.preferredAudio ? '<p class="help">Saved preference: ' + ElionUtils.escapeHtml(s.preferredAudio) + '</p>' : '') +
        '<div class="lang-list">' + audioBody + '</div>' +
      '</div>' +
      '<div class="settings-block"><h4>Subtitles</h4>' +
        (s.preferredSubtitle ? '<p class="help">Saved preference: ' + ElionUtils.escapeHtml(s.preferredSubtitle === 'off' ? 'Off' : s.preferredSubtitle) + '</p>' : '') +
        '<div class="lang-list">' + textBody + '</div>' +
      '</div>'
    );
  }

  function parental(s) {
    var cats = ElionPlaylists.getState().categories;
    var cfg = ElionParental.getConfig();
    return (
      '<h3>Parental controls</h3>' +
      '<div class="form-grid">' +
        '<div><label>Enable</label><select id="setParentalOn" data-focusable><option value="0"' + (!s.parentalEnabled ? ' selected' : '') + '>No</option><option value="1"' + (s.parentalEnabled ? ' selected' : '') + '>Yes</option></select></div>' +
        '<div><label>Status</label><p class="help">' + (cfg.pinHash ? 'PIN is set' : 'No PIN set') + '</p></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button data-focusable data-action="pin-create">Create / set PIN</button>' +
        '<button data-focusable data-action="pin-change">Change PIN</button>' +
        '<button data-focusable data-action="pin-lock-now">Lock session now</button>' +
      '</div>' +
      '<div class="settings-block"><h4>Lock categories</h4>' +
        '<div class="check-grid">' +
          (cats.map(function (c) {
            var on = (s.lockedGroups || []).indexOf(c.name) !== -1;
            return '<label class="check" data-focusable tabindex="0"><input type="checkbox" data-lock-group="' + ElionUtils.escapeHtml(c.name) + '"' + (on ? ' checked' : '') + '> ' + ElionUtils.escapeHtml(c.name) + '</label>';
          }).join('') || '<p class="help">Add a playlist to choose categories to lock.</p>') +
        '</div>' +
      '</div>' +
      '<div class="settings-block"><h4>Lock specific channels</h4>' +
        '<p class="help">Enter channel names containing text to lock matches (case-insensitive).</p>' +
        '<input id="lockChannelQuery" data-focusable type="text" inputmode="text" enterkeyhint="done" placeholder="e.g. Adult" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<div class="btn-row"><button data-focusable data-action="lock-channels-match">Lock matching channels</button>' +
        '<button data-focusable data-action="unlock-all-channels">Clear channel locks</button></div>' +
        '<p class="help">Locked channels: ' + (s.lockedChannels || []).length + '</p>' +
      '</div>' +
      '<div class="btn-row"><button class="primary" data-focusable data-action="save-settings-parental">Save parental settings</button></div>' +
      '<div class="status-line" id="settingsStatus"></div>'
    );
  }

  function misc(s) {
    return (
      '<h3>Miscellaneous</h3>' +
      '<div class="form-grid">' +
        '<div><label>Remember last channel</label><select id="setRemember" data-focusable><option value="1"' + (s.rememberLastChannel ? ' selected' : '') + '>Yes</option><option value="0"' + (!s.rememberLastChannel ? ' selected' : '') + '>No</option></select></div>' +
        '<div><label>Loading wait time (seconds)</label><input id="setBuffer" data-focusable type="number" inputmode="numeric" enterkeyhint="done" value="' + ElionUtils.escapeHtml(String(s.bufferSeconds)) + '" autocomplete="off"></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="primary" data-focusable data-action="save-settings-misc">Save preferences</button>' +
        '<button data-focusable data-action="net-diag">Check connection</button>' +
        '<button data-focusable data-action="clear-cache">Clear TV guide cache</button>' +
        '<button data-focusable data-action="reset-settings">Reset settings</button>' +
        '<button class="danger" data-focusable data-action="clear-data">Remove all playlists &amp; data</button>' +
      '</div>' +
      '<div class="status-line" id="settingsStatus"></div>' +
      '<pre class="diag" id="diagOut"></pre>'
    );
  }

  function info() {
    return (
      '<h3>Information</h3>' +
      '<ul class="checklist">' +
        '<li><strong>Application</strong> ELION IPTV</li>' +
        '<li><strong>Version</strong> 1.0.9</li>' +
        '<li><strong>Made for</strong> LG Smart TVs (webOS)</li>' +
        '<li><strong>Remote</strong> Magic Remote ready — arrows, OK, and Back</li>' +
        '<li><strong>Developer</strong> ELION</li>' +
        '<li><strong>Content</strong> Uses only the playlists you add — no demo channels</li>' +
      '</ul>'
    );
  }

  global.ElionSettingsUI = {
    render: render,
    info: info,
    LANGS: LANGS,
    TABS: TABS
  };
})(window);
