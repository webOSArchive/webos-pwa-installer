var FetchPwaAssistant = function() {};

FetchPwaAssistant.prototype.run = function(future) {
	var args = this.controller.args;
	if (!args.url) {
		setError(future, "url parameter is required");
		return;
	}

	var url = args.url.trim();
	if (!/^https?:\/\//i.test(url)) {
		url = 'http://' + url;
	}

	var storageDir = '/media/internal/.webosarchive/';
	var timestamp  = new Date().getTime();
	var htmlFile   = '/tmp/pwa_html_' + timestamp + '.html';

	// Ensure storage directory exists
	try { fs.mkdirSync(storageDir, 0755); } catch(e) {}

	// Try each candidate URL in order, skipping WebP (webOS can't render it).
	// Calls setResult on future when done (with iconLocalPath null if all fail).
	function tryIconCandidates(candidates, idx, appName) {
		if (idx >= candidates.length) {
			setResult(future, {title: appName, iconLocalPath: null, needsResize: false});
			return;
		}

		var iconLocalPath = storageDir + 'icon_' + timestamp + '.png';
		curlDownloadImage(candidates[idx].url, iconLocalPath, function(dlCode) {
			if (dlCode === 0) {
				try {
					var stat = fs.statSync(iconLocalPath);
					if (stat.size >= 100) {
						setResult(future, {
							title:         appName,
							iconUrl:       candidates[idx].url,
							iconLocalPath: iconLocalPath,
							needsResize:   candidates[idx].needsResize
						});
						return;
					}
				} catch(e) {}
				try { fs.unlinkSync(iconLocalPath); } catch(e) {}
			}
			tryIconCandidates(candidates, idx + 1, appName);
		});
	}

	// ── Step 1: Fetch the page HTML ──────────────────────────────────────

	curlDownload(url, htmlFile, function(htmlCode) {
		var html = '';
		try { html = fs.readFileSync(htmlFile, 'utf8'); } catch(e) {}
		try { fs.unlinkSync(htmlFile); } catch(e2) {}

		if (htmlCode !== 0) {
			setError(future, 'curl exit ' + htmlCode + ' fetching ' + url);
			return;
		}
		if (!html) {
			setError(future, 'Empty response from ' + url);
			return;
		}

		var origin  = extractOrigin(url);
		var baseDir = extractBaseDir(url);

		// ── Step 2: Extract metadata ──────────────────────────────────────

		var title = extractTag(html, /<title[^>]*>([^<]{1,200})<\/title>/i) ||
		            extractMeta(html, 'application-name')                    ||
		            extractMeta(html, 'og:title')                            ||
		            origin.replace(/^https?:\/\//, '');

		var manifestHref  = extractLinkHref(html, 'manifest');
		var appleHref     = extractLinkHref(html, 'apple-touch-icon') ||
		                    extractLinkHref(html, 'apple-touch-icon-precomposed');
		var ogImageUrl    = extractMeta(html, 'og:image');

		var manifestUrl   = resolveUrl(manifestHref, origin, baseDir);
		var appleIconUrl  = resolveUrl(appleHref,    origin, baseDir);
		var ogImageResUrl = resolveUrl(ogImageUrl,   origin, baseDir);

		// ── Step 3: Fetch manifest (if found), then try icons in order ────

		if (manifestUrl) {
			var manifestFile = '/tmp/pwa_manifest_' + timestamp + '.json';
			curlDownload(manifestUrl, manifestFile, function(mCode) {
				var manifestJson = '';
				try { manifestJson = fs.readFileSync(manifestFile, 'utf8'); } catch(e) {}
				try { fs.unlinkSync(manifestFile); } catch(e2) {}

				var manifest = null;
				try { manifest = JSON.parse(manifestJson); } catch(e) {}

				var appName  = title;
				var iconInfo = null;

				if (manifest) {
					appName  = manifest.short_name || manifest.name || title;
					var mOrigin  = extractOrigin(manifestUrl);
					var mBaseDir = extractBaseDir(manifestUrl);
					iconInfo = pickBestIcon(manifest.icons, mOrigin, mBaseDir);
				}

				// Build candidate list: manifest icon → apple-touch-icon → og:image
				var candidates = [];
				if (iconInfo)     candidates.push({url: iconInfo.url,    needsResize: iconInfo.needsResize});
				if (appleIconUrl) candidates.push({url: appleIconUrl,    needsResize: true});
				if (ogImageResUrl)candidates.push({url: ogImageResUrl,   needsResize: true});

				tryIconCandidates(candidates, 0, appName);
			});
		} else {
			var candidates = [];
			if (appleIconUrl) candidates.push({url: appleIconUrl,  needsResize: true});
			if (ogImageResUrl)candidates.push({url: ogImageResUrl, needsResize: true});

			tryIconCandidates(candidates, 0, title);
		}
	});
};
