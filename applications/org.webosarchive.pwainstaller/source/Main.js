enyo.kind({
	name: "Main",
	kind: "VFlexBox",
	className: "enyo-bg",

	kCookieName:    "org.webosarchive.pwainstaller",
	iconStorageDir: "/media/internal/.webosarchive/",
	appBasePath:    "",

	// Runtime state
	settings:        null,
	fetchedTitle:    "",
	fetchedUrl:      "",
	fetchedIconPath: null,

	components: [
		// ── Header ────────────────────────────────────────────────
		{kind: "Toolbar", className: "enyo-toolbar-light app-header", pack: "center", components: [
			{kind: "Image", src: "images/header-icon-48x48.png", className: "app-header-icon"},
			{kind: "Control", content: $L("PWA Installer"), className: "app-header-title"}
		]},
		{className: "app-header-shadow"},

		// ── Scrollable content ─────────────────────────────────────
		{kind: "Scroller", flex: 1, className: "enyo-bg", components: [
			{kind: "Control", className: "box-center enyo-bg", components: [

				// URL input
				{kind: "RowGroup", className: "app-group", caption: $L("WEBSITE"), components: [
					{kind: "Item", tapHighlight: false, layoutKind: "HFlexLayout", align: "center", components: [
						{kind: "Input", name: "urlInput", flex: 1,
							hint: $L("Enter website URL..."),
							inputType: "url",
							autocorrect: false,
							spellcheck: false,
							autoCapitalize: "lowercase",
							onkeyup: "urlKeyUp"},
						{kind: "Button", name: "goButton", caption: $L("Fetch"),
							className: "enyo-button-dark app-go-btn",
							onclick: "fetchClicked"}
					]}
				]},

				// Status / spinner
				{kind: "HFlexBox", name: "statusArea", pack: "center", align: "center",
						className: "app-status-area", components: [
					{kind: "Spinner", name: "fetchSpinner", showing: false},
					{name: "statusText",
						content: $L("Enter a website URL above and tap Fetch."),
						className: "app-body-text"}
				]},

				// Shortcut preview — hidden until a successful fetch
				{name: "previewGroup", kind: "RowGroup", className: "app-group",
						caption: $L("SHORTCUT PREVIEW"), showing: false, components: [
					{kind: "Item", tapHighlight: false, layoutKind: "HFlexLayout", align: "center", components: [
						{name: "iconPreview", kind: "Image",
							src: "images/icon-default.png",
							className: "app-icon-preview"},
						{kind: "Input", name: "nameInput", flex: 1,
							hint: $L("Shortcut name"),
							autocorrect: false,
							spellcheck: false,
							className: "app-name-input"}
					]}
				]},

				// Browser selection
				{kind: "RowGroup", className: "app-group", caption: $L("BROWSER"), components: [
					{kind: "ListSelector", name: "browserSelector",
						label: $L("Browser"),
						onChange: "browserChanged",
						items: [
							{caption: $L("webOS Browser"),        value: "com.palm.app.browser"},
							{caption: $L("QupZilla 2.3 or higher"), value: "com.nizovn.qupzilla"}
						]}
				]},
				{content: $L("QupZilla must be installed separately."),
					className: "app-body-text"}
			]}
		]},

		{className: "app-footer-shadow"},

		// ── Footer toolbar ─────────────────────────────────────────
		{kind: "Toolbar", className: "enyo-toolbar-light", components: [
			{name: "installButton", kind: "ActivityButton",
				caption: $L("Install Shortcut"),
				className: "enyo-button-affirmative app-install-btn",
				onclick: "installClicked",
				disabled: true,
				active: false}
		]},

		// ── App menu ───────────────────────────────────────────────
		{kind: "AppMenu", name: "appMenu", components: [
			{caption: $L("About PWA Installer"), onclick: "showAbout"}
		]},

		// ── Services ───────────────────────────────────────────────
		{kind: "PalmService", name: "fetchPwa",
			service: "palm://org.webosarchive.pwainstaller.fetchsvc.service/",
			method: "fetchpwa",
			onSuccess: "onFetchSuccess",
			onFailure: "onFetchFailure"},

		{kind: "PalmService", name: "createLaunchPoint",
			service: enyo.palmServices.application,
			method: "addLaunchPoint",
			onSuccess: "onInstallSuccess",
			onFailure: "onInstallFailure"},

		{kind: "PalmService", name: "getAppPath",
			service: "palm://com.palm.applicationManager/",
			method: "getAppBasePath",
			onSuccess: "onGetAppPathSuccess"},

		// ── Error dialog ───────────────────────────────────────────
		{name: "errorDialog", kind: "Dialog", lazy: false, components: [
			{name: "errorMessage", className: "app-dialog-message"},
			{layoutKind: "HFlexLayout", pack: "center", components: [
				{kind: "Button", caption: $L("OK"),
					className: "enyo-button-dark",
					onclick: "closeErrorDialog"}
			]}
		]},

		// ── About dialog ───────────────────────────────────────────
		{name: "aboutDialog", kind: "Dialog", lazy: false, components: [
			{content: "PWA Installer", className: "app-about-title"},
			{content: "by WebOS Archive",  className: "app-about-subtitle"},
			{content: "Install web apps as Home Screen shortcuts on webOS.",
				className: "app-body-text app-about-body"},
			{layoutKind: "HFlexLayout", pack: "center", components: [
				{kind: "Button", caption: $L("OK"),
					className: "enyo-button-dark",
					onclick: "closeAboutDialog"}
			]}
		]}
	],

	// ── Lifecycle ──────────────────────────────────────────────────────────

	create: function() {
		this.inherited(arguments);
		this.settings = this.loadSettings();
		this.$.browserSelector.setValue(this.settings.browserId);
		this.$.getAppPath.call({appId: "org.webosarchive.pwainstaller"});
	},

	onGetAppPathSuccess: function(inSender, inResponse) {
		if (inResponse.basePath) {
			this.appBasePath = inResponse.basePath;
		}
	},

	// ── App menu gesture handlers (called by webOS framework) ──────────────

	openAppMenuHandler: function() {
		this.$.appMenu.open();
	},

	closeAppMenuHandler: function() {
		this.$.appMenu.close();
	},

	// ── URL input ──────────────────────────────────────────────────────────

	urlKeyUp: function(inSender, inEvent) {
		if (inEvent.keyCode === 13) {
			this.fetchClicked();
		}
	},

	// ── Fetch flow ─────────────────────────────────────────────────────────

	fetchClicked: function() {
		var url = this.$.urlInput.getValue().trim();
		if (!url) return;
		this.fetchedUrl = url;
		this.setFetchingState(true);
		this.$.fetchPwa.call({url: url});
	},

	setFetchingState: function(fetching) {
		this.$.fetchSpinner.setShowing(fetching);
		this.$.goButton.setDisabled(fetching);
		this.$.urlInput.setDisabled(fetching);
		if (fetching) {
			this.$.statusText.setContent($L("Fetching site information..."));
			this.$.previewGroup.hide();
			this.$.installButton.setDisabled(true);
		}
	},

	onFetchSuccess: function(inSender, inResponse) {
		this.setFetchingState(false);

		this.fetchedTitle    = inResponse.title || this.fetchedUrl;
		this.fetchedIconPath = inResponse.iconLocalPath || null;

		this.$.nameInput.setValue(this.fetchedTitle);
		this.$.previewGroup.show();

		if (this.fetchedIconPath) {
			// Preview from remote URL — avoids app sandbox restrictions on local paths
			this.$.iconPreview.setSrc(inResponse.iconUrl || this.fetchedIconPath);
			this.$.statusText.setContent($L("Review the shortcut details and tap Install."));
		} else {
			this.$.iconPreview.setSrc("images/icon-default.png");
			this.$.statusText.setContent($L("No icon found — a placeholder will be used."));
		}

		this.$.installButton.setDisabled(false);
	},

	onFetchFailure: function(inSender, inResponse) {
		this.setFetchingState(false);
		var detail = (inResponse && inResponse.errorText) ? inResponse.errorText : "unknown error";
		this.$.statusText.setContent($L("Could not fetch site. Check the URL and try again."));
		this.showError("Fetch failed: " + detail);
	},

	// ── Install flow ───────────────────────────────────────────────────────

	installClicked: function() {
		this.$.installButton.setDisabled(true);
		this.$.installButton.setActive(true);
		this.doInstall(this.fetchedIconPath || null);
	},

	doInstall: function(iconPath) {
		var browserId = this.settings.browserId || "com.palm.app.browser";

		var name = this.$.nameInput.getValue().trim() || this.fetchedTitle || "Web App";

		var url = this.fetchedUrl;
		if (!/^https?:\/\//i.test(url)) {
			url = 'http://' + url;
		}

		var callParams = {
			id:     browserId,
			title:  name,
			params: (browserId === "com.nizovn.qupzilla") ? [url] : {target: url}
		};

		if (iconPath) {
			callParams.icon = iconPath;
		} else if (this.appBasePath) {
			callParams.icon = this.appBasePath + "images/icon-default.png";
		}

		this.$.createLaunchPoint.call(callParams);
	},

	onInstallSuccess: function() {
		this.$.installButton.setActive(false);
		this.$.installButton.setDisabled(false);
		enyo.windows.addBannerMessage(
			$L("Shortcut installed!"),
			enyo.json.stringify({dontLaunch: true})
		);
		this.resetForm();
	},

	onInstallFailure: function(inSender, inResponse) {
		this.$.installButton.setActive(false);
		this.$.installButton.setDisabled(false);
		var detail = (inResponse && inResponse.errorText) ? inResponse.errorText : "unknown error";
		this.showError("Install failed: " + detail);
	},

	resetForm: function() {
		this.$.urlInput.setValue("");
		this.$.previewGroup.hide();
		this.$.installButton.setDisabled(true);
		this.$.statusText.setContent($L("Enter a website URL above and tap Fetch."));
		this.fetchedUrl      = "";
		this.fetchedTitle    = "";
		this.fetchedIconPath = null;
	},

	// ── Settings ───────────────────────────────────────────────────────────

	browserChanged: function(inSender, inNewValue) {
		this.settings.browserId = inNewValue;
		this.saveSettings();
	},

	loadSettings: function() {
		var cookie = enyo.getCookie(this.kCookieName);
		try {
			if (cookie) return enyo.json.parse(cookie);
		} catch(e) {}
		return {browserId: "com.palm.app.browser"};
	},

	saveSettings: function() {
		enyo.setCookie(this.kCookieName, enyo.json.stringify(this.settings));
	},

	// ── Dialogs ────────────────────────────────────────────────────────────

	showAbout: function() {
		this.$.aboutDialog.openAtCenter();
	},

	closeAboutDialog: function() {
		this.$.aboutDialog.close();
	},

	showError: function(msg) {
		this.$.errorMessage.setContent(msg);
		this.$.errorDialog.open();
	},

	closeErrorDialog: function() {
		this.$.errorDialog.close();
	}
});
