"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const registry = require(path.resolve(__dirname, "..", "js", "action-registry.js"));
const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "config.json"), "utf8"));

const loaded = registry.validateConfig(config, { checkFiles: true });
assert.strictEqual(loaded.ok, true, JSON.stringify(loaded.issues));
assert.strictEqual(loaded.actions.gaussianBlur.hotkey.canonical, "ctrl+alt+1");
assert.strictEqual(loaded.actions.whoosh01.hotkey.canonical, "ctrl+alt+2");
assert.strictEqual(loaded.actions.questionBox.hotkey.canonical, "ctrl+alt+3");

assert.strictEqual(registry.normalizeHotkey("CTRL+Option+Shift+Q").canonical, "ctrl+alt+shift+q");
assert.strictEqual(registry.normalizeHotkey("cmd+7").canonical, "cmd+7");
assert.strictEqual(registry.normalizeHotkey("ctrl+alt+f12").ok, false);

const effect = registry.commandForAction(config, "gaussianBlur", { checkFiles: true });
assert.deepStrictEqual(
  { actionId: effect.actionId, action: effect.action, premiereName: effect.premiereName },
  { actionId: "gaussianBlur", action: "applyEffect", premiereName: "Gaussian Blur" }
);
assert.throws(
  () => registry.commandForAction(config, "doesNotExist"),
  (error) => error.code === "UNKNOWN_ACTION"
);

const duplicate = {
  actions: {
    first: { type: "effect", premiereName: "Crop", hotkey: "CTRL+OPTION+Q" },
    second: { type: "effect", premiereName: "Transform", hotkey: "alt+ctrl+q" },
    okay: { type: "effect", premiereName: "Gaussian Blur", hotkey: "ctrl+alt+w" }
  }
};
const duplicateResult = registry.validateConfig(duplicate, { checkFiles: false });
assert.strictEqual(duplicateResult.actions.first.hotkeyConflict, true);
assert.strictEqual(duplicateResult.actions.second.hotkeyConflict, true);
assert.strictEqual(duplicateResult.actions.okay.ok, true);
assert.strictEqual(duplicateResult.issues.filter((item) => item.code === "DUPLICATE_HOTKEY").length, 2);

const missingPath = path.join(os.tmpdir(), "pmb-definitely-missing.wav");
const invalid = registry.validateConfig({
  actions: {
    missing: { type: "sfx", path: missingPath, hotkey: "ctrl+alt+x" },
    strange: { type: "savedPreset", hotkey: "ctrl+alt+y" },
    incomplete: { type: "mogrt", path: missingPath, durationSeconds: 0 }
  }
}, { checkFiles: true });
assert.ok(invalid.issues.some((item) => item.actionId === "missing" && item.code === "FILE_NOT_FOUND"));
assert.ok(invalid.issues.some((item) => item.actionId === "strange" && item.code === "UNKNOWN_ACTION_TYPE"));
assert.ok(invalid.issues.some((item) => item.actionId === "incomplete" && item.code === "INVALID_ACTION_CONFIG"));

console.log("action-registry.test.js OK");
