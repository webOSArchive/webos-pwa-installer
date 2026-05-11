# PWA Installer

A webOS application that creates home screen launcher shortcuts for websites and Progressive Web Apps. Enter a URL, fetch the site's metadata, and install a named shortcut with the site's icon that opens directly in your browser of choice.

## How It Works

1. The user enters a website URL and taps **Fetch**
2. The service fetches the page HTML, finds the Web App Manifest (if present), and downloads the best available icon
3. The app shows a preview with the site's name and icon, both of which can be edited
4. The user taps **Install Shortcut** — a launcher entry is created that opens the URL in the selected browser

Supported browsers: the built-in webOS Browser and QupZilla 2.3+.

## Project Structure

```
pwa-installer/
├── build.js                          # Build script — produces the .ipk package
├── applications/
│   └── org.webosarchive.pwainstaller/
│       ├── source/Main.js            # UI logic (Enyo 1.0)
│       └── css/app.css               # Styles
└── services/
    └── org.webosarchive.pwainstaller.fetchsvc.service/
        ├── Requirements.js           # Shared helpers (URL parsing, curl wrappers)
        ├── FetchPwaAssistant.js      # fetchpwa — fetches metadata and icon
        ├── WriteBinaryAssistant.js   # writebinary — writes base64 data to a file
        └── services.json             # Service manifest
```

### The App (`Main.js`)

An Enyo 1.0 web app running inside webOS. Communicates with the system and service via Luna (`PalmService` components). Key flows:

- **Fetch**: calls `fetchpwa` on the service, receives `{title, iconUrl, iconLocalPath}`
- **Preview**: displays the site name in an editable field; loads the icon preview directly from the remote `iconUrl` (WebKit can fetch remote URLs freely)
- **Install**: calls `addLaunchPoint` with the downloaded `iconLocalPath` and the browser-appropriate params format

### The Service (`fetchsvc`)

A Node.js Luna service that does the network-heavy work the app can't do directly:

- Fetches page HTML with `curl` (follows redirects, uses system proxy via inherited env vars, `-k` to accept proxy-resigned TLS certs)
- Parses the HTML for `<title>`, `<link rel="manifest">`, `<link rel="apple-touch-icon">`, and `og:image`
- Fetches and parses the Web App Manifest if found
- Picks the best icon from the manifest (prefers smallest icon ≥ 64px; skips SVG, WebP, ICO)
- Downloads the icon with `curl`, then re-writes it via `fs.readFile` + `fs.writeFile` to ensure 0644 permissions so `addLaunchPoint` can read it
- Returns `{title, iconUrl, iconLocalPath}` to the app

Icons are stored in `/media/internal/.webosarchive/` on the device.

## Building

```bash
node build.js         # build only
node build.js install # build and install (requires device connected via USB)
```

Output: `org.webosarchive.pwainstaller_1.0.0_all.ipk`

## Browser Compatibility Notes

The two browsers require different `params` formats when creating a launch point:

| Browser | `params` format |
|---|---|
| webOS Browser (`com.palm.app.browser`) | `{target: url}` |
| QupZilla (`com.nizovn.qupzilla`) | `[url]` |

QupZilla must be installed separately and is not included. Visits [docs.webosarchive.org](http://docs.webosarchive.org) to learn more about browsers for webOS.

## Icon Credit

Icon found on pngtree.com, original artist not listed.