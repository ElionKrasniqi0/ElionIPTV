# ELION IPTV — Initial analysis & plan

## Existing project state

The workspace was **empty** (0 source files). There was no prior webOS scaffold, JS/CSS, or packaging config to preserve.

## Platform decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| App model | LG webOS **web app** | Official path for TV apps; IPK via `ares-package` |
| UI stack | Vanilla HTML/CSS/JS | No unnecessary frameworks; best TV performance & packaging simplicity |
| Playback | HTML5 `<video>` + `mediaOption` HLS | Official webOS media approach |
| Persistence | `localStorage` | Available in web apps; USB FS blocked for 3rd-party apps |
| USB M3U | **Not implemented (honest)** | LG: third-party apps cannot access USB |
| Phone/PC import | LAN **companion relay** | TV cannot host inbound HTTP; TV polls PC relay with expiring codes |

## Architecture

```
UI (screens/focus) → Playlist Manager → M3U Parser
                  → Player (webOS mediaOption)
                  → Storage
                  → Pairing client ⇄ companion/server.js (LAN)
```

## Implementation status

Completed in v1.0.0:

1. webOS app shell (`appinfo.json`, icons, splash)
2. Remote focus navigation
3. All primary sections (Home → About)
4. M3U engine + URL/paste/companion import
5. Player, favorites, recents, search, EPG loader
6. Settings (UDP proxy, companion URL)
7. Companion relay + parser tests + packaging script

## Testing done

- `node scripts/test-m3u.js` — all passed
- Companion pair/submit/poll API smoke test — OK
- Device IPK install requires LG CLI + Developer Mode TV (documented in README)
