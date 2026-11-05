(function (global) {
  'use strict';

  var video = null;
  var currentChannel = null;
  var listeners = [];
  var loadTimer = null;
  var stallTimer = null;
  var playToken = 0;
  var autoRetryCount = 0;
  var MAX_AUTO_RETRY = 0; // User must press Retry — no endless auto-retry loops
  var bound = false;
  var status = {
    playing: false,
    buffering: false,
    error: null,
    channel: null,
    streamInfo: null,
    format: null
  };

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(getStatus()); } catch (e) { console.error(e); }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
  }

  function getStatus() {
    return Object.assign({}, status, {
      channel: currentChannel,
      currentTime: video ? video.currentTime : 0,
      duration: video && isFinite(video.duration) ? video.duration : 0,
      paused: video ? video.paused : true,
      readyState: video ? video.readyState : 0,
      networkState: video ? video.networkState : 0
    });
  }

  function detectFormat(url) {
    var u = String(url || '').toLowerCase();
    if (u.indexOf('.m3u8') !== -1 || u.indexOf('format=m3u8') !== -1) {
      return { mime: 'application/vnd.apple.mpegurl', transport: 'HLS', label: 'HLS (m3u8)' };
    }
    if (u.indexOf('.mpd') !== -1) {
      return { mime: 'application/dash+xml', transport: 'URI', label: 'DASH (limited)' };
    }
    if (u.indexOf('.mp4') !== -1) {
      return { mime: 'video/mp4', transport: 'URI', label: 'MP4' };
    }
    if (u.indexOf('.ts') !== -1 || u.indexOf('mpegts') !== -1) {
      return { mime: 'video/mp2t', transport: 'URI', label: 'MPEG-TS' };
    }
    if (u.indexOf('.mkv') !== -1) {
      return { mime: 'video/x-matroska', transport: 'URI', label: 'MKV (may be unsupported)' };
    }
    if (/^udp:\/\//i.test(u) || /^rtp:\/\//i.test(u)) {
      return { mime: 'application/octet-stream', transport: 'URI', label: 'UDP/RTP (needs proxy)' };
    }
    // Many IPTV live URLs omit extensions — try HLS first on webOS
    return { mime: 'application/vnd.apple.mpegurl', transport: 'HLS', label: 'HLS (assumed)' };
  }

  function buildMediaOption(format) {
    var options = {
      mediaTransportType: format.transport,
      option: {
        mediaFormat: { type: 'video' },
        adaptiveStreaming: {
          adaptiveResolution: true,
          seamlessPlay: true
        }
      }
    };
    return format.mime + ';mediaOption=' + encodeURI(JSON.stringify(options));
  }

  function clearTimers() {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  }

  function armLoadTimeout(token) {
    clearTimers();
    var ms = (ElionStorage.getSettings().bufferSeconds || 3) * 1000 + 25000;
    loadTimer = setTimeout(function () {
      if (token !== playToken) return;
      if (!status.playing && (status.buffering || !status.error)) {
        status.error = 'Stream timed out while loading. It may be offline, expired, or blocked on this network.';
        status.buffering = false;
        status.playing = false;
        try { if (video) video.pause(); } catch (e) { /* ignore */ }
        emit();
      }
    }, ms);

    // Stall watchdog: if buffering forever after start, surface error
    stallTimer = setTimeout(function () {
      if (token !== playToken) return;
      if (status.buffering && !status.playing && !status.error) {
        status.error = 'Playback stalled. Check the stream or your connection, then press Retry.';
        status.buffering = false;
        emit();
      }
    }, ms + 20000);
  }

  function updateStreamInfo() {
    if (!video || !currentChannel) {
      status.streamInfo = null;
      return;
    }
    var w = video.videoWidth || 0;
    var h = video.videoHeight || 0;
    var tracks = [];
    try {
      if (video.audioTracks && video.audioTracks.length) {
        for (var i = 0; i < video.audioTracks.length; i++) {
          var a = video.audioTracks[i];
          tracks.push({ type: 'audio', label: a.label || a.language || ('Audio ' + (i + 1)), enabled: a.enabled, index: i });
        }
      }
    } catch (e) { /* audioTracks may be unavailable */ }
    try {
      if (video.textTracks && video.textTracks.length) {
        for (var t = 0; t < video.textTracks.length; t++) {
          var tt = video.textTracks[t];
          tracks.push({ type: 'text', label: tt.label || tt.language || ('Sub ' + (t + 1)), mode: tt.mode, index: t });
        }
      }
    } catch (e2) { /* ignore */ }

    status.streamInfo = {
      format: status.format,
      width: w,
      height: h,
      resolution: w && h ? (w + '×' + h) : '—',
      url: currentChannel.url,
      tracks: tracks
    };
  }

  function bindVideo(el) {
    video = el;
    if (!video || bound) return;
    bound = true;

    video.addEventListener('waiting', function () {
      status.buffering = true;
      emit();
    });
    video.addEventListener('playing', function () {
      status.playing = true;
      status.buffering = false;
      status.error = null;
      autoRetryCount = 0;
      clearTimers();
      updateStreamInfo();
      applyTrackPreferences();
      emit();
    });
    video.addEventListener('canplay', function () {
      status.buffering = false;
      updateStreamInfo();
      emit();
    });
    video.addEventListener('pause', function () {
      status.playing = false;
      emit();
    });
    video.addEventListener('emptied', function () {
      if (!currentChannel) return;
    });
    video.addEventListener('stalled', function () {
      status.buffering = true;
      emit();
    });
    video.addEventListener('error', function () {
      clearTimers();
      var err = video.error;
      var code = err ? err.code : 0;
      var map = {
        1: 'Playback aborted.',
        2: 'Network error while loading the stream (offline, blocked, or HTTP failure).',
        3: 'Stream decoding failed — codec/container may be unsupported on this webOS TV.',
        4: 'Stream source not supported, invalid, or unreachable.'
      };
      status.error = (map[code] || 'Unable to play this stream.') +
        ' The channel may be unavailable, expired, or incompatible. Use Retry or go back to the list.';
      status.playing = false;
      status.buffering = false;
      emit();
    });
    video.addEventListener('loadstart', function () {
      status.buffering = true;
      emit();
    });
    video.addEventListener('loadedmetadata', function () {
      updateStreamInfo();
      applyTrackPreferences();
      emit();
    });
  }

  function stopQuiet() {
    if (!video) return;
    try {
      video.pause();
      while (video.firstChild) video.removeChild(video.firstChild);
      video.removeAttribute('src');
      video.load();
    } catch (e) { /* ignore */ }
  }

  function stop() {
    clearTimers();
    stopQuiet();
    status.playing = false;
    status.buffering = false;
    status.error = null;
    emit();
  }

  function playChannel(channel) {
    if (!video) return Promise.reject(new Error('Player not ready'));
    if (!channel || !channel.url) {
      status.error = 'Invalid channel URL.';
      emit();
      return Promise.reject(new Error('Invalid channel'));
    }

    return ElionParental.requireUnlock(channel).then(function (allowed) {
      if (!allowed) {
        status.error = 'Parental PIN required.';
        emit();
        return Promise.reject(new Error('Parental lock'));
      }
      return startPlayback(channel);
    });
  }

  function startPlayback(channel) {
    var token = ++playToken;
    var url = ElionPlaylists.applyUdpProxy(channel.url);
    var format = detectFormat(url);
    currentChannel = channel;
    status.channel = channel;
    status.error = null;
    status.buffering = true;
    status.playing = false;
    status.format = format.label;
    status.streamInfo = { format: format.label, width: 0, height: 0, resolution: '—', url: channel.url, tracks: [] };
    emit();

    stopQuiet();
    armLoadTimeout(token);

    try {
      var source = document.createElement('source');
      source.setAttribute('src', url);
      source.setAttribute('type', buildMediaOption(format));
      video.appendChild(source);
      video.src = url;
    } catch (e) {
      status.error = 'Unable to attach stream source on this TV.';
      status.buffering = false;
      emit();
      return Promise.reject(e);
    }

    var playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      return playPromise.then(function () {
        if (token !== playToken) return false;
        status.playing = true;
        status.buffering = false;
        status.error = null;
        pushRecent(channel);
        updateStreamInfo();
        emit();
        return true;
      }).catch(function (err) {
        if (token !== playToken) return false;
        var msg = (err && err.message) || 'Playback failed to start.';
        if (/interact|user|NotAllowed/i.test(msg)) {
          status.error = 'TV blocked autoplay. Press Play to start.';
        } else {
          status.error = msg + ' The stream may be unavailable or incompatible with webOS.';
        }
        status.playing = false;
        status.buffering = false;
        pushRecent(channel);
        emit();
        // Resolve (do not reject) so callers don't create unhandled rejections
        return false;
      });
    }

    pushRecent(channel);
    return Promise.resolve(true);
  }

  function retry() {
    if (!currentChannel) return Promise.reject(new Error('No channel'));
    autoRetryCount = 0;
    return startPlayback(currentChannel);
  }

  function playNext() {
    if (!currentChannel) return Promise.reject(new Error('No channel'));
    var next = ElionChannels.nextChannel(currentChannel.id);
    if (!next) return Promise.reject(new Error('No next channel'));
    return playChannel(next);
  }

  function playPrev() {
    if (!currentChannel) return Promise.reject(new Error('No channel'));
    var prev = ElionChannels.prevChannel(currentChannel.id);
    if (!prev) return Promise.reject(new Error('No previous channel'));
    return playChannel(prev);
  }

  function pushRecent(channel) {
    var recents = ElionStorage.getRecents().filter(function (r) { return r.id !== channel.id; });
    recents.unshift({
      id: channel.id,
      name: channel.name,
      logo: channel.logo,
      group: channel.group,
      url: channel.url,
      watchedAt: Date.now()
    });
    ElionStorage.saveRecents(recents);
    if (ElionStorage.getSettings().rememberLastChannel) {
      ElionStorage.set('lastChannelId', channel.id);
    }
  }

  function togglePlayPause() {
    if (!video) return;
    if (video.paused) {
      video.play().catch(function (err) {
        status.error = (err && err.message) || 'Unable to resume playback.';
        emit();
      });
    } else {
      video.pause();
    }
  }

  function trackLabel(track, fallback) {
    var label = track && track.label ? String(track.label) : '';
    var lang = track && track.language ? String(track.language) : '';
    if (label && lang && label.toLowerCase() !== lang.toLowerCase()) return label + ' (' + lang + ')';
    return label || lang || fallback;
  }

  function isSubtitleKind(track) {
    var kind = String((track && track.kind) || '').toLowerCase();
    return kind === '' || kind === 'subtitles' || kind === 'captions';
  }

  function readSettings() {
    try {
      if (global.ElionStorage) return ElionStorage.getSettings();
    } catch (e) { /* ignore */ }
    return {};
  }

  function listAudioTracks() {
    var out = { supported: false, tracks: [], message: 'Start a channel to choose an audio track.' };
    if (!video) return out;
    var list = null;
    try { list = video.audioTracks; } catch (e) { list = null; }
    if (!list || typeof list.length !== 'number') {
      out.message = 'This player cannot list audio tracks for the current stream.';
      return out;
    }
    out.supported = true;
    if (!list.length) {
      out.message = 'This stream does not offer selectable audio tracks.';
      return out;
    }
    for (var i = 0; i < list.length; i++) {
      out.tracks.push({
        index: i,
        label: trackLabel(list[i], 'Audio ' + (i + 1)),
        language: list[i].language || '',
        enabled: !!list[i].enabled
      });
    }
    if (out.tracks.length === 1) out.message = 'This stream has only one audio track.';
    else out.message = '';
    return out;
  }

  function selectAudioTrack(index) {
    var info = listAudioTracks();
    if (!info.supported || !info.tracks.length) {
      return { ok: false, message: info.message || 'Audio track selection is not available.' };
    }
    index = parseInt(index, 10);
    if (isNaN(index) || index < 0 || index >= info.tracks.length) {
      return { ok: false, message: 'That audio track is not available.' };
    }
    if (info.tracks.length === 1) {
      return { ok: true, message: 'This stream has only one audio track.' };
    }
    try {
      var list = video.audioTracks;
      for (var i = 0; i < list.length; i++) list[i].enabled = (i === index);
    } catch (e) {
      return { ok: false, message: 'This player cannot change the audio track for this stream.' };
    }
    var chosen = info.tracks[index];
    var pref = chosen.language || chosen.label || '';
    try { if (global.ElionStorage && pref) ElionStorage.saveSettings({ preferredAudio: pref }); } catch (e2) { /* ignore */ }
    updateStreamInfo();
    emit();
    return { ok: true, message: 'Audio: ' + chosen.label };
  }

  function listTextTracks() {
    var out = { supported: false, tracks: [], message: 'Start a channel to choose subtitles.' };
    if (!video) return out;
    var list = null;
    try { list = video.textTracks; } catch (e) { list = null; }
    if (!list || typeof list.length !== 'number') {
      out.message = 'This player cannot list subtitles for the current stream.';
      return out;
    }
    out.supported = true;
    var showing = false;
    for (var i = 0; i < list.length; i++) {
      if (!isSubtitleKind(list[i])) continue;
      var on = list[i].mode === 'showing';
      if (on) showing = true;
      out.tracks.push({
        index: i,
        label: trackLabel(list[i], 'Subtitles ' + (out.tracks.length + 1)),
        language: list[i].language || '',
        enabled: on
      });
    }
    if (!out.tracks.length) {
      out.message = 'Subtitles are not available for this stream.';
      return out;
    }
    out.off = !showing;
    out.message = '';
    return out;
  }

  function selectTextTrack(index) {
    var info = listTextTracks();
    if (!info.supported) {
      return { ok: false, message: info.message || 'Subtitle selection is not available.' };
    }
    if (!info.tracks.length) {
      return { ok: false, message: 'Subtitles are not available for this stream.' };
    }
    index = parseInt(index, 10);
    try {
      var list = video.textTracks;
      for (var i = 0; i < list.length; i++) {
        if (!isSubtitleKind(list[i])) continue;
        list[i].mode = 'disabled';
      }
      if (index === -1) {
        try { if (global.ElionStorage) ElionStorage.saveSettings({ preferredSubtitle: 'off' }); } catch (e0) { /* ignore */ }
        updateStreamInfo();
        emit();
        return { ok: true, message: 'Subtitles off' };
      }
      if (isNaN(index) || index < 0 || index >= list.length || !isSubtitleKind(list[index])) {
        return { ok: false, message: 'That subtitle track is not available.' };
      }
      list[index].mode = 'showing';
    } catch (e) {
      return { ok: false, message: 'This player cannot change subtitles for this stream.' };
    }
    var chosen = null;
    for (var t = 0; t < info.tracks.length; t++) {
      if (info.tracks[t].index === index) chosen = info.tracks[t];
    }
    var pref = (chosen && (chosen.language || chosen.label)) || '';
    try { if (global.ElionStorage && pref) ElionStorage.saveSettings({ preferredSubtitle: pref }); } catch (e2) { /* ignore */ }
    updateStreamInfo();
    emit();
    return { ok: true, message: 'Subtitles: ' + (chosen ? chosen.label : 'On') };
  }

  function preferenceMatches(track, pref) {
    if (!pref) return false;
    var want = String(pref).toLowerCase();
    var lang = String(track.language || '').toLowerCase();
    var label = String(track.label || '').toLowerCase();
    return (lang && lang === want) || (label && label === want) || trackLabel(track, '').toLowerCase() === want;
  }

  function applyTrackPreferences() {
    if (!video) return;
    var s = readSettings();
    try {
      if (s.preferredAudio && video.audioTracks && video.audioTracks.length > 1) {
        var audioMatch = -1;
        for (var i = 0; i < video.audioTracks.length; i++) {
          if (preferenceMatches(video.audioTracks[i], s.preferredAudio)) audioMatch = i;
        }
        if (audioMatch >= 0) {
          for (var a = 0; a < video.audioTracks.length; a++) video.audioTracks[a].enabled = (a === audioMatch);
        }
      }
    } catch (e) { /* leave the stream default */ }
    try {
      if (!video.textTracks || !s.preferredSubtitle) return;
      var textMatch = -1;
      for (var t = 0; t < video.textTracks.length; t++) {
        if (!isSubtitleKind(video.textTracks[t])) continue;
        if (s.preferredSubtitle === 'off') video.textTracks[t].mode = 'disabled';
        else if (preferenceMatches(video.textTracks[t], s.preferredSubtitle)) textMatch = t;
      }
      if (s.preferredSubtitle !== 'off' && textMatch >= 0) {
        for (var u = 0; u < video.textTracks.length; u++) {
          if (!isSubtitleKind(video.textTracks[u])) continue;
          video.textTracks[u].mode = (u === textMatch) ? 'showing' : 'disabled';
        }
      }
    } catch (e2) { /* leave the stream default */ }
    updateStreamInfo();
  }

  function cycleSubtitle() {
    if (!video || !video.textTracks || !video.textTracks.length) {
      ElionUI.toast('No subtitle tracks in this stream');
      return;
    }
    var tracks = video.textTracks;
    var active = -1;
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].mode === 'showing') active = i;
      tracks[i].mode = 'disabled';
    }
    var next = active + 1;
    if (next >= tracks.length) {
      ElionUI.toast('Subtitles off');
      updateStreamInfo();
      emit();
      return;
    }
    tracks[next].mode = 'showing';
    ElionUI.toast('Subtitle: ' + (tracks[next].label || tracks[next].language || ('Track ' + (next + 1))));
    updateStreamInfo();
    emit();
  }

  function cycleAudio() {
    if (!video || !video.audioTracks || !video.audioTracks.length) {
      ElionUI.toast('No alternate audio tracks');
      return;
    }
    var tracks = video.audioTracks;
    var active = 0;
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].enabled) active = i;
      tracks[i].enabled = false;
    }
    var next = (active + 1) % tracks.length;
    tracks[next].enabled = true;
    ElionUI.toast('Audio: ' + (tracks[next].label || tracks[next].language || ('Track ' + (next + 1))));
    updateStreamInfo();
    emit();
  }

  global.ElionPlayer = {
    bindVideo: bindVideo,
    playChannel: playChannel,
    stop: stop,
    retry: retry,
    playNext: playNext,
    playPrev: playPrev,
    togglePlayPause: togglePlayPause,
    cycleSubtitle: cycleSubtitle,
    cycleAudio: cycleAudio,
    listAudioTracks: listAudioTracks,
    listTextTracks: listTextTracks,
    selectAudioTrack: selectAudioTrack,
    selectTextTrack: selectTextTrack,
    applyTrackPreferences: applyTrackPreferences,
    getStatus: getStatus,
    onChange: onChange,
    getVideo: function () { return video; },
    getCurrentChannel: function () { return currentChannel; },
    detectFormat: detectFormat
  };
})(window);
