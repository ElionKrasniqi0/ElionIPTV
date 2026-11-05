# ELION IPTV

LG webOS IPTV application for watching channels from playlists the user adds. It is a web app (`com.elion.iptv`) packaged as an IPK. It is not an Android app.

**Current version in `appinfo.json` and `package.json`:** 1.0.9  
**Target set used during development:** LG 55NANO81T3A.BEUYLJP, webOS 11.2.0, firmware 43.22.13 (reported by the owner; not re-checked from the TV while writing this file).

Full documentation:

| Document | Contents |
| --- | --- |
| [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) | Purpose, features, version, maintenance rules |
| [CHANGELOG.md](CHANGELOG.md) | v1.0.0 through v1.0.9 |
| [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) | What is implemented versus awaiting a real TV |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Open problems and unverified reports |
| [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) | Modules, data flow, packaging |
| [TESTING_GUIDE.md](TESTING_GUIDE.md) | Automated tests and TV checks |
| [docs/WEBOS_BUILD.md](docs/WEBOS_BUILD.md) | CLI install notes (some examples still say 1.0.0) |
| [docs/MANUAL_TV_TEST.md](docs/MANUAL_TV_TEST.md) | Paper checklist for a physical TV |

## What the app does

- Import an M3U playlist by web address, pasted text, or the optional phone/computer companion.
- Browse channels, categories, favorites, recent channels, and search.
- Play a channel in the webOS HTML5 video element.
- Optional XMLTV guide.
- Settings for appearance, parental PIN, and playback tracks when the stream exposes them.

ELION does not ship channels. `sample/demo.m3u` is for parser and desktop checks only.

## Develop and package

From the project folder in PowerShell:

```powershell
npm run qc
.\scripts\package.ps1
```

The package command writes `dist\com.elion.iptv_<version>_all.ipk`. For 1.0.9 that file is `dist\com.elion.iptv_1.0.9_all.ipk`.

Developer Mode install (example device name `LGTV`):

```powershell
ares-install --device LGTV dist\com.elion.iptv_1.0.9_all.ipk
ares-launch --device LGTV com.elion.iptv
```

A Developer Mode install is temporary development software. It is not an LG Content Store release.

`npm run qc` does not prove playback or Magic Remote behavior on a television.
