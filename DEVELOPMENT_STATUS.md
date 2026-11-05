# Development status

Documentation date: 5 November 2026.  
Source of truth for the version number: `appinfo.json` and `package.json`, both **1.0.9**.  
`js/settings-ui.js` information panel also prints **1.0.9**.

`docs/WEBOS_BUILD.md` and `docs/MANUAL_TV_TEST.md` still show **1.0.0** in examples. `scripts/package.ps1` still prints `dist\com.elion.iptv_1.0.0_all.ipk` when the CLI is missing. Those files were not changed in the documentation pass. The packaged filename follows `appinfo.json`.

Labels: IMPLEMENTED, NEEDS REAL-TV TESTING, PARTIALLY IMPLEMENTED, PLANNED, NOT IMPLEMENTED.

## Playlist management

| Capability | Status | Where |
| --- | --- | --- |
| Add by HTTP(S) URL | IMPLEMENTED | `importFromUrl` |
| Paste M3U text | IMPLEMENTED | `importFromText` / playlist screen |
| Local file picker | NOT IMPLEMENTED | LG does not give third-party web apps a USB picker (`docs/WEBOS_BUILD.md`) |
| Several playlists | IMPLEMENTED | `js/playlist-manager.js` |
| Select active playlist | IMPLEMENTED | `setActivePlaylist` |
| Rename | IMPLEMENTED | `renamePlaylist` |
| Replace URL | IMPLEMENTED | `replacePlaylistUrl` |
| Refresh URL playlist | IMPLEMENTED | `refreshPlaylist`, Home **Reload IPTV** |
| Delete with confirm | IMPLEMENTED | `removePlaylist` plus confirm dialog |
| Keep data if refresh download fails | IMPLEMENTED | `importFromUrl` catch path does not delete stored playlists |
| Persistence | IMPLEMENTED | `js/storage.js` (localStorage, IndexedDB for large lists) |
| Phone/PC companion | IMPLEMENTED | `companion/server.js`, `js/pairing.js` |

Reload and failed-refresh behavior are **NEEDS REAL-TV TESTING**.

## Channels

| Capability | Status | Notes |
| --- | --- | --- |
| All Channels | IMPLEMENTED | 40 channels per page (`pageSize` in `renderChannels`) |
| Categories from `group-title` | IMPLEMENTED | Opened immediately; no Apply button |
| Favorites | IMPLEMENTED | Separate star button |
| Recently Watched | IMPLEMENTED | Back returns Home |
| Search | IMPLEMENTED | Live filter; LG keyboard via OK on the field |
| Logos | IMPLEMENTED | Lazy images; letter fallback |
| Sort | IMPLEMENTED | Playlist order, A–Z, category |
| Category filter | IMPLEMENTED | Changes the list when the select changes |

Paging is intentional. A report that All Channels needed Previous/Next before more channels appeared matches this 40-row page. It is not a hidden second list. Whether the TV focus makes paging hard is **NEEDS REAL-TV TESTING**.

## Player

| Capability | Status |
| --- | --- |
| Full-viewport `<video>` | IMPLEMENTED |
| Previous / Play / Pause / Next | IMPLEMENTED on the lower control bar |
| Category opens the in-player channel list | IMPLEMENTED (`btnChannelList`) |
| Channel OSD | IMPLEMENTED (`#channelZapOsd`) |
| Buffering and error panel | IMPLEMENTED |
| Up = next, Down = previous while playing | IMPLEMENTED in `js/focus.js`; **NEEDS REAL-TV TESTING** |
| Back exits player, or closes the in-player list first | IMPLEMENTED; **NEEDS REAL-TV TESTING** |
| Audio track choice | PARTIALLY IMPLEMENTED — only if the video element exposes `audioTracks` |
| Subtitles and Off | PARTIALLY IMPLEMENTED — only real `textTracks` of kind subtitles/captions |
| External HLS library | NOT IMPLEMENTED — native webOS video only |

## Home

Tiles in `renderHomeHub` (shown after at least one channel exists):

1. Live TV  
2. All Channels  
3. Categories  
4. Favorites  
5. Recently Watched  
6. Search  
7. TV Guide  
8. My Playlists  
9. Reload IPTV (`data-action="reload-iptv"`)  
10. Settings  
11. About  

Wide layout: 12-column grid, four tiles then four, then three wider tiles. At 1366px and below: two columns. The side rail is hidden on Home.

Welcome (no channels) is a separate screen with **ADD PLAYLIST**. Reload is not on that screen.

## Settings (all present in `js/settings-ui.js`)

| Tab | Controls | Status |
| --- | --- | --- |
| General | Provider name, companion URL, UDP proxy fields, interface language | IMPLEMENTED. Languages other than English may still show English labels. |
| Appearance | Theme, text size, list layout, logos, animations, channel numbers | IMPLEMENTED |
| Content | Active playlist, sort order, category summary | IMPLEMENTED |
| Playback | Audio and subtitles for the current stream | PARTIALLY IMPLEMENTED; **NEEDS REAL-TV TESTING** |
| Parental | PIN, lock groups, lock channels by name match | IMPLEMENTED (PIN stored as a hash) |
| Miscellaneous | Remember last channel, buffer seconds, connection check, clear guide cache, reset settings, erase data | IMPLEMENTED |
| Information | Name, version 1.0.9, webOS note | IMPLEMENTED |

Saved keys also include `preferredAudio`, `preferredSubtitle`, `autoplayNext` (stored; no separate Home control was found for autoplay next).

## Navigation

IMPLEMENTED in `js/focus.js`: one keydown listener, spatial move, structured lists/grids, IME open on OK for text fields. **NEEDS REAL-TV TESTING** on the Magic Remote.

## Quality gate

Last known `npm run qc` result: passed for 1.0.9 during development on 5 November 2026. Not re-run for this documentation update. No physical TV session is recorded in the repository.
