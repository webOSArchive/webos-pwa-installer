# PWA Installer — Development Notes

## Platform

- webOS legacy (Enyo 1.0, ES5 only, ancient Node.js in services)
- Build: `node build.js` → produces `org.webosarchive.pwainstaller_1.0.0_all.ipk`
- Install to device: use the webOS SDK tools or device UI

## Debugging on Device

**Always investigate on the device before writing fixes.** Most problems are diagnosed in one step by looking at what's actually happening rather than guessing.

### novacom syntax (device must be connected via USB)

```bash
novacom -l                                        # list connected devices
novacom run file:///bin/ls -- -la /some/path/     # list directory with permissions
novacom run file:///bin/cat -- /path/to/file      # print file contents
novacom run file:///usr/bin/curl -- -k -s -L "https://example.com/manifest.json"  # fetch URL from device
```

The `file://` prefix is required. Arguments after `--` are passed to the command.

### Checklist when an icon (or any downloaded file) isn't working

1. **Does the file exist?** `novacom run file:///bin/ls -- -la /media/internal/.webosarchive/`
2. **What's in it?** `novacom run file:///bin/cat -- /path/to/file | head -5`
   - If it's HTML, the URL being downloaded is wrong — fix the URL, not the download logic.
   - If it's the right size (~tens of KB for a PNG icon), the download is fine.
3. **Can the device reach the URL directly?**
   `novacom run file:///usr/bin/curl -- -k -s -L -o /tmp/test.png "https://example.com/icon.png"`
   Then check `/tmp/test.png` size and contents.

Do all three before writing any code.

## Architecture

### Service (`fetchsvc`)
- Fetches HTML, parses manifest, downloads icon via curl, returns `{title, iconUrl, iconLocalPath}`
- `iconUrl` — remote URL, used by the app for the in-app preview (WebKit can load remote URLs freely)
- `iconLocalPath` — local file path, passed to `addLaunchPoint` for the launcher icon
- Icon written via `fs.readFile` + `fs.writeFile` (no encoding = binary Buffer) so the file gets 0644 permissions; `curl -o` alone creates 0600 files that `addLaunchPoint` can't read

### App (`Main.js`)
- Preview: `iconPreview.setSrc(iconUrl)` — loads from remote URL, avoids WebKit sandbox issues with `/media/internal/` paths
- Install: passes `iconLocalPath` directly to `addLaunchPoint` — Luna reads local files fine

## Known Gotchas

### URL resolution — always use trailing slashes
`extractBaseDir` treats a URL path segment with no extension and no trailing slash as a file, not a directory. `https://example.com/app` gives base `/` instead of `/app/`, breaking all relative URL resolution in the manifest and HTML.

**Encourage users to enter URLs with a trailing slash**, or ensure the fix in `extractBaseDir` (treating extensionless last segments as directories) is in place.

### Browser params format
- webOS Browser (`com.palm.app.browser`): `params: {target: url}`
- QupZilla (`com.nizovn.qupzilla`): `params: [url]` (array, not object)

### Luna service visibility
Service methods must be `"public": true` in `services.json`. `"public": false` makes them completely invisible on the Luna bus — calls silently fail with "unknown method."

### File permissions
Files created by `curl -o` are 0600 (root-only). `addLaunchPoint` runs as a different user and can't read them. Always re-create downloaded files via `fs.readFile` + `fs.writeFile` to get 0644 permissions.

### Download Manager SSL
`com.palm.downloadmanager` fails with status `-5` (SSL error) on HTTPS URLs when the device is behind a proxy that re-signs TLS certificates. Use `curl -k` in the service instead — it bypasses SSL verification and inherits the shell's proxy environment variables.

## Building & SDK

```bash
node build.js    # build → org.webosarchive.pwainstaller_1.0.0_all.ipk
```

Palm SDK CLI tools: `/opt/PalmSDK/Current/bin/` (`palm-package`, `palm-install`, `palm-launch`, `palm-log`)
Enyo 1.0 framework: `/opt/PalmSDK/Current/share/framework/enyo/1.0/framework/`
Sample apps (UI pattern reference): `/opt/PalmSDK/Current/share/applications/enyo/`

## TODO

- UI clean-up
- New icon (current icons are placeholders copied from shortcut-launcher)
- Icon picker UI (fallback when no icon is found automatically)
