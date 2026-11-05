# ELION IPTV — project documentation

Documentation date: **5 November 2026**.

This file describes the repository as it is. It is the index for the other documents in the project root.

## Identity

| Item | Value | Verified from |
| --- | --- | --- |
| Name | ELION IPTV | `appinfo.json` `title` |
| Application id | `com.elion.iptv` | `appinfo.json` |
| Type | LG webOS web application (`type: web`) | `appinfo.json` |
| Package | IPK | `scripts/package.ps1`, files in `dist/` |
| Current version | **1.0.9** | `appinfo.json`, `package.json`, settings information panel |
| Languages | HTML, CSS, JavaScript (no framework, no TypeScript) | `index.html`, `css/app.css`, `js/` |
| UI toolkit | None (DOM strings and one stylesheet) | `js/screens.js` |
| Player | One HTML5 `<video>` plus webOS media type hints | `index.html`, `js/player.js` |
| PC tools | Node.js (tests), LG webOS TV CLI (`ares-package` and related) | `package.json`, `docs/WEBOS_BUILD.md` |
| Editor environment | Windows, Cursor | Owner’s development machine; not encoded in the app |

### Television named for this work

| Item | Value | How it is known |
| --- | --- | --- |
| Model | LG 55NANO81T3A.BEUYLJP | Stated by the owner |
| webOS | 11.2.0 | Stated by the owner |
| Firmware | 43.22.13 | Stated by the owner |

The app metadata does not store that model. `appinfo.json` only declares a 1920×1080 web app. No log in the repo proves those TV strings were read from the set on this date.

## Purpose

ELION IPTV is for someone who already has a legal M3U playlist and wants to browse and play it on an LG TV with the Magic Remote. The app does not include a channel subscription. Demo files under `sample/` are for development checks only and are excluded from the IPK.

## Documents

- [CHANGELOG.md](CHANGELOG.md) — versions 1.0.0–1.0.9
- [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) — feature status
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — open and unverified problems
- [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) — modules and build
- [TESTING_GUIDE.md](TESTING_GUIDE.md) — `npm run qc` and TV commands
- [README.md](README.md) — short start
- [docs/WEBOS_BUILD.md](docs/WEBOS_BUILD.md) — CLI notes (examples still say 1.0.0)
- [docs/MANUAL_TV_TEST.md](docs/MANUAL_TV_TEST.md) — paper checklist

`ANALYSIS.md` and `FINAL_REPORT.md` are older write-ups. Prefer the files above when they disagree.

## Version and packages

Naming: `dist/com.elion.iptv_<version>_all.ipk`.

Local files present on 5 November 2026 (size and clock time from the development PC):

| File | Bytes | Last write |
| --- | --- | --- |
| `com.elion.iptv_1.0.0_all.ipk` | 149938 | 00:15 |
| `com.elion.iptv_1.0.1_all.ipk` | 150234 | 00:19 |
| `com.elion.iptv_1.0.2_all.ipk` | 151468 | 00:30 |
| `com.elion.iptv_1.0.3_all.ipk` | 152442 | 00:38 |
| `com.elion.iptv_1.0.4_all.ipk` | 152178 | 00:41 |
| `com.elion.iptv_1.0.5_all.ipk` | 152204 | 00:52 |
| `com.elion.iptv_1.0.6_all.ipk` | 154070 | 00:59 |
| `com.elion.iptv_1.0.7_all.ipk` | 156368 | 01:02 |
| `com.elion.iptv_1.0.8_all.ipk` | 157446 | 01:09 |
| `com.elion.iptv_1.0.9_all.ipk` | 318432 | 18:34 |

Build:

```powershell
npm run qc
.\scripts\package.ps1
```

v1.0.9 is about twice the size of v1.0.8. This documentation pass did not unpack the IPK, so the extra bytes are not explained here.

Git history does not list these versions. The repository has a single commit, `3eebda7` (“Add .gitattributes”).

## Conflicting version text

| Location | Text |
| --- | --- |
| `appinfo.json`, `package.json`, settings info | 1.0.9 |
| `docs/WEBOS_BUILD.md` | 1.0.0 |
| `docs/MANUAL_TV_TEST.md` install example | 1.0.0 |
| `scripts/package.ps1` message if CLI is absent | 1.0.0 |

Trust `appinfo.json` for the build you install.

## Roadmap

Items already present in 1.0.9 source are marked that way. “Done on a TV” is still open for all of them.

### Priority 1 — Critical behavior on the set

- Confirm Up/Down channel change while a picture is showing. Source: implemented. TV: not verified.
- Confirm All Channels can reach every imported channel. Source: full list stored; UI pages of 40. TV: not verified.
- Confirm focus stays responsive. Source: v1.0.8 focus changes. TV: not verified.
- Magic Remote OK, Back, and arrows across Home and the player. TV: not verified.

### Priority 2 — Player chrome

- Dark buttons, teal focus, lower bar, four controls. Source: v1.0.9. TV: not verified.
- Adjust position again only if the set still clips the bar.

### Priority 3 — Reload

- Home **Reload IPTV** and safe failure. Source: v1.0.9. TV: not verified.

### Priority 4 — Audio and subtitles

- Settings → Playback. Source: uses real track lists only. TV: confirm with a stream that actually has alternate audio or subtitles, and with one that does not.

### Priority 5 — Visual polish

- Nova TV is a reference only. It is not in this repo. Any future layout work stays on ELION’s dark/teal CSS and must stay light enough for webOS.

### Priority 6 — Release

- Re-run `npm run qc`.
- Complete `docs/MANUAL_TV_TEST.md` on the target TV and write the results down.
- Decide Content Store requirements separately. A Developer Mode IPK is not a store submission.

## How to keep these files honest

When behavior changes:

1. Update [CHANGELOG.md](CHANGELOG.md) with the version.
2. Update [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).
3. Update [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — close an issue only after the check you name (source and/or TV).
4. Update [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) if modules or the package command change.
5. Update [TESTING_GUIDE.md](TESTING_GUIDE.md) if `npm run qc` or CLI commands change.
6. Update this file if the product direction or current version changes.

Do not mark **VERIFIED** unless the test that proved it is named. Automated source tests are not TV verification.

Allowed labels: IMPLEMENTED, VERIFIED, NEEDS REAL-TV TESTING, PARTIALLY IMPLEMENTED, PLANNED, BLOCKED, DEPRECATED, NOT IMPLEMENTED.

Do not put SSH passphrases, Key Server passwords, or private keys in these files.
