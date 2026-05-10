var fs             = IMPORTS.require('fs');
var path           = IMPORTS.require('path');
var child_process  = IMPORTS.require('child_process');

function setError(future, message, code) {
	var error = new Error(message);
	error.errorText  = error.message;
	error.errorCode  = (code === undefined) ? -1 : code;
	future.exception = error;
}

function setResult(future, value) {
	future.result = value;
}

// ── URL helpers ────────────────────────────────────────────────────────────

function extractOrigin(url) {
	var m = url.match(/^(https?:\/\/[^\/]+)/i);
	return m ? m[1] : '';
}

function extractBaseDir(url) {
	var noQuery   = url.split('?')[0];
	var afterHost = noQuery.indexOf('/', 8);   // skip past https://
	if (afterHost < 0) return '/';
	var lastSlash = noQuery.lastIndexOf('/');
	var baseDir   = noQuery.substring(afterHost, lastSlash + 1);
	// If the last segment has no extension it's a directory, not a file
	var lastSeg   = noQuery.substring(lastSlash + 1);
	if (lastSeg && lastSeg.indexOf('.') < 0) {
		baseDir = baseDir + lastSeg + '/';
	}
	return baseDir;
}

function resolveUrl(href, origin, baseDir) {
	if (!href) return null;
	href = href.trim();
	if (/^https?:\/\//i.test(href)) return href;
	if (href.indexOf('//') === 0)   return 'https:' + href;
	if (href.charAt(0) === '/')     return origin + href;
	return origin + baseDir + href;
}

// ── HTML extraction helpers ────────────────────────────────────────────────

function extractTag(html, re) {
	var m = html.match(re);
	return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

// Matches <meta name/property="key" content="val"> in either attribute order
function extractMeta(html, key) {
	var escaped = key.replace(/\./g, '\\.');
	var patterns = [
		new RegExp('<meta[^>]+(?:property|name)=["\']' + escaped + '["\'][^>]+content=["\']([^"\']{1,300})["\']', 'i'),
		new RegExp('<meta[^>]+content=["\']([^"\']{1,300})["\'][^>]+(?:property|name)=["\']' + escaped + '["\']', 'i')
	];
	for (var i = 0; i < patterns.length; i++) {
		var m = html.match(patterns[i]);
		if (m) return m[1].trim();
	}
	return null;
}

// Matches <link rel="rel" href="..."> in either attribute order
function extractLinkHref(html, rel) {
	var patterns = [
		new RegExp('<link[^>]+rel=["\']' + rel + '["\'][^>]+href=["\']([^"\']{1,500})["\']', 'i'),
		new RegExp('<link[^>]+href=["\']([^"\']{1,500})["\'][^>]+rel=["\']' + rel + '["\']', 'i')
	];
	for (var i = 0; i < patterns.length; i++) {
		var m = html.match(patterns[i]);
		if (m) return m[1].trim();
	}
	return null;
}

// ── Icon selection ─────────────────────────────────────────────────────────

function pickBestIcon(icons, origin, baseDir) {
	if (!icons || !icons.length) return null;

	var candidates = [];
	for (var i = 0; i < icons.length; i++) {
		var icon = icons[i];
		var src  = icon.src || '';
		var type = (icon.type || '').toLowerCase();

		// Skip SVG and WebP — webOS cannot render these as launcher icons
		if (type === 'image/svg+xml'  || /\.svg($|\?)/i.test(src))  continue;
		if (type === 'image/webp'     || /\.webp($|\?)/i.test(src)) continue;
		if (type === 'image/x-icon'   || /\.ico($|\?)/i.test(src))  continue;

		var url   = resolveUrl(src, origin, baseDir);
		if (!url) continue;

		var sizes = (icon.sizes || '').split(/\s+/);
		for (var j = 0; j < sizes.length; j++) {
			var parts = sizes[j].toLowerCase().split('x');
			var w = parseInt(parts[0], 10) || 0;
			var h = parseInt(parts[1], 10) || 0;
			candidates.push({url: url, w: w, h: h});
		}
	}

	if (!candidates.length) return null;

	// Exact 64×64 match — no resize needed
	for (var k = 0; k < candidates.length; k++) {
		if (candidates[k].w === 64 && candidates[k].h === 64) {
			return {url: candidates[k].url, needsResize: false};
		}
	}

	// Otherwise pick the smallest icon that is still ≥ 64px on both axes
	// (least downscaling = best quality). Fall back to largest if all < 64.
	var good  = [];
	var small = [];
	for (var l = 0; l < candidates.length; l++) {
		var c    = candidates[l];
		var size = (c.w && c.h) ? Math.min(c.w, c.h) : (c.w || c.h || 192);
		if (size >= 64) { good.push({url: c.url, size: size}); }
		else            { small.push({url: c.url, size: size}); }
	}

	if (good.length) {
		good.sort(function(a, b) { return a.size - b.size; });
		return {url: good[0].url, needsResize: true};
	}
	if (small.length) {
		small.sort(function(a, b) { return b.size - a.size; });
		return {url: small[0].url, needsResize: true};
	}
	return null;
}

// ── curl wrapper ───────────────────────────────────────────────────────────

// Download url to outFile; calls cb(exitCode).
// Uses absolute path so the service's minimal PATH is not an issue.
// exec() runs through the shell, which inherits the webOS system proxy
// env vars (http_proxy / https_proxy) that the device sets for services.
// -k accepts the proxy's re-signed TLS cert.
function curlDownload(url, outFile, cb) {
	var safeUrl = url.replace(/"/g, '%22');
	var cmd = '/usr/bin/curl -k -s -L -m 20'
		+ ' -A "Mozilla/5.0 (Linux; webOS/2.2)"'
		+ ' -o "' + outFile + '"'
		+ ' "' + safeUrl + '"';
	child_process.exec(cmd, {timeout: 25000}, function(error) {
		cb(error ? 1 : 0);
	});
}

// Like curlDownload but sends an explicit Accept header. After downloading,
// re-writes the file via fs.readFile/fs.writeFile (same pattern as SL's
// cpyiconsvc) so the file gets 0644 permissions instead of curl's 0600 —
// otherwise addLaunchPoint can't read it.
function curlDownloadImage(url, outFile, cb) {
	var safeUrl = url.replace(/"/g, '%22');
	var cmd = '/usr/bin/curl -k -s -L -m 20'
		+ ' -H "Accept: image/png,image/jpeg,image/gif,image/*;q=0.8"'
		+ ' -A "Mozilla/5.0 (Linux; webOS/2.2)"'
		+ ' -o "' + outFile + '"'
		+ ' "' + safeUrl + '"';
	child_process.exec(cmd, {timeout: 25000}, function(error) {
		if (error) { cb(1); return; }
		// Re-create the file via fs so it gets default (0644) permissions
		fs.readFile(outFile, function(readErr, data) {
			if (readErr) { cb(1); return; }
			try { fs.unlinkSync(outFile); } catch(e) {}
			fs.writeFile(outFile, data, function(writeErr) {
				cb(writeErr ? 1 : 0);
			});
		});
	});
}
