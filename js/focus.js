(function (global) {
  'use strict';

  /**
   * LG Magic Remote / keyboard spatial navigation for webOS TV.
   * Uses keyCode (legacy TV) and KeyboardEvent.key (modern) together.
   *
   * Virtual keyboard: webOS opens the IME only for real <input>/<textarea>
   * activation (user focus/click). Spatial arrow moves use a visual ring on
   * text fields; OK/Enter then calls native focus()+click() to open the IME.
   */

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
    ENTER: 13, ESC: 27, BACKSPACE: 8, BACK: 461,
    PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252,
    STOP: 413, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    INFO: 457
  };

  var root = null;
  var historyStack = [];
  var watchdog = null;
  var lastFocused = null;
  var lastKeyStamp = 0;
  var lastKeyCode = 0;
  var navLockedUntil = 0;
  var keyboardVisible = false;
  var activatingField = null;
  var activateStamp = 0;
  var inited = false;
  var focusGen = 0;
  var focusCache = { gen: -1, scope: null, list: null };
  var lastArrowMove = 0;
  var ARROW_REPEAT_MS = 70;

  function invalidateFocusCache() {
    focusGen++;
    focusCache.list = null;
    focusCache.scope = null;
  }

  function init(container) {
    root = container || document;
    if (inited) {
      ensureFocusAlive();
      return;
    }
    inited = true;
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('focusin', function (e) {
      if (isFocusable(e.target)) {
        lastFocused = e.target;
        markFocused(e.target);
      }
    }, true);
    document.addEventListener('focusout', function (e) {
      if (e.target === activatingField) activatingField = null;
    }, true);

    // Magic Remote pointer hover → sync visual focus (do not force IME open)
    document.addEventListener('mouseover', function (e) {
      if (keyboardVisible) return;
      var t = e.target;
      while (t && t !== document.body) {
        if (isFocusable(t)) {
          if (isTextEntryField(t)) {
            markFocused(t);
            lastFocused = t;
          } else if (document.activeElement !== t) {
            focusEl(t);
          }
          break;
        }
        t = t.parentNode;
      }
    }, true);

    // Pointer click on a text field: allow native focus/click; only assist if needed
    document.addEventListener('mousedown', function (e) {
      var t = e.target;
      if (isTextEntryField(t)) {
        lastFocused = t;
        markFocused(t);
        // Do not preventDefault — webOS needs the native pointer activation for IME
      }
    }, true);

    document.addEventListener('keyboardStateChange', function (e) {
      var vis = !!(e && e.detail && e.detail.visibility);
      keyboardVisible = vis;
      if (!vis) activatingField = null;
    }, false);

    if (watchdog) clearInterval(watchdog);
    // Light safety net only — do not rescan the DOM on a tight interval.
    watchdog = setInterval(ensureFocusAlive, 4000);
    if (watchdog && typeof watchdog.unref === 'function') watchdog.unref();
  }

  function activeScope() {
    var modal = document.getElementById('modalHost');
    if (modal && modal.classList.contains('active')) return modal;
    var player = document.getElementById('playerScreen');
    if (player && player.classList.contains('active')) return player;
    return document.getElementById('app') || document.body;
  }

  function isTextEntryField(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    var tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    var type = String(el.type || 'text').toLowerCase();
    return type !== 'button' && type !== 'submit' && type !== 'reset' &&
      type !== 'checkbox' && type !== 'radio' && type !== 'file' &&
      type !== 'image' && type !== 'hidden' && type !== 'range' &&
      type !== 'color';
  }

  function isTypingTarget(el) {
    return isTextEntryField(el) || (el && el.tagName === 'SELECT');
  }

  function isHiddenBranch(el) {
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return true;
      if (node.classList && node.classList.contains('screen-hidden')) return true;
      if (node.id === 'playerScreen' && node.classList && !node.classList.contains('active')) return true;
      node = node.parentElement;
    }
    return false;
  }

  function isFocusable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.classList.contains('is-disabled')) return false;
    if (el.tabIndex < -1) return false;
    if (isHiddenBranch(el)) return false;

    var sel = '[data-focusable], button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    try {
      return el.matches(sel);
    } catch (e) {
      return false;
    }
  }

  function getFocusables(scope) {
    scope = scope || activeScope();
    if (focusCache.list && focusCache.gen === focusGen && focusCache.scope === scope) {
      return focusCache.list;
    }
    var nodes = scope.querySelectorAll('[data-focusable], button, a[href], input, select, textarea');
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (isFocusable(nodes[i])) out.push(nodes[i]);
    }
    focusCache.gen = focusGen;
    focusCache.scope = scope;
    focusCache.list = out;
    return out;
  }

  function markFocused(el) {
    var all = document.querySelectorAll('.is-focused');
    for (var i = 0; i < all.length; i++) {
      if (all[i] !== el) all[i].classList.remove('is-focused');
    }
    if (el) el.classList.add('is-focused');
  }

  /**
   * @param {Element} el
   * @param {{spatial?: boolean}} opts spatial: visual ring only for text fields (IME opens on OK)
   */
  function focusEl(el, opts) {
    if (!el) return;
    opts = opts || {};

    if (opts.spatial && isTextEntryField(el)) {
      // Do not call native focus during D-pad move — that usually fails to open
      // the LG IME, and leaves the field "focused" so OK does nothing.
      var active = document.activeElement;
      if (isTextEntryField(active) && active !== el) {
        try { active.blur(); } catch (e) { /* ignore */ }
      }
      markFocused(el);
      lastFocused = el;
      ensureVisible(el);
      return;
    }

    // Single native focus() — avoid double-call loops that reopen/dismiss IME
    if (document.activeElement !== el) {
      try {
        el.focus();
      } catch (e2) { /* ignore */ }
    }
    markFocused(el);
    lastFocused = el;
    ensureVisible(el);
  }

  /**
   * Open the webOS virtual keyboard via native input activation.
   * Must run from a user key/pointer gesture (OK / Enter / click).
   */
  function activateTextField(el) {
    if (!el || !isTextEntryField(el)) return false;
    if (keyboardVisible && document.activeElement === el) return true;

    var now = Date.now();
    // Debounce reopen loops
    if (activatingField === el && (now - activateStamp) < 400) return true;
    activatingField = el;
    activateStamp = now;

    markFocused(el);
    lastFocused = el;

    try {
      el.focus();
    } catch (e) { /* ignore */ }

    // Pointer-style activation is what reliably invokes the LG IME after D-pad focus
    try {
      el.click();
    } catch (e2) { /* ignore */ }

    return true;
  }

  function ensureVisible(el) {
    if (!el || typeof el.scrollIntoView !== 'function') return;
    var parent = el.parentElement;
    while (parent && parent !== document.body) {
      if (parent.scrollHeight > parent.clientHeight + 8) break;
      parent = parent.parentElement;
    }
    if (!parent || parent === document.body) return;
    var top = el.offsetTop;
    var bottom = top + el.offsetHeight;
    if (top >= parent.scrollTop && bottom <= parent.scrollTop + parent.clientHeight) return;
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (e) {
      try { el.scrollIntoView(false); } catch (e2) { /* ignore */ }
    }
  }

  function ensureFocusAlive() {
    if (keyboardVisible) return;
    var active = document.activeElement;
    if (isTextEntryField(active)) {
      markFocused(active);
      return;
    }
    if (isFocusable(active)) {
      markFocused(active);
      return;
    }
    if (lastFocused && isFocusable(lastFocused) && document.body.contains(lastFocused)) {
      // Restore visual/native focus without re-clicking text fields (IME loop)
      if (isTextEntryField(lastFocused)) {
        markFocused(lastFocused);
        return;
      }
      focusEl(lastFocused);
      return;
    }
    var list = getFocusables();
    if (list.length) focusEl(list[0]);
  }

  function indexIn(list, el) {
    for (var i = 0; i < list.length; i++) if (list[i] === el) return i;
    return -1;
  }

  /**
   * O(1) / row-local moves for lists and grids.
   * Avoids measuring every focusable on the screen (the main TV freeze).
   */
  function moveStructured(current, direction) {
    var wrap = current.closest ? current.closest('.channel-row-wrap') : null;
    if (wrap && wrap.parentElement) {
      if (direction === 'right' && current.classList.contains('channel-row')) {
        return wrap.querySelector('.fav-toggle');
      }
      if (direction === 'left' && current.classList.contains('fav-toggle')) {
        return wrap.querySelector('.channel-row');
      }
      if (direction === 'up' || direction === 'down') {
        var wraps = wrap.parentElement.children;
        var wi = indexIn(wraps, wrap);
        if (wi < 0) return null;
        var step = direction === 'down' ? 1 : -1;
        var nwrap = wraps[wi + step];
        if (!nwrap || !nwrap.querySelector) return null;
        if (current.classList.contains('fav-toggle')) return nwrap.querySelector('.fav-toggle');
        return nwrap.querySelector('.channel-row') || nwrap.querySelector('[data-focusable]');
      }
    }

    var listItem = current.classList && current.classList.contains('player-channel-list-item') ? current : null;
    if (listItem && listItem.parentElement && (direction === 'up' || direction === 'down')) {
      var items = listItem.parentElement.querySelectorAll('.player-channel-list-item');
      var li = indexIn(items, listItem);
      if (li < 0) return null;
      return items[li + (direction === 'down' ? 1 : -1)] || null;
    }

    var grid = current.parentElement;
    if (grid && grid.classList &&
        (grid.classList.contains('hub-grid') || grid.classList.contains('category-grid') || grid.classList.contains('hub-grid-home'))) {
      var cells = grid.children;
      var gi = indexIn(cells, current);
      if (gi < 0) return null;
      var cols = 1;
      if (cells.length > 1) {
        var rowTop = cells[0].offsetTop;
        for (var c = 1; c < cells.length; c++) {
          if (cells[c].offsetTop !== rowTop) { cols = c; break; }
          if (c === cells.length - 1) cols = cells.length;
        }
      }
      var target = -1;
      if (direction === 'left') target = gi - 1;
      if (direction === 'right') target = gi + 1;
      if (direction === 'up') target = gi - cols;
      if (direction === 'down') target = gi + cols;
      if (direction === 'left' || direction === 'right') {
        var row = Math.floor(gi / cols);
        if (target < row * cols || target >= (row + 1) * cols) return null;
      }
      if (target < 0 || target >= cells.length) return null;
      var next = cells[target];
      return isFocusable(next) ? next : null;
    }
    return null;
  }

  function move(direction) {
    if (keyboardVisible) return;

    var scope = activeScope();
    var current = document.activeElement;
    if (lastFocused && isFocusable(lastFocused) && scope.contains(lastFocused) &&
        lastFocused.classList.contains('is-focused')) {
      current = lastFocused;
    }
    if (!isFocusable(current) || !scope.contains(current)) {
      var first = getFocusables(scope)[0];
      if (first) focusEl(first, { spatial: true });
      return;
    }

    var structured = moveStructured(current, direction);
    if (structured && isFocusable(structured)) {
      focusEl(structured, { spatial: true });
      return;
    }

    var cur = current.getBoundingClientRect();
    var cc = { x: cur.left + cur.width / 2, y: cur.top + cur.height / 2 };
    var candidates = getFocusables(scope);
    var best = null;
    var bestScore = Infinity;

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el === current) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) continue;
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var dx = cx - cc.x;
      var dy = cy - cc.y;
      var primary = 0;
      var secondary = 0;
      var ok = false;

      if (direction === 'left' && dx < -4) { ok = true; primary = -dx; secondary = Math.abs(dy); }
      if (direction === 'right' && dx > 4) { ok = true; primary = dx; secondary = Math.abs(dy); }
      if (direction === 'up' && dy < -4) { ok = true; primary = -dy; secondary = Math.abs(dx); }
      if (direction === 'down' && dy > 4) { ok = true; primary = dy; secondary = Math.abs(dx); }
      if (!ok) continue;

      var score = primary + secondary * 2.2;
      if (direction === 'left' || direction === 'right') {
        if (Math.abs(dy) > Math.max(cur.height, 40) * 1.6) score += 400;
      } else if (Math.abs(dx) > Math.max(cur.width, 40) * 1.6) {
        score += 400;
      }
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (best) focusEl(best, { spatial: true });
  }

  function resolveDirection(e) {
    var code = e.keyCode || e.which;
    var key = e.key || '';
    if (code === KEY.LEFT || key === 'ArrowLeft') return 'left';
    if (code === KEY.RIGHT || key === 'ArrowRight') return 'right';
    if (code === KEY.UP || key === 'ArrowUp') return 'up';
    if (code === KEY.DOWN || key === 'ArrowDown') return 'down';
    return null;
  }

  function isEnter(e) {
    var code = e.keyCode || e.which;
    var key = e.key || '';
    return code === KEY.ENTER || key === 'Enter' || key === 'Accept' || key === 'Select';
  }

  function isBack(e) {
    var code = e.keyCode || e.which;
    var key = e.key || '';
    return code === KEY.BACK || code === KEY.ESC || key === 'GoBack' || key === 'Back' ||
      key === 'Escape' || key === 'BrowserBack' ||
      (code === KEY.BACKSPACE && !isTextEntryField(e.target) && !keyboardVisible);
  }

  function noteKeyCost(t0, label) {
    var ms = Date.now() - t0;
    if (ms < 40) return;
    if (global.ElionLog) ElionLog.debug('slow remote ' + label, ms + 'ms');
  }

  function isDuplicateKey(e) {
    var code = e.keyCode || e.which || 0;
    var now = Date.now();
    if (e.repeat) return true;
    if (code && code === lastKeyCode && (now - lastKeyStamp) < 90) return true;
    lastKeyCode = code;
    lastKeyStamp = now;
    return false;
  }

  function onKeyDown(e) {
    var t0 = Date.now();
    var dir = resolveDirection(e);
    var typing = isTextEntryField(e.target) || keyboardVisible;

    if (dir) {
      if (keyboardVisible) return;
      if (isTextEntryField(e.target)) {
        if (dir === 'left' || dir === 'right') return;
        if (e.target.tagName === 'TEXTAREA' && (dir === 'up' || dir === 'down')) return;
      }
      // Hold-to-repeat moves lists smoothly; ignore bursts faster than one frame budget.
      if (e.repeat && (t0 - lastArrowMove) < ARROW_REPEAT_MS) {
        e.preventDefault();
        return;
      }
      lastArrowMove = t0;

      if (global.ElionApp && ElionApp.isPlayerActive && ElionApp.isPlayerActive() &&
          (dir === 'up' || dir === 'down')) {
        e.preventDefault();
        e.stopPropagation();
        if (ElionApp.isPlayerChannelListOpen && ElionApp.isPlayerChannelListOpen()) {
          move(dir);
          noteKeyCost(t0, 'list-move');
          return;
        }
        // Channel zap has its own cooldown inside playerChannelStep — not a global nav lock.
        ElionApp.playerChannelStep(dir === 'up' ? 1 : -1);
        noteKeyCost(t0, 'zap');
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      move(dir);
      noteKeyCost(t0, 'move');
      return;
    }

    if (isEnter(e)) {
      if (isDuplicateKey(e)) {
        // Do not preventDefault on text fields — that can block IME confirm
        if (!isTextEntryField(e.target) && !keyboardVisible) e.preventDefault();
        return;
      }

      // Spatial highlight may be on a text field while activeElement is still a button
      var field = null;
      if (isTextEntryField(e.target)) {
        field = e.target;
      } else if (lastFocused && isTextEntryField(lastFocused) && lastFocused.classList.contains('is-focused')) {
        field = lastFocused;
      }

      if (field) {
        if (keyboardVisible && document.activeElement === field) {
          // IME confirm / Done — do not intercept (allows search submit listeners, etc.)
          return;
        }
        // First OK on a text field: open LG virtual keyboard via native focus+click.
        // Stop other keydown listeners (e.g. search-on-Enter) from treating this as submit.
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        activateTextField(field);
        return;
      }

      // Watching with controls hidden: OK reveals the player bar.
      if (global.ElionApp && ElionApp.playerOkAction && ElionApp.playerOkAction()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      var t = e.target;
      if (!t) return;
      if (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SELECT') return;
      if (t.hasAttribute('data-focusable') || t.getAttribute('role') === 'button') {
        e.preventDefault();
        e.stopPropagation();
        try { t.click(); } catch (err) { /* ignore */ }
      }
      return;
    }

    if (isBack(e)) {
      // Dismiss IME first by blurring — do not navigate away while typing
      if (keyboardVisible || isTextEntryField(document.activeElement)) {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        } catch (errBlur) { /* ignore */ }
        keyboardVisible = false;
        activatingField = null;
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (isDuplicateKey(e)) return;
      if (global.ElionApp && typeof ElionApp.handleBack === 'function') {
        ElionApp.handleBack();
      }
      noteKeyCost(t0, 'back');
      return;
    }

    // While IME is open / typing, never hijack other keys (space, punctuation, etc.)
    if (typing) return;

    var code = e.keyCode || e.which;
    if (code === KEY.PLAY || code === KEY.PLAY_PAUSE || code === KEY.PAUSE) {
      e.preventDefault();
      if (global.ElionPlayer) ElionPlayer.togglePlayPause();
    }
  }

  function onKeyUp(e) {
    if (keyboardVisible || isTextEntryField(e.target)) {
      // Do not swallow keyup for IME / text entry
      if (isBack(e) && !keyboardVisible && !isTextEntryField(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (isBack(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function focusFirst(scope) {
    focusPreferred(scope || activeScope(), null);
  }

  /**
   * Prefer channel rows / hub tiles over toolbar "← Home" so OK watches TV,
   * not navigates away. opts.channelId restores a specific channel after player.
   */
  function focusPreferred(scope, opts) {
    opts = opts || {};
    scope = scope || activeScope();
    var list = getFocusables(scope);
    if (!list.length) {
      ensureFocusAlive();
      return false;
    }

    var preferred = null;
    var i;
    var el;

    if (opts.channelId) {
      for (i = 0; i < list.length; i++) {
        el = list[i];
        if (el.getAttribute('data-action') === 'play' && el.getAttribute('data-id') === opts.channelId) {
          preferred = el;
          break;
        }
      }
    }

    if (!preferred) {
      for (i = 0; i < list.length; i++) {
        el = list[i];
        if (el.getAttribute('data-action') === 'play') {
          preferred = el;
          break;
        }
      }
    }

    if (!preferred && opts.selector) {
      try {
        preferred = scope.querySelector(opts.selector);
        if (preferred && !isFocusable(preferred)) preferred = null;
      } catch (e) { preferred = null; }
    }

    if (!preferred) {
      for (i = 0; i < list.length; i++) {
        if (list[i].classList && (
          list[i].classList.contains('hub-tile') ||
          list[i].classList.contains('live-hero') ||
          list[i].classList.contains('category-card')
        )) {
          preferred = list[i];
          break;
        }
      }
    }

    if (!preferred) preferred = list[0];
    focusEl(preferred, { spatial: true });
    return true;
  }

  function remember(el) {
    if (el) historyStack.push(el);
  }

  function restore() {
    while (historyStack.length) {
      var el = historyStack.pop();
      if (isFocusable(el) && document.body.contains(el)) {
        focusEl(el, { spatial: isTextEntryField(el) });
        return true;
      }
    }
    ensureFocusAlive();
    return false;
  }

  global.ElionFocus = {
    KEY: KEY,
    init: init,
    focusEl: focusEl,
    focusFirst: focusFirst,
    focusPreferred: focusPreferred,
    getFocusables: getFocusables,
    invalidate: invalidateFocusCache,
    move: move,
    remember: remember,
    restore: restore,
    ensureFocusAlive: ensureFocusAlive,
    activeScope: activeScope,
    isFocusable: isFocusable,
    isTextEntryField: isTextEntryField,
    activateTextField: activateTextField,
    isKeyboardVisible: function () { return keyboardVisible; }
  };
})(window);
