# Known issues

Date: 5 November 2026. Version under discussion: **1.0.9**.

Nothing in this file was reproduced on an LG television while the documentation was written.

## Player — channel change on a real TV

**NEEDS REAL-TV TESTING.**

Development notes said Up/Down did not reliably change channel while video was playing on the LG set. The current source does handle Up as next and Down as previous in `js/focus.js` when `ElionApp.isPlayerActive()` is true, including when the control bar is hidden. A short zap cooldown lives only in `playerChannelStep`.

That code path is not proof the 55NANO81T3A behaves the same way. Treat hardware channel changing as unverified.

## Player — control color and position

**IMPLEMENTED in 1.0.9 source, NEEDS REAL-TV TESTING.**

Earlier builds centered the bar and used emoji icons that could draw as orange boxes when the TV font lacked the glyph. v1.0.9 places `.player-control-bar` at `bottom: 8%`, uses dark `#0b1220` buttons, teal focus, and SVG icons for Category, Previous, Play/Pause, and Next.

Until someone looks at that build on the set, the old complaint stays open as a verification item.

## All Channels — extra pages

**IMPLEMENTED behavior, may match the report.**

`renderChannels` shows 40 channels per page and adds Previous/Next page controls when there are more. The full imported list is kept in memory (`ElionChannels.setBrowseList(all)`); the screen only paints one page.

This is not lazy destruction of channels. If the remote focus lands on the page buttons before the rows, or the user does not notice the page chip, it will feel as if more channels are locked behind Next. No separate TV session has confirmed the focus order.

## Navigation freezes

**NEEDS REAL-TV TESTING.**

v1.0.8 stopped the focus code from calling `getComputedStyle` on every key and from measuring every button on channel lists. Automated checks in `tests/test-performance.js` only read the source. They do not measure frame time on webOS 11.2.0.

## Audio and subtitles

**PARTIALLY IMPLEMENTED.**

Settings → Playback asks the live `<video>` for tracks. If `audioTracks` or subtitle `textTracks` are missing, the panel says so. It does not invent tracks. Many IPTV URLs played by the native webOS player never expose those lists. Changing a track does not call `playChannel`. A saved language is applied later only when a matching track exists (`applyTrackPreferences`).

Whether a given provider stream exposes tracks on this TV is unknown.

## Reload IPTV

**IMPLEMENTED, NEEDS REAL-TV TESTING.**

Home calls `refreshPlaylist` for the active playlist when it has an HTTP(S) URL. Paste-only playlists get an explanation instead of a wipe. A failed download is not supposed to delete the saved list (`importFromUrl`). A second refresh while one is running is rejected.

Network behavior on the TV (CORS, timeouts, Dev Mode DNS) has not been retested for this button.

## `luna-send command failed <not exist>`

**PREVIOUSLY REPORTED. Cause not verified.**

This string is not in the application source. It has been seen from webOS CLI/device tooling, not from ELION’s JavaScript. Possible places to look, without a confirmed cause:

- Developer Mode or Key Server turned off, so the CLI cannot reach a Luna service.
- Wrong device name, IP, or port (`9922` is typical).
- CLI and TV webOS versions that do not expose the service the command asked for.
- An `ares-*` command aimed at a service this web app does not install (ELION bundles no custom Luna service).

Do not treat that message as an ELION playback bug until the exact CLI command and TV logs are captured.

## Stale docs and helper text

- `docs/WEBOS_BUILD.md` and `docs/MANUAL_TV_TEST.md` still mention version 1.0.0 and, in the build guide, device name `lgqned`.
- `scripts/package.ps1` tells the operator to expect `com.elion.iptv_1.0.0_all.ipk` if `ares-package` is missing. A successful package uses the version in `appinfo.json`.

## Nova TV

Nova TV was named as a visual reference by the product owner. It is not a module in this repository. Its screens must not replace ELION’s code. No Nova source is stored here.

## Not claimed

- Content Store signing, longevity of a Developer Mode install, or DRM playback.
- Hardware decode of every codec an M3U might list.
- Git history of v1.0.0–v1.0.9 (only `.gitattributes` is committed).
