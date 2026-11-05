(function (global) {
  'use strict';

  /**
   * Parental controls with hashed PIN storage.
   * Uses Web Crypto SHA-256 when available; falls back to a non-reversible
   * salted digest suitable for local TV storage (not a password vault).
   */

  var SALT = 'elion-iptv-parental-v1';

  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      out += h.length === 1 ? '0' + h : h;
    }
    return out;
  }

  function fallbackHash(pin) {
    // FNV-1a inspired mix + salt — not crypto-grade, but never stores plain PIN.
    var s = SALT + '|' + String(pin);
    var h1 = 2166136261;
    var h2 = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 16777619);
      h2 = Math.imul(h2 ^ c, 2246822507) ^ Math.imul(h2, 3266489909);
    }
    return 'fb_' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  function hashPin(pin) {
    var value = String(pin || '');
    if (!value) return Promise.resolve('');
    if (global.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
      var data = new TextEncoder().encode(SALT + '|' + value);
      return crypto.subtle.digest('SHA-256', data).then(function (buf) {
        return 'sha256_' + toHex(buf);
      }).catch(function () {
        return fallbackHash(value);
      });
    }
    return Promise.resolve(fallbackHash(value));
  }

  function getConfig() {
    var s = ElionStorage.getSettings();
    return {
      enabled: !!s.parentalEnabled,
      pinHash: s.parentalPinHash || '',
      lockedGroups: s.lockedGroups || [],
      lockedChannels: s.lockedChannels || []
    };
  }

  function isLockedChannel(channel) {
    var cfg = getConfig();
    if (!cfg.enabled || !cfg.pinHash) return false;
    if (!channel) return false;
    if (cfg.lockedChannels.indexOf(channel.id) !== -1) return true;
    var group = channel.group || 'Uncategorized';
    return cfg.lockedGroups.indexOf(group) !== -1;
  }

  function verifyPin(pin) {
    var cfg = getConfig();
    if (!cfg.pinHash) return Promise.resolve(false);
    return hashPin(pin).then(function (hash) {
      return hash === cfg.pinHash;
    });
  }

  function setPin(newPin) {
    var pin = String(newPin || '').trim();
    if (!/^\d{4,8}$/.test(pin)) {
      return Promise.resolve({ ok: false, error: 'PIN must be 4–8 digits.' });
    }
    return hashPin(pin).then(function (hash) {
      ElionStorage.saveSettings({ parentalPinHash: hash, parentalEnabled: true });
      // Remove legacy plain-text field if present
      var s = ElionStorage.getSettings();
      if (s.parentalPin) {
        delete s.parentalPin;
        ElionStorage.set('settings', s);
      }
      return { ok: true };
    });
  }

  function changePin(oldPin, newPin) {
    return verifyPin(oldPin).then(function (ok) {
      if (!ok) return { ok: false, error: 'Current PIN is incorrect.' };
      return setPin(newPin);
    });
  }

  function unlockSession() {
    ElionStorage.set('parentalUnlockedUntil', Date.now() + 30 * 60 * 1000);
  }

  function isSessionUnlocked() {
    var until = ElionStorage.get('parentalUnlockedUntil', 0);
    return Date.now() < until;
  }

  function clearSession() {
    ElionStorage.remove('parentalUnlockedUntil');
  }

  function requireUnlock(channel) {
    if (!isLockedChannel(channel)) return Promise.resolve(true);
    if (isSessionUnlocked()) return Promise.resolve(true);
    return ElionUI.promptDialog('Enter parental PIN to open this channel.', '', 'Parental lock').then(function (pin) {
      if (pin == null) return false;
      return verifyPin(pin).then(function (ok) {
        if (!ok) {
          ElionUI.toast('Incorrect PIN');
          return false;
        }
        unlockSession();
        return true;
      });
    });
  }

  global.ElionParental = {
    hashPin: hashPin,
    getConfig: getConfig,
    isLockedChannel: isLockedChannel,
    verifyPin: verifyPin,
    setPin: setPin,
    changePin: changePin,
    requireUnlock: requireUnlock,
    unlockSession: unlockSession,
    clearSession: clearSession,
    isSessionUnlocked: isSessionUnlocked
  };
})(window);
