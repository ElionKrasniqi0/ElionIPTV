# Cursor prompt: ELION IPTV app redesign

Paste the prompt below into Cursor with this repository open. The screenshot supplied by the product owner is the visual reference for the home screen; the written requirements below define behavior.

---

## Prompt

You are working in the existing **ELION IPTV** repository. Overhaul the current application into a polished, reliable IPTV interface inspired by the supplied IPTV Smarters Pro screenshot while retaining ELION branding and the repository's existing working functionality.

### First, understand the existing app

Before editing, inspect `README.md`, `TECHNICAL_ARCHITECTURE.md`, `DEVELOPMENT_STATUS.md`, `KNOWN_ISSUES.md`, `TESTING_GUIDE.md`, `index.html`, `css/app.css`, and the relevant modules under `js/`. This is a plain HTML/CSS/JavaScript LG webOS app with no bundler. `index.html` loads scripts in a deliberate order and the code uses global `Elion*` modules. Do not migrate it to React, Vue, TypeScript, npm dependencies, or a build tool. Preserve the webOS app identity, package shape, current module contracts, and remote-control support.

Keep the existing playlist import/refresh, M3U parsing, storage, favorites, EPG/XMLTV, parental controls, search, channel browsing, player, companion pairing, error handling, and accessibility behavior working. Reuse existing modules and APIs where possible. Do not duplicate these subsystems or replace working code with static mock data. The app ships no IPTV content: only show media that exists in the user's imported playlist. Do not copy IPTV Smarters branding or assets; use ELION identity and the screenshot only as layout/style inspiration.

### Product and visual direction

Create a professional, premium television-first interface at the app's 1920×1080 design target, scaling cleanly to smaller TV viewports. Use a deep navy/black background with restrained blue light/radial texture, crisp white typography, vivid but controlled teal/blue/purple accents, large readable cards, consistent spacing, subtle depth, and clear selected/focus states. Keep the screen uncluttered and ensure text and controls remain readable from a couch. Avoid emoji as icons; use inline SVG or existing compatible assets. Add no external runtime asset or font dependency.

On launch, show a short branded splash/loading state with a large ELION logo. It must transition promptly to the app, including first-run/no-playlist state, and never remain stuck if initialization fails. In the main shell, use a top header with the ELION logo at left and, at right, a live local clock, current date, and clearly labeled/icon buttons for **Reload**, **Messages**, **Settings**, **?** (Help/About), and **X** (Exit). Update the clock/date without needless DOM churn; support a 12/24-hour preference where appropriate.

Below the header, make the primary destinations prominent, in this order: **Live TV**, **Movies**, **Series**, **Live with EPG**, **Add Playlist**, **Favorites**. Use large television-friendly cards/tiles, drawing on the screenshot's bold, colorful card layout. Provide sensible empty states and a visible Add Playlist call to action when there is no active playlist or no matching content. Do not show dead buttons: every visible action must work, or be explicitly disabled with an explanation.

### Required behavior

1. **Reload:** Refresh/re-import the active URL-based M3U using the existing playlist refresh lifecycle. Preserve saved channels if network fetch/parsing fails; show progress and a clear success/failure message. For paste-only playlists, explain why refresh is unavailable and offer the appropriate replace/import path. Prevent duplicate concurrent refreshes and keep navigation responsive.
2. **Messages:** Open a readable messages/inbox panel or dialog. Show available app/provider messages if such data exists; otherwise show a deliberate empty state and provide a clear way back. Never fabricate provider messages.
3. **Settings:** Open an organized, remote-navigable settings view containing **General Settings**, **EPG**, **Time Format**, **Content**, **Playback**, **Remember Last List and Channel**, **Parental Controls**, **Clear Favorites**, and **Remove Playlist**. Map these labels to existing settings and actions where possible. Implement missing preferences only with appropriate persistence, validation, and defaults. Destructive actions must have a confirmation dialog, and must not remove unrelated data. Reuse existing settings UI and storage rather than presenting duplicate conflicting controls.
4. **Help (`?`):** Open concise help/about information covering navigation, adding a playlist, and playback controls. Include app/version information from the existing source of truth.
5. **Exit (`X`):** Open a modal asking whether the user wants to exit, with **Yes** and **No**. No closes the modal and restores focus. Yes should use the supported webOS/app exit behavior if available; if the platform does not permit closing, show a clear, non-crashing explanation. Handle Escape/Back consistently with existing webOS navigation.
6. **Live TV:** Show playlist group/category cards first. Selecting a group opens its channels; selecting a channel starts playback. Include channel logos with robust fallbacks, useful channel metadata, EPG now/next when available, search/filter where practical, and favorite toggles. Keep the entire browse list available to next/previous channel controls even when rendering pages or virtualized/limited rows.
7. **Movies and Series:** Present only entries that can reasonably be identified from the active M3U metadata/categories. Preserve original playlist categorization and avoid claiming certainty when metadata is ambiguous. If the playlist has no recognizable movie/series entries, show a helpful empty state rather than sample content. Selecting an item should open it using the existing player path, with appropriate metadata and playback error handling.
8. **Live with EPG:** Provide a guide-oriented view using the existing XMLTV/EPG parser and channel matching. Clearly distinguish missing guide data from an empty channel list. Do not block browsing while a guide loads; support refresh/retry and stale cached data if already available.
9. **Add Playlist:** Make adding an M3U intuitive using the already supported URL and pasted-text methods; retain companion pairing if it exists. Validate URLs and input, describe supported formats, show import progress, and keep the previously active/saved playlist intact if a new import fails. Make active playlist selection and playlist management easy to find.
10. **Favorites:** List the user's actual saved favorite channels/items, preserve favorite toggling throughout the app, and provide a useful empty state. Clearing favorites must be confirmed.

