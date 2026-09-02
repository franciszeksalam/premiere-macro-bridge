const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
assert.strictEqual(config.port, 48777);
assert.strictEqual(config.presets.smoothZoom.premiereName, "smooth zoom");
assert.strictEqual(config.presets.scalePopBounceIn.premiereName, "TEXT PRESET - Scale POP Bounce IN");
assert.ok(Object.prototype.hasOwnProperty.call(config.sfx.whoosh01, "path"));
assert.deepStrictEqual(config.hotkeys.map((x) => [x.key, x.action, x.id]), [
  ["1", "applyPreset", "scalePopBounceIn"],
  ["2", "insertSfx", "whoosh01"]
]);
console.log("config.test.js OK");
