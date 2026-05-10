/*jslint node: true */

var fs   = require("fs");
var exec = require("child_process").execSync;

// ── Clean old .ipk files ───────────────────────────────────────────────────

fs.readdirSync(".").forEach(function(file) {
	"use strict";
	if (/\.ipk$/i.test(file)) {
		fs.unlinkSync(file);
	}
});

// ── Read version from package manifest ────────────────────────────────────

var packageVersion = JSON.parse(
	fs.readFileSync("packages/org.webosarchive.pwainstaller/packageinfo.json")
).version;

var ipkName = "org.webosarchive.pwainstaller_" + packageVersion + "_all.ipk";

// ── Package ────────────────────────────────────────────────────────────────

console.log("Packaging " + ipkName + " ...");
var result = exec(
	"palm-package " +
	"applications/org.webosarchive.pwainstaller " +
	"services/org.webosarchive.pwainstaller.fetchsvc.service " +
	"packages/org.webosarchive.pwainstaller"
);
console.log(result.toString("utf8"));

// ── Install (optional — pass any argument to trigger) ─────────────────────

if (process.argv.length > 2) {
	console.log("Installing " + ipkName + " ...");
	result = exec("palm-install " + ipkName);
	console.log(result.toString("utf8"));
}
