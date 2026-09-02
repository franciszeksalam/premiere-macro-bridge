const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
assert.strictEqual(config.port, 48777);
assert.strictEqual(config.effects.gaussianBlur.premiereName, "Gaussian Blur");
assert.strictEqual(config.effects.transform.premiereName, "Transform");
assert.strictEqual(config.effects.crop.premiereName, "Crop");
assert.ok(config.sfx.whoosh01.path.endsWith(".wav"));
assert.ok(config.mogrts.questionBox.path.endsWith(".mogrt"));
assert.strictEqual(config.mogrts.questionBox.durationSeconds, 15);
assert.deepStrictEqual(config.hotkeys.map((x) => [x.key, x.action, x.id]), [
  ["1", "applyEffect", "gaussianBlur"],
  ["2", "insertSfx", "whoosh01"],
  ["3", "insertMogrt", "questionBox"]
]);
console.log("config.test.js OK");