### Player quality and compatibility

Make the existing player feel cohesive and professional: reliable full-screen video, legible channel/program OSD, buffering state, recoverable playback error UI, previous/next channel, play/pause, channel list, and Back behavior. Use the existing single `<video>` element and player module. Do not create parallel video elements, automatic retry loops, or overlapping playback attempts. Handle stale asynchronous play results, timeouts/cancellation where supported, and cleanup on channel change/exit so old streams cannot take over. Keep native webOS playback compatibility and accurately explain that codec, DRM, and track support depend on the TV and stream; do not promise universal stream compatibility or silently introduce a large third-party playback engine.

### Remote, accessibility, and responsive behavior

Treat LG TV remote/D-pad operation as a primary input, not an afterthought. Ensure every button, card, modal, list, and text field can be reached and activated with the existing focus system; focus is always visible, directional moves are predictable, Back closes the topmost dialog/panel before leaving its screen, and focus returns to the opener after closing. Use large hit targets and semantic buttons/labels. Preserve keyboard use on desktop for development. Verify layouts at 1920×1080 and narrower/common 16:9 sizes without clipped controls or accidental page scrolling.

### Performance and resilience requirements

- Keep startup fast and avoid unnecessary work before first paint.
- Keep large M3U/XMLTV parsing and search work chunked or otherwise yielding, following existing async patterns.
- Avoid rendering or measuring every playlist entry on every key press. Use bounded rendering/pagination if needed, while keeping navigation and playback lists correct.
- Debounce search, batch DOM updates, avoid repeated full-screen rebuilds for small state changes, and clean up timers/listeners when screens change.
- Prevent duplicate imports, guide loads, and play requests; show clear loading/error/empty states and always recover controls after failures.
- Guard storage reads/writes and malformed provider data. Escape untrusted playlist text before HTML insertion; validate URLs and never execute playlist-provided markup/scripts.
- Avoid long synchronous loops, unbounded retries, hot polling, layout thrashing, and errors caused by missing optional webOS/browser APIs.
- Do not log playlist URLs, credentials, or stream URLs.

### Implementation approach

Work in small, coherent edits. First map each requested feature to existing screens/modules and identify genuine gaps. Then implement the redesign by updating existing HTML/CSS/JS and adding a small module only if the current architecture truly needs one. Keep the script load order correct. Preserve compatible selectors and public methods used by other modules and tests. Keep all new state in the existing storage/settings approach with safe defaults and migration behavior. Update relevant documentation if behavior or navigation changes.

Do not delete tests or weaken assertions to make the app appear healthy. Do not hide errors, use fake playlist entries, or declare hardware behavior verified without testing on a TV. Avoid unrelated refactors. If an item is impossible in a plain webOS app (for example, forcibly terminating the app), implement the nearest supported behavior and document the limitation.

### Completion and verification

After implementation, review the diff for accidental removals, broken script order, unsafe HTML insertion, dangling event handlers/timers, and controls without actions. Run the repository's existing quality gate (`npm run qc`) and report actual results; fix regressions that are caused by your changes. Do not claim the app was run on a physical LG TV unless it was. Summarize:

- Screens and interactions implemented.
- Existing subsystems preserved or changed.
- Files changed and any settings/data migration.
- Exact verification commands and pass/fail results.
- Anything that still needs validation on a real webOS TV, especially playback, remote focus, and exit behavior.

Deliver a working, polished application in this repository, not just mockups or a plan.

---
