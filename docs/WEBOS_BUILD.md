# ELION IPTV — webOS 25 build, install, debug

This is an **LG webOS TV web application** packaged as an **`.ipk`**.  
It is **not** an Android APK. Do not attempt APK or unsupported USB “sideload APK” workflows.

Official references:

- [appinfo.json](https://webostv.developer.lge.com/develop/references/appinfo-json)
- [CLI Developer Guide](https://webostv.developer.lge.com/develop/tools/cli-dev-guide)
- [CLI Installation](https://webostv.developer.lge.com/develop/tools/cli-installation)
- [Developer Mode App](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)

## App identity

| Field | Value |
| --- | --- |
| ID | `com.elion.iptv` |
| Title | ELION IPTV |
| Type | `web` |
| Main | `index.html` |
| Version | `1.0.0` |
| Resolution | `1920x1080` |
| Back key | `disableBackHistoryAPI: true` (app handles Back) |

Permissions: this web app uses standard HTML5 network + media. No custom Luna JS service is bundled. Hosted `webOSTV.js` is included for platform helpers.

## 1. Install webOS TV CLI (PC)

1. Install Node.js (LTS).
2. Follow LG’s CLI install guide and install `@webosose/ares-cli` (or the package name shown on the current LG docs page).
3. Confirm:

```bash
ares-package --version
ares-setup-device --version
ares-install --version
ares-launch --version
ares-log --version
```

## 2. Enable Developer Mode on the TV

1. Install **Developer Mode** from LG Content Store on the TV.
2. Sign in with your LG developer account.
3. Turn **Dev Mode Status** ON.
4. Turn **Key Server** ON and note the passphrase.
5. Note the TV IP (TV network settings).

Dev Mode sessions expire; renew in the Developer Mode app if the TV stops accepting installs.

## 3. Register the TV with the CLI

```bash
ares-setup-device
```

Add device:

- name: e.g. `lgqned`
- IP / hostname: TV IP
- port: `9922` (typical for Developer Mode SSH)
- username: `prisoner`
- authentication: passphrase from Key Server

List devices:

```bash
ares-setup-device --list
```

## 4. Validate project (no CLI required)

From the project root:

```bash
node scripts/validate-package.js
npm test
```

## 5. Package IPK

PowerShell:

```powershell
.\scripts\package.ps1
```

Or:

```bash
ares-package . -o dist -n ^
  -e companion -e dist -e scripts -e tests -e docs -e node_modules -e .git -e sample
```

Expected output:

```text
dist/com.elion.iptv_1.0.0_all.ipk
```

`-n` skips minify (easier debugging). Remove `-n` for smaller packages after you are stable.

## 6. Install & launch

```bash
ares-install --device lgqned dist/com.elion.iptv_1.0.0_all.ipk
ares-launch --device lgqned com.elion.iptv
```

Close:

```bash
ares-launch --device lgqned --close com.elion.iptv
```

## 7. Logs & debugging

```bash
ares-log --device lgqned
```

Or follow LG docs for `ares-inspect` / Chrome DevTools remote debugging when supported by your CLI version.

Playback debugging tips:

1. Confirm the stream URL plays on another device on the **same LAN**.
2. Prefer HLS (`.m3u8`) for webOS native player.
3. If import fails with network/CORS wording, use **Paste M3U** or **Phone/PC companion**.
4. Watch on-screen player error text (codec / network / timeout) — ELION does not fake playback.
5. Check `ares-log` while switching channels.

## 8. Remote-control behavior

- Arrows move focus; OK/Enter activates
- Back: player → UI → home → `webOS.platformBack()` / exit
- Play/Pause hardware keys toggle playback when supported
- Pointer (Magic Remote) also works on focusable controls

## What is NOT supported

- Android APK install
- Third-party USB filesystem access for picking local M3U files (LG policy)
- Hosting an HTTP server **inside** the TV web app (companion runs on PC)

## Companion (optional Phone/PC import)

```bash
cd companion
node server.js
```

Set the printed LAN URL in **Settings → General → Companion server URL**, then **Get code**.
