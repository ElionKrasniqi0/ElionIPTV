# Changelog

History is reconstructed from the source tree, IPK files in `dist/`, and development notes. Git does not contain these releases: the only commit found is `3eebda7` (“Add .gitattributes”).

Package timestamps below are filesystem `LastWriteTime` values on the Windows development machine (5 November 2026). They are not published store dates.

Status words:

- **IMPLEMENTED** — present in the 1.0.9 source.
- **REPORTED** — described in development notes; not re-proven from a commit message.
- **NEEDS REAL-TV TESTING** — not confirmed on the LG set by an automated test.

## v1.0.0 — package `dist/com.elion.iptv_1.0.0_all.ipk` (00:15)

**REPORTED.** First packaged webOS app: HTML shell, M3U import, channel lists, HTML5 player, settings, Magic Remote focus, splash and icons. Exact commit contents are not in git.

## v1.0.1 — `com.elion.iptv_1.0.1_all.ipk` (00:19)

**REPORTED.** Startup and compatibility work: `js/compat.js` (NodeList.forEach, Element.matches, HTTP URL parsing without relying only on `URL`).

## v1.0.2 — `com.elion.iptv_1.0.2_all.ipk` (00:30)

**REPORTED.** Playlist lifecycle, focus, and LG virtual keyboard activation (`ElionFocus.activateTextField`). Multiple playlists, URL import, and paste import are in the current `js/playlist-manager.js`.

## v1.0.3 — `com.elion.iptv_1.0.3_all.ipk` (00:38)

**IMPLEMENTED** in the current tree (introduced across this line of work; **NEEDS REAL-TV TESTING**):

- Preferred focus on channel rows after render (`ElionFocus.focusPreferred`, `focusChannelId`).
- One Back press leaves the player (`ElionApp.handleBack` / `closePlayer`).
- Up/Down channel change while the player is open (`playerChannelStep`).
- Favorite star is a separate control from the channel row (`toggle-fav`).
- Category filter applies on `<select>` change (`#groupFilter`).

## v1.0.4 — `com.elion.iptv_1.0.4_all.ipk` (00:41)

**IMPLEMENTED** in `css/app.css`: dark background and teal tokens `--accent` / `--accent-2`. Focus uses a teal ring. **NEEDS REAL-TV TESTING** for how that reads on the panel.

## v1.0.5 — `com.elion.iptv_1.0.5_all.ipk` (00:52)

**IMPLEMENTED.** `#app` is 100% of the viewport. Home shows ten destinations in a wide grid and hides the side rail (`body.screen-home`). **NEEDS REAL-TV TESTING** for overscan.

## v1.0.6 — `com.elion.iptv_1.0.6_all.ipk` (00:59)

**IMPLEMENTED.** Shared `screen-page` layout for Live TV, All Channels, Categories, Favorites, Recently Watched, and Search. Live TV can open playback automatically. Empty states and channel rows were enlarged. **NEEDS REAL-TV TESTING.**

## v1.0.7 — `com.elion.iptv_1.0.7_all.ipk` (01:02)

**IMPLEMENTED.**

- Up moves to the next channel; Down moves to the previous (`js/focus.js`).
- Channel OSD: `#channelZapOsd` (logo, name, number, programme line, status).
- In-player list opened from the player (`openPlayerChannelList`).
- Zap cooldown is separate from menu navigation.
- Older playback callbacks are ignored via `playToken` in `js/player.js`.

Physical reliability of Up/Down during video is **NEEDS REAL-TV TESTING**. A later report said it still failed on the set; that report was not reproduced in this documentation pass.

## v1.0.8 — `com.elion.iptv_1.0.8_all.ipk` (01:09)

**IMPLEMENTED** in `js/focus.js`, `js/screens.js`, `js/app.js`, `css/app.css`.

- List and grid focus moves by position instead of measuring every control (`moveStructured`).
- Focusable list is cached until the screen is rebuilt (`invalidateFocusCache`).
- Arrow hold repeats about every 70 ms; OK and Back ignore key repeat.
- Back no longer blocks other keys for 200 ms.
- Favorite toggle updates the star in place unless the channel is removed from Favorites.
- Player pointer movement is throttled.
- `tests/test-performance.js` added.

Whether freezes are gone on webOS 11.2.0 is **NEEDS REAL-TV TESTING**.

## v1.0.9 — `com.elion.iptv_1.0.9_all.ipk` (18:34) — current source

**IMPLEMENTED** in source. **NEEDS REAL-TV TESTING** for layout and playback.

- Player bar shows Category, Previous, Play/Pause, and Next, anchored near the bottom (`bottom: 8%` in `css/app.css`). Buttons use a dark fill and SVG icons.
- Home tile **Reload IPTV** calls `ElionPlaylists.refreshPlaylist` for the active URL playlist (`reloadActivePlaylist` in `js/screens.js`).
- Settings tab **Playback** lists audio and subtitle tracks only when `video.audioTracks` / `video.textTracks` expose them (`js/player.js`, `js/settings-ui.js`).

`npm run qc` was reported passing for this version during development on 5 November 2026. It was not run again while writing this changelog.
