# Technical architecture

ELION IPTV is a single-page webOS web application. There is no bundler. `index.html` loads scripts in order. Shared state sits on `window` as `Elion*` objects.

Version: 1.0.9 (`appinfo.json`).

## Entry

| Path | Role |
| --- | --- |
| `index.html` | Shell: `#app`, side nav, `#content`, `#playerScreen`, toast |
| `css/app.css` | Layout, teal tokens (`--accent`, `--accent-2`), focus, player bar |
| `appinfo.json` | webOS id, version, `1920x1080`, `disableBackHistoryAPI: true` |
| `js/lib/webOSTV.js` | LG library (platform helpers, Back) |
| `js/lib/webOSTV-dev.js` | Dev helper loaded with the library |

Script order after the libraries: `compat.js`, `logger.js`, `utils.js`, `net.js`, `errors.js`, `storage.js`, `m3u-parser.js`, `search.js`, `playlist-manager.js`, `favorites.js`, `parental.js`, `channels.js`, `epg.js`, `player.js`, `pairing.js`, `focus.js`, `ui.js`, `settings-ui.js`, `screens.js`, `app.js`.

`ElionApp` boots on `DOMContentLoaded` and calls `ElionFocus.init`.

## Modules

### `js/compat.js` — `ElionCompat`

Polyfills `NodeList.forEach` and `Element.matches`. `parseHttpUrl` accepts only http(s), with a regex fallback when `URL` throws. Used by import and URL checks. Depends on nothing else in the app.

### `js/logger.js` — `ElionLog`

Redacts playlist and stream URLs before `console`. Used across modules. Default level includes debug.

### `js/utils.js` — `ElionUtils`

HTML escape, debounce, download with timeout, id helper. `downloadText` is what URL import uses. Depends on `ElionNet` / errors where retries are involved.

### `js/net.js` — `ElionNet`

Online/offline banner and `withRetry`. A 15 s interval re-reads `navigator.onLine`. Started from app boot.

### `js/errors.js` — `ElionErrors`

Maps failures to short messages (`INVALID_URL`, network, bad playlist). Window `error` and `unhandledrejection` listeners. UI toasts via `ElionUI` when present.

### `js/storage.js` — `ElionStorage`

Settings, playlists, channels, favorites, recents, EPG cache, last channel id. Large payloads can go to IndexedDB; localStorage holds smaller keys and a pointer. `saveSettings` merges onto `defaultSettings()`. Corrupt settings fall back to defaults. Depends on `ElionLog`.

### `js/m3u-parser.js` — `ElionM3U`

Parses `#EXTINF` / `#EXTGRP`, `tvg-id`, `tvg-logo`, `group-title`. Drops `javascript:` stream URLs. `parseAsync` yields with `setTimeout` so a large file can return to the event loop. `validateUrl` checks http(s). Used by `playlist-manager.js`. Tests: `scripts/test-m3u.js`, `tests/run-tests.js`, fixtures in `tests/fixtures/`.

### `js/search.js` — `ElionSearch`

In-memory index rebuilt after import. Chunked with `setTimeout`. Used by playlist manager search.

### `js/playlist-manager.js` — `ElionPlaylists`

Owns the active playlist and channel array. `importFromUrl`, `importFromText`, `importFromTextAsync`, `refreshPlaylist`, `replacePlaylistUrl`, `renamePlaylist`, `removePlaylist`, `setActivePlaylist`, `getChannelById`, `searchChannels`. Overlapping imports return “already in progress” and do not clear storage. A failed download does not delete playlists. Depends on M3U parser, storage, search, errors, net/utils.

### `js/favorites.js` — `ElionFavorites`

Toggle and list favorites for the active playlist’s channel ids. Storage-backed. Used by channel rows and player header updates.

### `js/parental.js` — `ElionParental`

SHA-256 PIN hash, locked groups and channels. `requireUnlock` runs before `playChannel`. Used by player and settings actions in `screens.js`.

### `js/channels.js` — `ElionChannels`

Sort modes and the browse id list for next/previous. `nextChannel` / `prevChannel` wrap inside that list, or the active playlist if the list is empty. They do not read another playlist. Used by the player zap path and screen renders.

### `js/epg.js` — `ElionEPG`

