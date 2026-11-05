# Testing guide

Date: 5 November 2026. App version: **1.0.9**.

Automated tests run on the PC with Node.js. They do not install the IPK and they do not open a stream on a television.

## Full check

```powershell
npm run qc
```

This is the gate used before packaging. Last time it was reported, during development on 5 November 2026, it passed for 1.0.9. It was not executed again for the documentation update.

Pieces, in order:

| Script | What it checks |
| --- | --- |
| `scripts/validate-package.js` | `appinfo.json` id `com.elion.iptv`, semver, required files, icons, `index.html` video and `app.js` |
| `tests/run-tests.js` | M3U fixtures, search, favorites, settings recovery, PIN hash, unsafe URLs |
| `tests/critical-path.js` | Import → categories → search → favorite → playable URL → persistence |
| `tests/test-import-focus.js` | URL helper, focus exports, Back key 461, IME helpers, playlist fields are real inputs |
| `tests/test-playlist-lifecycle.js` | Empty start, two playlists, switch, replace URL, persistence, delete confirm flag |
| `tests/test-resilience.js` | Bad rows, empty overwrite block, EPG throw, failed download keeps playlists, import lock |
| `tests/test-user-journey.js` | Home tiles including Reload IPTV, screen copy, focus helpers, player labels (source text) |
| `tests/test-channel-zap.js` | Up = next, OSD markup, zap cooldown, single key listener (source text) |
| `tests/test-performance.js` | No `getComputedStyle` in focus, cache invalidation, in-place favorite (source text) |
| `tests/test-player-controls.js` | Four player buttons, lower bar CSS, reload messages, audio/subtitle behavior on a fake video |
| `scripts/test-m3u.js` | Extra parser cases including the sample playlist |
| `scripts/test-epg.js` | XMLTV parse and match |

Shorter commands:

```powershell
npm test
npm run test:m3u
npm run test:epg
npm run test:critical
node scripts/validate-package.js
```

`tests/fixtures/` holds M3U samples (standard, groups, logos, duplicates, unsafe, large 2500). They are not installed on the TV.

## What automation does not cover

- Magic Remote timing on webOS 11.2.0
- Overscan and whether the lower control bar is fully visible
- Real HLS/TS decode
- Whether `audioTracks` / `textTracks` exist for a provider URL
- CORS from the TV network stack
- Developer Mode install, `luna-send`, or Content Store submission

## Desktop browser

`docs/WEBOS_BUILD.md` is the CLI guide. The README allows opening `index.html` or serving the folder for parser and layout smoke tests. That is not webOS and not a pass for remote keys.

## Package

```powershell
.\scripts\package.ps1
```

Requires `ares-package` on `PATH`. Writes `dist\com.elion.iptv_1.0.9_all.ipk` when `appinfo.json` is 1.0.9. Older IPKs in `dist/` are previous local builds (1.0.0 through 1.0.8), not deleted by the script.

## Physical TV

Checklist template: `docs/MANUAL_TV_TEST.md` (its sample install line still says 1.0.0; use the 1.0.9 IPK).

Device commands used in this project’s workflow (device name `LGTV` is an example):

```powershell
ares-device -D
ares-device -i -d LGTV
ares-novacom --device LGTV --getkey
ares-install --device LGTV --list
ares-install --device LGTV dist\com.elion.iptv_1.0.9_all.ipk
ares-launch --device LGTV com.elion.iptv
ares-inspect --device LGTV --app com.elion.iptv --open
```

Setup context (no secrets):

1. Install LG’s Developer Mode app from the Content Store on the TV.
2. Turn Dev Mode and Key Server on. The passphrase stays on the TV and in the CLI device profile. Do not copy it into the repo.
3. Register the set (`ares-setup-device`): port often `9922`, user `prisoner`, auth from Key Server.
4. Install and launch the IPK. Developer Mode installs expire and are not store distribution.
5. `ares-inspect` opens Web Inspector when that CLI and TV build allow it.

On the set, still check: Up/Down while video plays, the four player buttons, All Channels paging, Reload IPTV success and failure, Playback settings with a real stream, and focus after several minutes.

Record the TV model, webOS, and firmware next to any pass/fail. The development target named by the owner is LG 55NANO81T3A.BEUYLJP, webOS 11.2.0, firmware 43.22.13. Those values are not read back from the set in this repository.
