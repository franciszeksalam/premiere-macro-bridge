const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const jsx = fs.readFileSync(path.join(root, "jsx", "bridge.jsx"), "utf8");
const bridge = fs.readFileSync(path.join(root, "js", "bridge.js"), "utf8");
const registry = fs.readFileSync(path.join(root, "js", "action-registry.js"), "utf8");
const helper = fs.readFileSync(path.join(root, "mac-helper", "main.m"), "utf8");
const runtimeSync = fs.readFileSync(path.join(root, "scripts", "sync-runtime-config.js"), "utf8");

for (const token of [
  "PMB.applyEffect",
  "PMB.findFirstFreeAudioTrackAtTime",
  "PMB.findFirstFreeVideoTrackAtTime",
  "PMB.insertSfx",
  "PMB.insertMogrt",
  "EFFECT_NOT_FOUND",
  "NO_FREE_AUDIO_TRACK",
  "NO_FREE_VIDEO_TRACK"
]) {
  assert.ok(jsx.includes(token), `missing ${token}`);
}

for (const token of [
  "executeAction(actionId, config)",
  "payload.actionId",
  "ActionRegistry.commandForAction"
]) {
  assert.ok(bridge.includes(token), `missing data-driven bridge token: ${token}`);
}

for (const token of ["normalizeHotkey", "validateConfig", "commandForAction", "DUPLICATE_HOTKEY", "FILE_NOT_FOUND", "UNKNOWN_ACTION_TYPE"]) {
  assert.ok(registry.includes(token), `missing action registry token: ${token}`);
}

for (const token of ["root[@\"actions\"]", "PMBParseHotkey", "DUPLICATE_HOTKEY", "@\"actionId\": actionID"]) {
  assert.ok(helper.includes(token), `missing dynamic helper token: ${token}`);
}

assert.ok(!helper.includes("root[@\"hotkeys\"]"), "legacy hardcoded hotkey array is still active");
assert.ok(!helper.includes("@\"action\": action"), "helper still sends action implementation names");
assert.ok(helper.includes("runtimeValidation"), "helper does not consume validated runtime config");
assert.ok(runtimeSync.includes("registry.validateConfig"), "runtime config is not validated before LaunchAgent reload");

for (const token of ["applyPreset", ".prfpset", "setValueAtKey", "PRESET_"]) {
  assert.ok(!jsx.includes(token), `saved preset code is active in JSX: ${token}`);
  assert.ok(!bridge.includes(token), `saved preset code is active in CEP: ${token}`);
  assert.ok(!helper.includes(token), `saved preset code is active in helper: ${token}`);
}

console.log("source.test.js OK");
