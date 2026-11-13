(function (global) {
  'use strict';

  var video = null;
  var currentChannel = null;
  var listeners = [];
  var loadTimer = null;
  var stallTimer = null;
  var playToken = 0;
  var autoRetryCount = 0;
  var retryTimer = null;
  var hlsEngine = null;
  var hlsLoadPromise = null;
  var MAX_AUTO_RETRY = 3;
  var RETRY_DELAYS = [2000, 5000, 12000];
  var bound = false;
  var netBound = false;
  var userPaused = false;
  var linkDown = false;
  var netTimer = null;
  var hlsSoftTries = 0;
  var watchOrigin = 0;
  var lastProgressAt = 0;
  var STALL_PROGRESS_MS = 30000;
  var STALL_FAIL_MS = 55000;
  var qualityLevels = [];
  var qualityMode = 'auto';
  var qualityProbeToken = 0;
  var activeStreamUrl = '';
  var masterStreamUrl = '';
  var abrStartBpsHint = 0;
  var playbackEngine = '';
  var playlistKind = '';
  var qualityProbeNote = '';
  var status = {
    playing: false,
    buffering: false,
    loading: false,
    recovering: false,
    error: null,
    errorTitle: '',
    recoveryDetail: '',
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

  function readPreferredQuality() {
    try {
      var s = ElionStorage.getSettings();
      if (s && s.preferredQuality) return String(s.preferredQuality);
    } catch (e) { /* ignore */ }
    return 'auto';
  }

  function heightQualityLabel(height) {
    var h = parseInt(height, 10) || 0;
    if (h >= 2000) return '2160p (4K)';
    if (h >= 1400) return '1440p (2K)';
    if (h >= 1000) return '1080p (Full HD)';
    if (h >= 700) return '720p (HD)';
    if (h >= 500) return '576p';
    if (h >= 400) return '480p';
    if (h > 0) return h + 'p';
    return 'Unknown';
  }

  function qualityTierFromHeight(height) {
    var h = parseInt(height, 10) || 0;
    if (h >= 2000) return '4K';
    if (h >= 1400) return '2K';
    if (h >= 1000) return 'FHD';
    if (h >= 700) return 'HD';
    if (h > 0) return 'SD';
    return '';
  }

  /**
   * webOS defaults maxWidth/maxHeight to 1920x1080, which blocks 4K variants.
   * Unlock up to UHD for Auto; cap only when the user locks a lower quality.
   * abrStartBpsHint (from master probe) raises the native/HLS.js start bitrate
   * toward the highest published rung without inventing resolutions.
   */
  function qualityAdaptiveLimits(pref) {
    var mode = pref == null ? qualityMode : String(pref);
    var limits;
    if (!mode || mode === 'auto') {
      limits = { maxWidth: 3840, maxHeight: 2160, startBps: 12000000 };
    } else {
      var h = parseInt(mode, 10) || 0;
      if (h >= 2000) limits = { maxWidth: 3840, maxHeight: 2160, startBps: 20000000 };
      else if (h >= 1000) limits = { maxWidth: 1920, maxHeight: 1080, startBps: 8000000 };
      else if (h >= 700) limits = { maxWidth: 1280, maxHeight: 720, startBps: 4500000 };
      else if (h >= 500) limits = { maxWidth: 1024, maxHeight: 576, startBps: 2500000 };
      else if (h >= 400) limits = { maxWidth: 854, maxHeight: 480, startBps: 1500000 };
      else limits = { maxWidth: 3840, maxHeight: 2160, startBps: 12000000 };
    }
    if ((!mode || mode === 'auto') && abrStartBpsHint > limits.startBps) {
      limits.startBps = Math.min(abrStartBpsHint, 25000000);
    }
    return limits;
  }

  function buildMediaOption(format, pref) {
    var limits = qualityAdaptiveLimits(pref);
    var options = {
      mediaTransportType: format.transport,
      option: {
        mediaFormat: { type: 'video' },
        adaptiveStreaming: {
          adaptiveResolution: true,
          seamlessPlay: true,
          maxWidth: limits.maxWidth,
          maxHeight: limits.maxHeight,
          bps: { start: limits.startBps }
        }
      }
    };
    return format.mime + ';mediaOption=' + encodeURI(JSON.stringify(options));
  }

  function resolvePlaylistUrl(baseUrl, ref) {
    var target = String(ref || '').trim();
    if (!target) return '';
    if (/^https?:\/\//i.test(target)) return target;
    try {
      if (typeof URL === 'function') return new URL(target, baseUrl).href;
    } catch (e) { /* fall through */ }
    var base = String(baseUrl || '');
    if (target.charAt(0) === '/') {
      var m = /^https?:\/\/[^/]+/i.exec(base);
      return m ? (m[0] + target) : target;
    }
    return base.replace(/[^/]*$/, '') + target;
  }

  function codecsLikelySupported(codecs) {
    var raw = String(codecs || '').trim();
    if (!raw) return true;
    var parts = raw.split(',');
    var videoCodec = '';
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].trim();
      if (/avc1|avc3|hvc1|hev1|vp09|vp9|av01/i.test(c)) {
        videoCodec = c;
        break;
      }
    }
    if (!videoCodec) return true;
    // Native webOS often plays HEVC/AVC even when canPlayType is empty — only
    // reject codecs the HTML5 pipeline clearly cannot handle.
    if (/av01|vp09|vp9/i.test(videoCodec)) {
      if (!video || !video.canPlayType) return false;
      var a = '';
      var b = '';
      try {
        a = video.canPlayType('video/mp4; codecs="' + videoCodec + '"') || '';
        b = video.canPlayType('video/mp2t; codecs="' + videoCodec + '"') || '';
      } catch (e2) { return false; }
      return !!(a || b);
    }
    return true;
  }

  function dedupeQualityLevels(levels) {
    var sorted = (levels || []).slice().sort(function (a, b) {
      if (b.height !== a.height) return b.height - a.height;
      return b.bandwidth - a.bandwidth;
    });
    var deduped = [];
    var usedHeight = {};
    var usedBw = {};
    for (var j = 0; j < sorted.length; j++) {
      var level = sorted[j];
      if (level.height > 0) {
        if (usedHeight[level.height]) continue;
        usedHeight[level.height] = true;
      } else {
        var bwKey = 'bw-' + level.bandwidth;
        if (usedBw[bwKey]) continue;
        usedBw[bwKey] = true;
      }
      deduped.push(level);
    }
    return deduped;
  }

  function parseHlsMasterPlaylist(text, baseUrl) {
    var src = String(text || '');
    var lines = src.split(/\r?\n/);
    var out = [];
    var seen = {};
    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i] || '').trim();
      if (line.indexOf('#EXT-X-STREAM-INF:') !== 0) continue;
      var attrs = line.slice('#EXT-X-STREAM-INF:'.length);
      var bw = parseInt((/BANDWIDTH=(\d+)/i.exec(attrs) || [])[1], 10) || 0;
      var avg = parseInt((/AVERAGE-BANDWIDTH=(\d+)/i.exec(attrs) || [])[1], 10) || 0;
      if (!bw && avg) bw = avg;
      var res = /RESOLUTION=(\d+)x(\d+)/i.exec(attrs);
      var codecs = ((/CODECS="([^"]*)"/i.exec(attrs) || [])[1]) || '';
      var next = String(lines[i + 1] || '').trim();
      if (!next || next.charAt(0) === '#') continue;
      var width = res ? parseInt(res[1], 10) : 0;
      var height = res ? parseInt(res[2], 10) : 0;
      if (!codecsLikelySupported(codecs)) continue;
      var url = resolvePlaylistUrl(baseUrl, next);
      if (!url) continue;
      var id = height > 0 ? String(height) : ('bw-' + bw);
      var key = id + '|' + url;
      if (seen[key]) continue;
      seen[key] = true;
      out.push({
        id: id,
        height: height,
        width: width,
        bandwidth: bw,
        codecs: codecs,
        url: url,
        label: height > 0 ? heightQualityLabel(height) : ((Math.round(bw / 1000) || '?') + ' kbps')
      });
    }
    return dedupeQualityLevels(out);
  }

  function findQualityLevel(id) {
    var want = String(id || '');
    for (var i = 0; i < qualityLevels.length; i++) {
      if (String(qualityLevels[i].id) === want) return qualityLevels[i];
    }
    return null;
  }

  function matchLevelToHeight(height) {
    var h = parseInt(height, 10) || 0;
    if (!h || !qualityLevels.length) return null;
    var best = null;
    var bestDiff = Infinity;
    for (var i = 0; i < qualityLevels.length; i++) {
      var lvl = qualityLevels[i];
      if (!lvl.height) continue;
      var diff = Math.abs(lvl.height - h);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = lvl;
      }
    }
    return best;
  }

  function sourceQualitySummary() {
    if (!qualityLevels.length) {
      if (playlistKind === 'media') return 'single-bitrate';
      if (playlistKind === 'probe-failed') return 'probe unavailable';
      return 'unknown';
    }
    var labels = [];
    for (var i = 0; i < qualityLevels.length; i++) {
      labels.push(qualityTierFromHeight(qualityLevels[i].height) || qualityLevels[i].label);
    }
    return labels.join('/');
  }

  function syncQualityIntoStreamInfo() {
    if (!status.streamInfo) status.streamInfo = {};
    status.streamInfo.qualities = qualityLevels.slice();
    status.streamInfo.qualityMode = qualityMode;
    status.streamInfo.selectedQuality = qualityMode === 'auto'
      ? 'Auto'
      : (findQualityLevel(qualityMode) ? findQualityLevel(qualityMode).label : heightQualityLabel(qualityMode));
    var w = status.streamInfo.width || 0;
    var h = status.streamInfo.height || 0;
    status.streamInfo.actualTier = qualityTierFromHeight(h);
    status.streamInfo.actualLabel = h ? heightQualityLabel(h) : '';
    status.streamInfo.resolution = w && h ? (w + 'x' + h) : (status.streamInfo.resolution || '—');
    status.streamInfo.decodedResolution = w && h ? (w + 'x' + h) : '—';
    status.streamInfo.engine = playbackEngine || '';
    status.streamInfo.playlistKind = playlistKind || '';
    status.streamInfo.sourceQualities = sourceQualitySummary();
    status.streamInfo.probeNote = qualityProbeNote || '';
    var matched = matchLevelToHeight(h);
    var locked = qualityMode !== 'auto' ? findQualityLevel(qualityMode) : null;
    var bitLevel = locked || matched || (qualityMode === 'auto' && qualityLevels[0] ? null : null);
    if (qualityMode !== 'auto' && locked) bitLevel = locked;
    else if (matched) bitLevel = matched;
    status.streamInfo.selectedBitrate = bitLevel && bitLevel.bandwidth
      ? Math.round(bitLevel.bandwidth / 1000) + ' kbps'
      : '';
    status.streamInfo.codec = (bitLevel && bitLevel.codecs) || (matched && matched.codecs) || '';
    // Never claim 4K from source labels alone — actualTier stays decoded-only.
    status.streamInfo.sourceHas4k = qualityLevels.some(function (q) { return q.height >= 2000; });
  }

  function clearTimers() {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  }

  function clearRetryTimer() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }

  function clearNetTimer() {
    if (netTimer) { clearTimeout(netTimer); netTimer = null; }
  }

  function playerIsOpen() {
    var screen = document.getElementById('playerScreen');
    return !!(screen && screen.classList.contains('active'));
  }

  function browserSaysOnline() {
    if (typeof navigator === 'undefined' || navigator.onLine === undefined) return true;
    return navigator.onLine !== false;
  }

  function nextRetryDelay(attempt) {
    var n = attempt || 0;
    if (n < 0) n = 0;
    if (n >= RETRY_DELAYS.length) return RETRY_DELAYS[RETRY_DELAYS.length - 1];
    return RETRY_DELAYS[n];
  }

  function classifyPlaybackFault(code, online) {
    if (online === false || code === 'offline') {
      return {
        title: 'Internet connection lost',
        detail: 'Your internet connection has been interrupted. Reconnecting...',
        retry: true,
        kind: 'offline'
      };
    }
    if (code === 2 || code === 'network' || code === 'stall' || code === 'timeout') {
      return {
        title: 'Reconnecting',
        detail: 'Trying to restore playback...',
        retry: true,
        kind: 'recover'
      };
    }
    if (code === 4 || code === 'unavailable') {
      return {
        title: 'Stream unavailable',
        detail: 'This channel is currently unavailable. Please try again later.',
        retry: true,
        kind: 'unavailable'
      };
    }
    if (code === 'unsupported') {
      return {
        title: 'Playback error',
        detail: 'Unable to play this channel. Please select another channel.',
        retry: false,
        kind: 'failed'
      };
    }
    return {
      title: 'Playback error',
      detail: 'Unable to play this channel. Please select another channel.',
      retry: code === 3 || code === 'media',
      kind: 'failed'
    };
  }

  function finalFault(kind) {
    if (kind === 'offline') return classifyPlaybackFault('offline', false);
    if (kind === 'failed' || kind === 'unsupported') return classifyPlaybackFault('unsupported');
    return classifyPlaybackFault('unavailable');
  }

  function noteMediaProgress() {
    lastProgressAt = Date.now();
    if (video) watchOrigin = video.currentTime;
  }

  /**
   * True when the stream has made recent progress.
   * Uses wall-clock lastProgressAt — comparing currentTime to watchOrigin at
   * sample time is unreliable because timeupdate keeps them nearly equal.
   */
  function mediaHealthy() {
    if (!video || userPaused || !lastProgressAt) return false;
    return (Date.now() - lastProgressAt) < STALL_PROGRESS_MS;
  }

  function showRecovery(fault) {
    status.recovering = true;
    status.loading = true;
    status.error = null;
    status.errorTitle = fault.title;
    status.recoveryDetail = fault.detail;
    status.buffering = true;
    status.playing = false;
    emit();
  }

  function showFinalFault(fault) {
    status.recovering = false;
    status.loading = false;
    status.recoveryDetail = '';
    status.errorTitle = fault.title;
    status.error = fault.detail;
    status.playing = false;
    status.buffering = false;
    emit();
  }

  function restoreSameChannel() {
    if (!currentChannel || !playerIsOpen() || userPaused) return;
    if (retryTimer) return;
    linkDown = !browserSaysOnline();
    if (linkDown) {
      showRecovery(classifyPlaybackFault('offline', false));
      armOfflineWait();
      return;
    }
    autoRetryCount = 0;
    showRecovery(classifyPlaybackFault('network', true));
    var token = playToken;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (token !== playToken || userPaused || !playerIsOpen()) return;
      startPlayback(currentChannel, true);
    }, 400);
  }

  function armOfflineWait() {
    if (netTimer) return;
    netTimer = setTimeout(function () {
      netTimer = null;
      if (!playerIsOpen() || !currentChannel || userPaused) return;
      if (browserSaysOnline()) {
        linkDown = false;
        restoreSameChannel();
        return;
      }
      linkDown = true;
      showRecovery(classifyPlaybackFault('offline', false));
      armOfflineWait();
    }, 15000);
  }

  function bindNetworkWatch() {
    if (netBound || !global.addEventListener) return;
    netBound = true;
    global.addEventListener('offline', function () {
      linkDown = true;
      if (!currentChannel || !playerIsOpen() || userPaused) return;
      if (status.playing && video && !video.paused && video.readyState >= 3) return;
      clearRetryTimer();
      showRecovery(classifyPlaybackFault('offline', false));
      armOfflineWait();
    });
    global.addEventListener('online', function () {
      linkDown = false;
      clearNetTimer();
      if (!currentChannel || !playerIsOpen() || userPaused) return;
      if (status.playing && video && !video.paused && video.readyState >= 2 && !status.recovering) return;
      restoreSameChannel();
    });
  }

  function destroyHls() {
    if (!hlsEngine) return;
    try { hlsEngine.destroy(); } catch (e) { /* ignore */ }
    hlsEngine = null;
  }

  function nativeCanPlayHls() {
    if (global.webOS || global.PalmSystem) return true;
    if (!video || !video.canPlayType) return false;
    var kind = '';
    try {
      kind = video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL') || '';
    } catch (e) { kind = ''; }
    return kind === 'probably' || kind === 'maybe';
  }

  function ensureHlsLibrary() {
    if (global.Hls && global.Hls.isSupported && global.Hls.isSupported()) return Promise.resolve(true);
    if (!global.MediaSource) return Promise.resolve(false);
    if (hlsLoadPromise) return hlsLoadPromise;
    hlsLoadPromise = new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = 'js/lib/hls.min.js';
      script.onload = function () {
        resolve(!!(global.Hls && global.Hls.isSupported && global.Hls.isSupported()));
      };
      script.onerror = function () { resolve(false); };
      document.head.appendChild(script);
    });
    return hlsLoadPromise;
  }

  function armLoadTimeout(token) {
    clearTimers();
    watchOrigin = video ? video.currentTime : 0;
    lastProgressAt = 0;
    var loadArmedAt = Date.now();
    var firstWait = (ElionStorage.getSettings().bufferSeconds || 3) * 1000 + 18000;
    loadTimer = setTimeout(function watch() {
      if (token !== playToken || userPaused) return;
      if (mediaHealthy()) {
        if (status.recovering && status.playing) {
          status.recovering = false;
          status.loading = false;
          status.recoveryDetail = '';
          status.error = null;
          emit();
        }
        loadTimer = setTimeout(watch, 15000);
        return;
      }
      // Allow temporary live-stream buffering without restarting playback.
      var baseline = lastProgressAt || loadArmedAt;
      var quietFor = Date.now() - baseline;
      if (quietFor < STALL_FAIL_MS) {
        loadTimer = setTimeout(watch, 5000);
        return;
      }
      var kind = !browserSaysOnline() || linkDown ? 'offline' : 'timeout';
      notePlaybackFailure(token, currentChannel, '', true, kind);
    }, firstWait);
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
      resolution: w && h ? (w + 'x' + h) : '—',
      url: activeStreamUrl || currentChannel.url,
      tracks: tracks
    };
    syncQualityIntoStreamInfo();
  }

  function bindVideo(el) {
    video = el;
    if (!video || bound) return;
    bound = true;
    bindNetworkWatch();

    video.addEventListener('waiting', function () {
      // Mid-stream segment gaps are normal for live IPTV — track buffering
      // for status text only; do not re-enter channel-loading overlay.
      status.buffering = true;
      emit();
    });
    video.addEventListener('playing', function () {
      status.playing = true;
      status.buffering = false;
      status.loading = false;
      status.recovering = false;
      status.recoveryDetail = '';
      status.error = null;
      status.errorTitle = '';
      autoRetryCount = 0;
      hlsSoftTries = 0;
      linkDown = !browserSaysOnline();
      userPaused = false;
      noteMediaProgress();
      clearNetTimer();
      updateStreamInfo();
      applyTrackPreferences();
      emit();
    });
    video.addEventListener('timeupdate', function () {
      if (!video || userPaused) return;
      if (video.currentTime > watchOrigin + 0.05) noteMediaProgress();
    });
    video.addEventListener('canplay', function () {
      status.buffering = false;
      if (status.playing) status.loading = false;
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
      // Temporary stall while already playing must not look like a new load.
      status.buffering = true;
      emit();
    });
    video.addEventListener('error', function () {
      if (!video._elionToken || video._elionToken !== playToken) return;
      if (userPaused) return;
      clearTimers();
      var err = video.error;
      var code = err ? err.code : 0;
      if (code === 1) return;
      var kind = code === 2 ? 'network' : (code === 3 ? 'media' : (code === 4 ? 'unavailable' : 'failed'));
      if (!browserSaysOnline()) kind = 'offline';
      notePlaybackFailure(playToken, currentChannel, '', true, kind);
    });
    video.addEventListener('loadstart', function () {
      // loadstart also fires on routine HLS/media pipeline activity.
      // Never promote it to status.loading — that flag is set only by
      // startPlayback / recovery so the overlay stays off mid-stream.
      status.buffering = true;
      emit();
    });
    video.addEventListener('loadedmetadata', function () {
      updateStreamInfo();
      applyTrackPreferences();
      emit();
    });
    video.addEventListener('ended', function () {
      if (!currentChannel) return;
      var settings = ElionStorage.getSettings();
      if (!settings.autoplayNext) return;
      var dur = video.duration;
      if (!isFinite(dur) || dur <= 0 || dur > 6 * 3600) return;
      playNext().catch(function () { /* the list may not have another item */ });
    });
  }

  function stopQuiet() {
    if (!video) return;
    try { video._elionToken = 0; } catch (e0) { /* ignore */ }
    destroyHls();
    try {
      video.pause();
      while (video.firstChild) video.removeChild(video.firstChild);
      video.removeAttribute('src');
      video.load();
    } catch (e) { /* ignore */ }
  }

  function stop() {
    clearTimers();
    clearRetryTimer();
    clearNetTimer();
    autoRetryCount = 0;
    hlsSoftTries = 0;
    userPaused = false;
    qualityProbeToken++;
    qualityLevels = [];
    abrStartBpsHint = 0;
    playbackEngine = '';
    playlistKind = '';
    qualityProbeNote = '';
    activeStreamUrl = '';
    masterStreamUrl = '';
    stopQuiet();
    status.playing = false;
    status.buffering = false;
    status.loading = false;
    status.recovering = false;
    status.recoveryDetail = '';
    status.error = null;
    status.errorTitle = '';
    emit();
  }

  function listQualityLevels() {
    var out = {
      supported: true,
      mode: qualityMode,
      tracks: [],
      message: 'Start a channel to choose video quality.'
    };
    out.tracks.push({
      id: 'auto',
      label: 'Auto (Recommended)',
      enabled: qualityMode === 'auto' || !currentChannel
    });
    if (!currentChannel) {
      out.message = 'Start a channel to inspect published resolutions. Auto remains available.';
      return out;
    }
    for (var i = 0; i < qualityLevels.length; i++) {
      var q = qualityLevels[i];
      out.tracks.push({
        id: String(q.id),
        label: q.label,
        height: q.height,
        bandwidth: q.bandwidth,
        enabled: String(qualityMode) === String(q.id)
      });
    }
    if (qualityLevels.length) {
      out.message = '';
    } else if (playlistKind === 'probe-failed') {
      out.message = 'Manual quality selection is unavailable for this channel (playlist could not be inspected). Auto remains available.';
    } else if (playlistKind === 'media') {
      out.message = 'This channel is a single-bitrate stream. Manual quality selection is unavailable; Auto stays active.';
    } else if (hlsEngine) {
      out.message = 'Quality options appear when the stream publishes multiple resolutions.';
    } else {
      out.message = 'Manual quality selection is unavailable until a multi-variant HLS master is detected. Auto remains available.';
    }
    return out;
  }

  function reconcilePreferredQuality() {
    if (qualityMode === 'auto') return;
    if (findQualityLevel(qualityMode)) return;
    // Keep the saved preference for later channels; use Auto on this stream only.
    qualityMode = 'auto';
    qualityProbeNote = (qualityProbeNote ? (qualityProbeNote + ' ') : '') +
      'Saved resolution is not published by this channel; using Auto.';
    syncQualityIntoStreamInfo();
  }

  function selectQuality(id) {
    var want = id == null ? 'auto' : String(id);
    if (!currentChannel) {
      try {
        if (global.ElionStorage) ElionStorage.saveSettings({ preferredQuality: want === 'auto' ? 'auto' : want });
      } catch (eSave) { /* ignore */ }
      qualityMode = want === 'auto' ? 'auto' : want;
      return {
        ok: want === 'auto',
        message: want === 'auto'
          ? 'Quality preference saved: Auto (Recommended)'
          : 'Start a channel before applying a manual resolution. Preference was saved for compatible channels.'
      };
    }
    if (want !== 'auto' && !findQualityLevel(want)) {
      return {
        ok: false,
        message: 'That resolution is not available for this channel. Choose Auto (Recommended) or another published option.'
      };
    }
    qualityMode = want;
    try {
      if (global.ElionStorage) ElionStorage.saveSettings({ preferredQuality: want });
    } catch (e0) { /* ignore */ }
    syncQualityIntoStreamInfo();
    emit();

    if (hlsEngine) {
      applyHlsJsQualityPreference(hlsEngine);
      updateStreamInfo();
      emit();
      return {
        ok: true,
        message: want === 'auto' ? 'Quality: Auto (Recommended)' : ('Quality: ' + (findQualityLevel(want).label || want))
      };
    }

    // Native webOS / progressive: Auto keeps the master playlist; a lock uses that variant URL.
    var playUrl = masterStreamUrl || (currentChannel && currentChannel.url) || activeStreamUrl;
    if (want !== 'auto') {
      var level = findQualityLevel(want);
      if (level && level.url) playUrl = level.url;
    }
    playUrl = ElionPlaylists.applyUdpProxy(playUrl);
    startPlayback(currentChannel, false, { streamUrl: playUrl, keepQuality: true });
    return {
      ok: true,
      message: want === 'auto'
        ? 'Quality: Auto (Recommended)'
        : ('Quality: ' + ((findQualityLevel(want) && findQualityLevel(want).label) || want) + ' — confirming decoded resolution…')
    };
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

  function notePlaybackFailure(token, channel, message, allowRetry, kind) {
    if (token !== playToken) return;
    if (userPaused || !playerIsOpen()) return;
    clearRetryTimer();
    var fault = classifyPlaybackFault(kind || 'failed', browserSaysOnline() && !linkDown);
    if (message && !fault.detail) fault.detail = message;
    if (!browserSaysOnline() || kind === 'offline') {
      linkDown = true;
      showRecovery(classifyPlaybackFault('offline', false));
      armOfflineWait();
      return;
    }
    var canRetry = allowRetry !== false && fault.retry && channel && autoRetryCount < MAX_AUTO_RETRY;
    if (canRetry) {
      var delay = nextRetryDelay(autoRetryCount);
      autoRetryCount++;
      showRecovery(classifyPlaybackFault('network', true));
      retryTimer = setTimeout(function () {
        retryTimer = null;
        if (token !== playToken || userPaused || !playerIsOpen()) return;
        startPlayback(channel, true);
      }, delay);
      return;
    }
    showFinalFault(finalFault(fault.kind));
  }

  function finishPlayPromise(token, channel, playPromise) {
    if (playPromise && typeof playPromise.then === 'function') {
      return playPromise.then(function () {
        if (token !== playToken) return false;
        status.playing = true;
        status.buffering = false;
        status.loading = false;
        status.error = null;
        autoRetryCount = 0;
        noteMediaProgress();
        pushRecent(channel);
        updateStreamInfo();
        emit();
        return true;
      }).catch(function (err) {
        if (token !== playToken) return false;
        var msg = (err && err.message) || 'Playback failed to start.';
        if (/interact|user|NotAllowed/i.test(msg)) {
          status.error = 'Press Play to start.';
          status.playing = false;
          status.buffering = false;
          status.loading = false;
          emit();
          return false;
        }
        notePlaybackFailure(token, channel, '', true, 'failed');
        return false;
      });
    }
    pushRecent(channel);
    return Promise.resolve(true);
  }

  function attachNative(url, format, token) {
    var source = document.createElement('source');
    source.setAttribute('src', url);
    source.setAttribute('type', buildMediaOption(format, qualityMode));
    video.appendChild(source);
    video.src = url;
    video._elionToken = token;
  }

  function applyHlsJsQualityPreference(engine) {
    if (!engine || !engine.levels || !engine.levels.length) return;
    if (qualityMode === 'auto') {
      try { engine.currentLevel = -1; } catch (e0) { /* ignore */ }
      return;
    }
    var want = parseInt(qualityMode, 10) || 0;
    var best = -1;
    var bestDiff = Infinity;
    for (var i = 0; i < engine.levels.length; i++) {
      var h = engine.levels[i].height || 0;
      if (!h) continue;
      var diff = Math.abs(h - want);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    if (best >= 0) {
      try { engine.currentLevel = best; } catch (e1) { /* ignore */ }
    }
  }

  function ingestHlsJsLevels(engine) {
    if (!engine || !engine.levels) return;
    var mapped = [];
    for (var i = 0; i < engine.levels.length; i++) {
      var lvl = engine.levels[i];
      var height = lvl.height || 0;
      var width = lvl.width || 0;
      var bw = lvl.bitrate || 0;
      if (!codecsLikelySupported(lvl.videoCodec || lvl.codecs || '')) continue;
      mapped.push({
        id: height > 0 ? String(height) : ('bw-' + bw),
        height: height,
        width: width,
        bandwidth: bw,
        codecs: lvl.videoCodec || '',
        url: lvl.url || (lvl.uri || ''),
        label: height > 0 ? heightQualityLabel(height) : ((Math.round(bw / 1000) || '?') + ' kbps'),
        hlsIndex: i
      });
    }
    mapped.sort(function (a, b) {
      if (b.height !== a.height) return b.height - a.height;
      return b.bandwidth - a.bandwidth;
    });
    qualityLevels = mapped;
    syncQualityIntoStreamInfo();
    emit();
  }

  function attachHlsJs(url, token, channel) {
    playbackEngine = 'hls.js';
    return ensureHlsLibrary().then(function (ok) {
      if (token !== playToken) return false;
      if (!ok || !global.Hls) {
        notePlaybackFailure(token, channel, '', false, 'unsupported');
        return false;
      }
      destroyHls();
      var limits = qualityAdaptiveLimits(qualityMode);
      var engine = new global.Hls({
        enableWorker: false,
        lowLatencyMode: false,
        // Never cap to the 1080p app surface — that blocked 4K/FHD ladders.
        capLevelToPlayerSize: false,
        startLevel: -1,
        abrEwmaDefaultEstimate: Math.max(limits.startBps, abrStartBpsHint || 0, 5000000),
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.8
      });
      hlsEngine = engine;
      engine.loadSource(url);
      engine.attachMedia(video);
      video._elionToken = token;
      engine.on(global.Hls.Events.MANIFEST_PARSED, function () {
        if (token !== playToken) return;
        ingestHlsJsLevels(engine);
        playlistKind = qualityLevels.length ? 'master' : 'media';
        if (qualityMode === 'auto' && qualityLevels.length && qualityLevels[0].bandwidth) {
          abrStartBpsHint = qualityLevels[0].bandwidth;
          try {
            engine.abrEwmaDefaultEstimate = Math.max(qualityLevels[0].bandwidth, 5000000);
          } catch (eAbr) { /* ignore */ }
        }
        applyHlsJsQualityPreference(engine);
        syncQualityIntoStreamInfo();
        emit();
      });
      engine.on(global.Hls.Events.LEVEL_SWITCHED, function () {
        if (token !== playToken) return;
        updateStreamInfo();
        emit();
      });
      engine.on(global.Hls.Events.ERROR, function (event, data) {
        if (token !== playToken || !data || !data.fatal || userPaused) return;
        var netErr = data.type === global.Hls.ErrorTypes.NETWORK_ERROR;
        var mediaErr = data.type === global.Hls.ErrorTypes.MEDIA_ERROR;
        if (hlsSoftTries < 1 && netErr) {
          hlsSoftTries++;
          try { engine.startLoad(); return; } catch (e1) { /* fall through */ }
        }
        if (hlsSoftTries < 1 && mediaErr) {
          hlsSoftTries++;
          try { engine.recoverMediaError(); return; } catch (e2) { /* fall through */ }
        }
        destroyHls();
        notePlaybackFailure(token, channel, '', true, netErr ? 'network' : (mediaErr ? 'media' : 'failed'));
      });
      return finishPlayPromise(token, channel, video.play());
    });
  }

  function downloadPlaylistText(url, timeoutMs) {
    if (!global.ElionUtils || typeof ElionUtils.downloadText !== 'function') {
      return Promise.reject(new Error('download unavailable'));
    }
    return ElionUtils.downloadText(url, { timeoutMs: timeoutMs || 2500, retries: 0 });
  }

  /**
   * Discover published HLS variants. Expands one nested master level when the
   * top playlist hides real resolutions behind another master.
   * Never invents rungs; never restarts playback by itself.
   */
  function discoverHlsVariants(url, token, depth) {
    depth = depth || 0;
    return downloadPlaylistText(url, depth === 0 ? 2500 : 3000).then(function (text) {
      if (token !== playToken) return [];
      if (!/#EXT-X-STREAM-INF/i.test(text || '')) {
        playlistKind = 'media';
        qualityProbeNote = 'Channel URL is a media playlist (single rendition), not a multi-variant master.';
        return [];
      }
      var levels = parseHlsMasterPlaylist(text, url);
      var needsExpand = depth < 1 && levels.length > 0 && (
        levels.length === 1 ||
        !levels.some(function (l) { return l.height >= 720; })
      );
      if (!needsExpand) {
        playlistKind = 'master';
        qualityProbeNote = '';
        return levels;
      }
      return Promise.all(levels.map(function (level) {
        return downloadPlaylistText(level.url, 3000).then(function (child) {
          if (!/#EXT-X-STREAM-INF/i.test(child || '')) return [level];
          return parseHlsMasterPlaylist(child, level.url);
        }).catch(function () { return [level]; });
      })).then(function (groups) {
        if (token !== playToken) return [];
        var flat = [];
        for (var i = 0; i < groups.length; i++) flat = flat.concat(groups[i] || []);
        playlistKind = 'master-nested';
        qualityProbeNote = 'Expanded nested HLS master playlist.';
        return dedupeQualityLevels(flat);
      });
    });
  }

  function applyDiscoveredLevels(levels) {
    qualityLevels = levels || [];
    reconcilePreferredQuality();
    if (qualityMode === 'auto' && qualityLevels.length && qualityLevels[0].bandwidth) {
      abrStartBpsHint = qualityLevels[0].bandwidth;
    }
    syncQualityIntoStreamInfo();
    emit();
  }

  function probeNativeHlsQualities(url, token) {
    var probeId = qualityProbeToken;
    discoverHlsVariants(url, token, 0).then(function (levels) {
      if (probeId !== qualityProbeToken || token !== playToken) return;
      applyDiscoveredLevels(levels);
    }).catch(function () {
      if (probeId !== qualityProbeToken || token !== playToken) return;
      playlistKind = 'probe-failed';
      qualityProbeNote = 'Could not inspect playlist from the app (often CORS). Native playback may still adapt.';
      syncQualityIntoStreamInfo();
      emit();
    });
  }

  /**
   * Brief probe before native attach so bps.start can target the highest
   * published rung. Falls through quickly if the probe is slow/fails.
   */
  function attachNativeHlsWithProbe(url, format, token, channel) {
    playbackEngine = 'native-hls';
    var settled = false;
    return new Promise(function (resolve) {
      function go() {
        if (settled || token !== playToken) {
          resolve(false);
          return;
        }
        settled = true;
        try {
          attachNative(url, format, token);
        } catch (e) {
          notePlaybackFailure(token, channel, '', false, 'failed');
          resolve(false);
          return;
        }
        finishPlayPromise(token, channel, video.play()).then(resolve, function () { resolve(false); });
      }

      var timer = setTimeout(function () {
        qualityProbeNote = qualityProbeNote || 'Started before playlist probe finished.';
        go();
      }, 2800);

      discoverHlsVariants(url, token, 0).then(function (levels) {
        if (token !== playToken) return;
        applyDiscoveredLevels(levels);
        clearTimeout(timer);
        go();
      }).catch(function () {
        if (token !== playToken) return;
        playlistKind = 'probe-failed';
        qualityProbeNote = 'Could not inspect playlist from the app (often CORS). Native playback may still adapt.';
        syncQualityIntoStreamInfo();
        emit();
        clearTimeout(timer);
        go();
      });
    });
  }

  function startPlayback(channel, isAutoRetry, opts) {
    opts = opts || {};
    var token = ++playToken;
    userPaused = false;
    if (!isAutoRetry) {
      autoRetryCount = 0;
      hlsSoftTries = 0;
      clearRetryTimer();
      clearNetTimer();
    }
    if (!opts.keepQuality) {
      qualityMode = readPreferredQuality() || 'auto';
      if (!isAutoRetry) {
        qualityLevels = [];
        qualityProbeToken++;
        abrStartBpsHint = 0;
        playlistKind = '';
        qualityProbeNote = '';
        playbackEngine = '';
      }
    }
    var masterUrl = ElionPlaylists.applyUdpProxy(channel.url);
    var url = opts.streamUrl || masterUrl;
    if (!opts.streamUrl) masterStreamUrl = masterUrl;
    activeStreamUrl = url;
    var format = detectFormat(url);
    currentChannel = channel;
    status.channel = channel;
    status.error = null;
    status.errorTitle = '';
    if (!isAutoRetry) {
      status.recovering = false;
      status.recoveryDetail = '';
    }
    status.loading = true;
    status.buffering = true;
    status.playing = false;
    status.format = format.label;
    status.streamInfo = { format: format.label, width: 0, height: 0, resolution: '—', tracks: [] };
    syncQualityIntoStreamInfo();
    emit();

    if (/DASH|MKV|UDP|unsupported/i.test(format.label)) {
      stopQuiet();
      notePlaybackFailure(token, channel, '', false, 'unsupported');
      return Promise.resolve(false);
    }

    stopQuiet();
    armLoadTimeout(token);

    var useHlsJs = format.transport === 'HLS' && !nativeCanPlayHls();
    if (useHlsJs) {
      return attachHlsJs(url, token, channel);
    }

    if (format.transport === 'HLS' && !opts.streamUrl) {
      return attachNativeHlsWithProbe(url, format, token, channel);
    }

    playbackEngine = format.transport === 'HLS' ? 'native-hls' : 'uri';
    try {
      attachNative(url, format, token);
    } catch (e) {
      notePlaybackFailure(token, channel, '', false, 'failed');
      return Promise.resolve(false);
    }

    if (format.transport === 'HLS') {
      probeNativeHlsQualities(masterStreamUrl || url, token);
    }

    return finishPlayPromise(token, channel, video.play());
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
      userPaused = false;
      video.play().catch(function (err) {
        if (userPaused) return;
        notePlaybackFailure(playToken, currentChannel, (err && err.message) || '', true, 'failed');
      });
    } else {
      userPaused = true;
      clearRetryTimer();
      clearNetTimer();
      status.recovering = false;
      status.recoveryDetail = '';
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
    listQualityLevels: listQualityLevels,
    selectQuality: selectQuality,
    applyTrackPreferences: applyTrackPreferences,
    getStatus: getStatus,
    onChange: onChange,
    getVideo: function () { return video; },
    getCurrentChannel: function () { return currentChannel; },
    detectFormat: detectFormat,
    classifyPlaybackFault: classifyPlaybackFault,
    nextRetryDelay: nextRetryDelay,
    parseHlsMasterPlaylist: parseHlsMasterPlaylist,
    dedupeQualityLevels: dedupeQualityLevels,
    heightQualityLabel: heightQualityLabel,
    qualityTierFromHeight: qualityTierFromHeight,
    buildMediaOption: buildMediaOption,
    qualityAdaptiveLimits: qualityAdaptiveLimits,
    discoverHlsVariants: discoverHlsVariants
  };
})(window);
