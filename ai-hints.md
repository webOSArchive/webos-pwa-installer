# AI Hints — webOS Legacy Development

This file gives an AI assistant the context needed to work effectively on webOS legacy projects without rediscovering known platform quirks.

## Platform Basics

- **UI**: Enyo 1.0 framework, ES5 JavaScript only (no arrow functions, no `let`/`const`, no template literals)
- **Services**: Node.js, but a very old version — avoid newer APIs; `fs.readFileSync`, `fs.writeFile`, `fs.statSync`, `child_process.exec/spawn` are safe; `fs.openSync`/`fs.readSync`/`fs.closeSync` may not work
- **IPC**: Luna service bus — apps talk to services via `PalmService` components in Enyo
- **SDK**: `/opt/PalmSDK/Current/`

## Diagnose Before Fixing

When something doesn't work on device, **check what's actually happening before writing code**. Most problems are diagnosed in one novacom command.

### novacom (device connected via USB)

```bash
novacom -l                                             # list connected devices
novacom run file:///bin/ls -- -la /some/path/          # list files with permissions
novacom run file:///bin/cat -- /path/to/file           # print file contents
novacom run file:///usr/bin/curl -- -k -s "https://example.com/file"  # test a URL from the device
```

The `file://` prefix is required. Arguments go after `--`.

When a downloaded file isn't working: check its size and contents first. If `cat` shows HTML, the URL being fetched is wrong — fix the URL, not the download code.

## Luna Service Gotchas

- Service methods must be `"public": true` in `services.json` — `"public": false` makes them completely invisible on the bus; calls fail silently with "unknown method"
- Services return results via `future.result = {…}` and errors via `future.exception = error`
- Call `setResult`/`setError` helpers rather than assigning directly

## Networking in Services

- Use `curl` via `child_process.exec` for HTTP/HTTPS: it inherits shell proxy env vars (`http_proxy`/`https_proxy`) and `-k` accepts proxy-resigned TLS certs
- `com.palm.downloadmanager` fails with SSL error `-5` when behind a proxy that re-signs certificates — prefer curl
- After `curl -o file`, the file is created as 0600 (root-only). Re-write it via `fs.readFile` + `fs.writeFile` (no encoding argument = binary Buffer) to get 0644 so other services (e.g. `addLaunchPoint`) can read it

## WebKit / App Sandbox

- The app's WebKit context can load remote URLs freely (good for image previews)
- Loading local files from `/media/internal/` via `img.src` may fail depending on the path — use remote URLs for in-app display; pass local paths only to Luna services that read them directly

## URL Resolution

- A URL path without a trailing slash (e.g. `https://example.com/app`) is ambiguous — `app` could be a file or a directory. Treat extensionless last path segments as directories when computing a base path for resolving relative URLs
- Always test URL resolution logic with trailing-slash and no-trailing-slash variants

## addLaunchPoint

- `icon` must be a local filesystem path with 0644 permissions (see curl note above)
- `params` format varies by browser:
  - webOS Browser (`com.palm.app.browser`): `{target: url}`
  - QupZilla (`com.nizovn.qupzilla`): `[url]` (array)
