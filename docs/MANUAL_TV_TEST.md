# ELION IPTV — Manual playback test (real LG webOS TV)

Automated unit tests **do not** prove live streaming. Use this checklist on a physical LG TV (webOS 25 / QNED 2025 preferred) with **your own legal M3U**.

## Before you start

1. Enable Developer Mode on the TV.
2. Install webOS CLI and package the app:

```powershell
.\scripts\package.ps1
ares-install --device <TV> dist\com.elion.iptv_1.0.0_all.ipk
ares-launch --device <TV> com.elion.iptv
```

3. Have a working M3U/M3U8 URL or pasted playlist you are authorized to use.
4. ELION ships **no** channels or subscriptions.

## Procedure

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 1 | Open ELION IPTV | Splash then Home / Welcome | |
| 2 | Add M3U (URL or paste) | Loading indicator; no permanent spinner | |
| 3 | Wait for parse | Toast with channel count; Home updates | |
| 4 | Open All Channels | Logos lazy-load; names/categories visible | |
| 5 | Open a category from `group-title` | Only that group’s channels | |
| 6 | Select a channel | Player opens fullscreen | |
| 7 | Compatible stream plays | Real video/audio (not a fake poster) | |
| 8 | Test another channel (Next) | Switches and plays or shows clear error | |
| 9 | Back to channel list | Player stops; list usable with remote | |
| 10 | Favorite a channel; open Favorites | Channel listed and playable | |
| 11 | Force-close / relaunch app | App starts without crash | |
| 12 | Confirm persistence | Playlist + favorites still present | |

## Remote-only check

Operate the full flow with Magic Remote only (arrows, OK, Back, Play/Pause). Focus must never disappear.

## Record results

- TV model / webOS version:
- Playlist type (HLS / TS / MP4 / mixed):
- Channels tested (names only — **do not** paste full stream URLs into public logs):
- Failures / error messages shown:

## Automated coverage already run in CI/dev

```bash
node tests/run-tests.js
```

Covers parser fixtures (including 2500-channel large list), search, favorites, settings, PIN hashing, URL sanitization. **Not** real streaming.
