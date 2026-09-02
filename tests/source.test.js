const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const jsx = fs.readFileSync(path.join(root, "jsx", "bridge.jsx"), "utf8");
const bridge = fs.readFileSync(path.join(root, "js", "bridge.js"), "utf8");
const helper = fs.readFileSync(path.join(root, "mac-helper", "main.m"), "utf8");

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

for (const token of ["applyPreset", ".prfpset", "setValueAtKey", "PRESET_"]) {
  assert.ok(!jsx.includes(token), `saved preset code is active in JSX: ${token}`);
  assert.ok(!bridge.includes(token), `saved preset code is active in CEP: ${token}`);
  assert.ok(!helper.includes(token), `saved preset code is active in helper: ${token}`);
}

console.log("source.test.js OK");
