(function (global) {
  'use strict';

  function toast(message, ms) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, ms || 2800);
  }

  function setLoading(active) {
    var bar = document.getElementById('globalLoading');
    if (bar) bar.classList.toggle('active', !!active);
  }

  function channelLogo(channel, size, opts) {
    size = size || 64;
    opts = opts || {};
    var settings = ElionStorage.getSettings();
    var letter = ElionUtils.escapeHtml((channel.name || '?').charAt(0).toUpperCase());
    if (!settings.showLogos) {
      return '<div class="logo-fallback">' + letter + '</div>';
    }
    if (channel.logo && /^https?:\/\//i.test(channel.logo)) {
      // Lazy-load by default for lists; eager for player/continue card
      if (opts.eager) {
        return '<img class="logo" src="' + ElionUtils.escapeHtml(channel.logo) + '" alt="" width="' + size + '" height="' + size + '" onerror="this.style.display=\'none\';if(this.nextElementSibling)this.nextElementSibling.style.display=\'grid\'"><div class="logo-fallback" style="display:none">' + letter + '</div>';
      }
      return '<img class="logo lazy-logo" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="' + ElionUtils.escapeHtml(channel.logo) + '" alt="" width="' + size + '" height="' + size + '" onerror="this.style.display=\'none\';if(this.nextElementSibling)this.nextElementSibling.style.display=\'grid\'"><div class="logo-fallback" style="display:none">' + letter + '</div>';
    }
    return '<div class="logo-fallback">' + letter + '</div>';
  }

  var logoObserver = null;
  function observeLazyLogos(root) {
    root = root || document;
    var imgs = root.querySelectorAll('img.lazy-logo[data-src]');
    if (!imgs.length) return;
    if ('IntersectionObserver' in window) {
      if (!logoObserver) {
        logoObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var img = entry.target;
            var src = img.getAttribute('data-src');
            if (src) {
              img.setAttribute('src', src);
              img.removeAttribute('data-src');
              img.classList.remove('lazy-logo');
            }
            logoObserver.unobserve(img);
          });
        }, { root: null, rootMargin: '120px', threshold: 0.01 });
      }
      imgs.forEach(function (img) { logoObserver.observe(img); });
    } else {
      // Fallback: load first N only
      for (var i = 0; i < Math.min(imgs.length, 24); i++) {
        var img = imgs[i];
        img.setAttribute('src', img.getAttribute('data-src'));
        img.removeAttribute('data-src');
      }
    }
  }

  function channelRow(channel, opts) {
    opts = opts || {};
    var fav = ElionFavorites.isFavorite(channel.id);
    var settings = ElionStorage.getSettings();
    var locked = ElionParental.isLockedChannel(channel);
    var nn = ElionEPG.getNowNext(channel);
    var nowTitle = nn.now ? nn.now.title : '';
    var progress = nn.now ? Math.round(ElionEPG.progressOf(nn.now) * 100) : 0;
    var layout = settings.channelListLayout || 'detailed';
    var num = settings.showChannelNumbers ? '<div class="num">' + (channel.number || '') + '</div>' : '<div class="num"></div>';

    var metaExtra = '';
    if (layout === 'detailed') {
      metaExtra =
        '<p>' + ElionUtils.escapeHtml(channel.group || '') +
        (locked ? ' · 🔒' : '') +
        (nowTitle ? (' · Now: ' + ElionUtils.escapeHtml(nowTitle)) : '') +
        '</p>' +
        (nn.now ? '<div class="epg-mini-progress"><span style="width:' + progress + '%"></span></div>' : '');
    } else {
      metaExtra = '<p>' + ElionUtils.escapeHtml(channel.group || '') + (locked ? ' · 🔒' : '') + '</p>';
    }

    return (
      '<div class="channel-row-wrap">' +
        '<button class="channel-row" data-focusable data-action="play" data-id="' + ElionUtils.escapeHtml(channel.id) + '" type="button">' +
          num +
          channelLogo(channel) +
          '<div class="meta"><h4>' + ElionUtils.escapeHtml(channel.name) + '</h4>' + metaExtra + '</div>' +
        '</button>' +
        (opts.hideFav
          ? ''
          : '<button class="fav-toggle' + (fav ? ' on' : '') + '" data-focusable data-action="toggle-fav" data-id="' + ElionUtils.escapeHtml(channel.id) + '" type="button" title="' + (fav ? 'Remove favorite' : 'Add favorite') + '" aria-label="' + (fav ? 'Remove favorite' : 'Add favorite') + '">' +
              (fav ? '★' : '☆') +
            '</button>') +
      '</div>'
    );
  }

  function emptyState(title, text, actionLabel, action) {
    return (
      '<div class="empty-state">' +
        '<h3>' + ElionUtils.escapeHtml(title) + '</h3>' +
        '<p>' + ElionUtils.escapeHtml(text) + '</p>' +
        (actionLabel ? '<div class="btn-row" style="justify-content:center"><button class="primary" data-focusable data-action="' + action + '">' + ElionUtils.escapeHtml(actionLabel) + '</button></div>' : '') +
      '</div>'
    );
  }

  function bindChannelList(root, onPlay) {
    root.querySelectorAll('[data-action="play"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ch = ElionPlaylists.getChannelById(btn.getAttribute('data-id'));
        if (ch && onPlay) onPlay(ch);
      });
    });
    observeLazyLogos(root);
  }

  function ensureModalHost() {
    var host = document.getElementById('modalHost');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'modalHost';
    host.className = 'modal-backdrop';
    document.getElementById('app').appendChild(host);
    return host;
  }

  function showModal(options) {
    options = options || {};
    return new Promise(function (resolve) {
      var host = ensureModalHost();
      var previous = document.activeElement;
      if (ElionFocus && ElionFocus.isFocusable && ElionFocus.isFocusable(previous)) {
        ElionFocus.remember(previous);
      }
      host.classList.add('active');
      host.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true">' +
          '<h3>' + escape(options.title || 'ELION IPTV') + '</h3>' +
          '<p class="help">' + escape(options.message || '') + '</p>' +
          (options.input
            ? '<label>' + escape(options.inputLabel || 'Value') + '</label><input id="modalInput" data-focusable type="' + (options.inputType || 'text') + '" inputmode="' + (options.inputMode || (options.inputType === 'password' || options.inputType === 'number' ? 'numeric' : 'text')) + '" enterkeyhint="done" value="' + escape(options.value || '') + '" maxlength="' + (options.maxlength || 120) + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">'
            : '') +
          '<div class="btn-row">' +
            '<button class="primary" data-focusable id="modalOk">' + escape(options.okText || 'OK') + '</button>' +
            (options.cancel === false ? '' : '<button data-focusable id="modalCancel">' + escape(options.cancelText || 'Cancel') + '</button>') +
          '</div>' +
        '</div>';

      function close(result) {
        host.classList.remove('active');
        host.innerHTML = '';
        setTimeout(function () {
          if (!ElionFocus.restore()) ElionFocus.ensureFocusAlive();
        }, 30);
        resolve(result);
      }

      var ok = host.querySelector('#modalOk');
      var cancel = host.querySelector('#modalCancel');
      var input = host.querySelector('#modalInput');
      ok.addEventListener('click', function () {
        close(options.input ? { ok: true, value: input.value } : { ok: true });
      });
      if (cancel) cancel.addEventListener('click', function () { close({ ok: false }); });
      setTimeout(function () {
        // Visual focus on the field; OK/Enter or Magic Remote click opens the LG IME
        if (input) ElionFocus.focusEl(input, { spatial: true });
        else ElionFocus.focusEl(ok);
      }, 40);
    });
  }

  function escape(str) {
    return ElionUtils.escapeHtml(str);
  }

  function confirmDialog(message, title) {
    return showModal({ title: title || 'Confirm', message: message, okText: 'Yes', cancelText: 'No' }).then(function (r) {
      return !!r.ok;
    });
  }

  function promptDialog(message, value, title, opts) {
    opts = opts || {};
    return showModal({
      title: title || 'Input',
      message: message,
      input: true,
      inputType: opts.inputType || 'text',
      inputMode: opts.inputMode || undefined,
      maxlength: opts.maxlength || 120,
      value: value || '',
      okText: 'OK'
    }).then(function (r) {
      return r.ok ? r.value : null;
    });
  }

  function applyAppearance() {
    var s = ElionStorage.getSettings();
    var root = document.documentElement;
    root.setAttribute('data-theme', s.theme || 'dark');
    root.setAttribute('data-text', s.textSize || 'medium');
    root.style.setProperty('--accent', s.themeAccent || '#14B8A6');
    document.body.classList.toggle('no-anim', s.animations === false);
  }

  global.ElionUI = {
    toast: toast,
    setLoading: setLoading,
    channelLogo: channelLogo,
    channelRow: channelRow,
    emptyState: emptyState,
    bindChannelList: bindChannelList,
    observeLazyLogos: observeLazyLogos,
    showModal: showModal,
    confirmDialog: confirmDialog,
    promptDialog: promptDialog,
    applyAppearance: applyAppearance
  };
})(window);