XMLTV parse, match on `tvg-id` / name, now/next, progress. Optional. Failure to parse does not wipe channels. Used by channel rows, Live hero, player header, TV Guide screen.

### `js/player.js` — `ElionPlayer`

One `<video id="playerVideo">`. `detectFormat` labels HLS (`.m3u8`), MP4, and other URLs. `playChannel` increments `playToken` and ignores stale `play()` results. `stop` / `stopQuiet` clears the element without creating a second video. `togglePlayPause`, `playNext`, `playPrev`. `listAudioTracks`, `selectAudioTrack`, `listTextTracks`, `selectTextTrack`, `applyTrackPreferences` talk to the browser track lists only. Depends on playlists (UDP rewrite), parental, channels, storage, EPG is not required here.

### `js/pairing.js` — `ElionPairing`

Talks to the companion on the LAN. The TV app does not open a listening server. Used by playlist and settings screens.

### `js/focus.js` — `ElionFocus`

Single capture-phase `keydown` / `keyup`. `move` uses `moveStructured` for channel rows, Home/category grids, and the in-player list; other controls use geometry. `getFocusables` is cached until `invalidate()`. `activateTextField` focuses and clicks inputs so webOS can open the IME. Back calls `ElionApp.handleBack`. Up/Down during playback call `playerChannelStep` unless the in-player list is open. Depends on `ElionApp` at key time.

### `js/ui.js` — `ElionUI`

Toasts, loading bar, `channelRow`, `channelLogo`, empty states, modal dialogs. Used by screens and app.

### `js/settings-ui.js` — `ElionSettingsUI`

HTML only. Clicks are handled in `screens.js` `handleAction`. Tabs: general, appearance, content, playback, parental, misc, info.

### `js/screens.js` — `ElionScreens`

`navigate(name)` sets `innerHTML` of `#content` and wires clicks. Screens: home, more, live, channels, categories, category, favorites, recents, search, epg, playlists, settings, about. `reloadActivePlaylist` is the Home refresh action. Depends on playlists, channels, EPG, UI, focus, storage, favorites, settings UI, and `ElionApp.openPlayer`.

### `js/app.js` — `ElionApp`

Clock, chrome, `openPlayer`, `closePlayer`, zap OSD, in-player list, player button bindings, Back stack. Depends on player, focus, screens, UI, EPG, favorites.

## Screen rendering

There is no virtual DOM. Each `navigate` or `render` replaces `#content`. Focus cache is invalidated after that. Favorite toggle updates one button unless the Favorites screen must drop a row.

All Channels pages 40 rows. The browse list passed to the player for that screen is the full filtered list, not only the visible page (`setBrowseList(all)` before slicing).

## Playback path

1. Row OK → `openPlayer(channel)`.
2. `playChannel` → parental check → `startPlayback`.
3. Remote Up/Down → `playerChannelStep` → `playChannel` on the neighbor from `ElionChannels`.
4. Back → `closePlayer` → `stop` → re-render the list and focus that channel id.

## Storage keys (logical)

Settings object (see `defaultSettings`), playlist metadata, channel records, favorites, recents, EPG cache, `lastChannelId`. PIN is `parentalPinHash` only.

## Tests and package

`npm run qc` runs `scripts/validate-package.js`, `tests/run-tests.js`, `tests/critical-path.js`, `tests/test-import-focus.js`, `tests/test-playlist-lifecycle.js`, `tests/test-resilience.js`, `tests/test-user-journey.js`, `tests/test-channel-zap.js`, `tests/test-performance.js`, `tests/test-player-controls.js`, `scripts/test-m3u.js`, `scripts/test-epg.js`.

`scripts/package.ps1` runs validation, then:

```text
ares-package <root> -o dist -n -e companion -e dist -e scripts -e tests -e docs -e sample -e node_modules -e .git -e ANALYSIS.md -e FINAL_REPORT.md
```

Output name: `dist/com.elion.iptv_<appinfo version>_all.ipk`.

Companion (`companion/server.js`) and `sample/` stay off the TV package.

## Compatibility notes verified in code

- App type `web`, resolution field `1920x1080`.
- Back is handled in JS because `disableBackHistoryAPI` is true.
- No custom JS service in the package.
- UDP proxy is an address rewrite toward an external helper, not a server inside the TV.
