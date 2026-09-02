"use strict";

// The hotkey syntax is parsed twice: once in JavaScript (js/action-registry.js,
// used by the CEP bridge and the scripts) and once in Objective-C
// (mac-helper/main.m, used to register the Carbon hotkeys). The two parsers must
// agree, or a config would list a hotkey that never fires. This test drives both
// over the same input and compares the canonical forms.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const registry = require(path.join(root, "js", "action-registry.js"));
const helper = path.join(root, ".build", "premiere-macro-hotkeys");

if (!fs.existsSync(helper)) {
  execFileSync(path.join(root, "scripts", "build-helper.sh"), { stdio: "inherit" });
}

const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmb-parity-"));
process.on("exit", () => fs.rmSync(temporaryDir, { recursive: true, force: true }));

// Ids deliberately absent from config.json: registering them with the already
// compiled binary is what proves a new action needs no recompilation.
const accepted = {
  plainDigit: "ctrl+alt+4",
  upperCase: "CTRL+ALT+5",
  aliasNames: "Control+Option+6",
  reordered: "alt+ctrl+7",
  allModifiers: "ctrl+alt+shift+cmd+8",
  spacedTokens: " ctrl + alt + 9 ",
  letterKey: "ctrl+shift+a",
  cmdOnly: "cmd+shift+b",
  optionLetter: "ctrl+alt+q"
};

const rejected = {
  noModifier: "4",
  shiftOnly: "shift+a",
  functionKey: "ctrl+alt+f12",
  noKey: "ctrl+alt",
  twoKeys: "ctrl+alt+a+b",
  duplicateModifier: "ctrl+ctrl+a",
  unknownToken: "ctrl+meta+a"
};

const actions = {};
const expectedCanonical = {};
Object.keys(accepted).forEach((actionId) => {
  actions[actionId] = { type: "effect", premiereName: "Gaussian Blur", hotkey: accepted[actionId] };
  const parsed = registry.normalizeHotkey(accepted[actionId]);
  assert.strictEqual(parsed.ok, true, `JS rejected a hotkey it should accept: ${accepted[actionId]}`);
  expectedCanonical[actionId] = parsed.canonical;
});
Object.keys(rejected).forEach((actionId) => {
  actions[actionId] = { type: "effect", premiereName: "Gaussian Blur", hotkey: rejected[actionId] };
  assert.strictEqual(
    registry.normalizeHotkey(rejected[actionId]).ok,
    false,
    `JS accepted a hotkey it should reject: ${rejected[actionId]}`
  );
});

const sourcePath = path.join(temporaryDir, "source.json");
const runtimePath = path.join(temporaryDir, "runtime.json");
fs.writeFileSync(sourcePath, JSON.stringify({ port: 48777, actions }, null, 2), "utf8");
execFileSync("node", [path.join(root, "scripts", "sync-runtime-config.js"), sourcePath, runtimePath], { stdio: "pipe" });

const output = execFileSync(helper, ["--config", runtimePath, "--check-config"], { encoding: "utf8" });
const nativeCanonical = {};
output.split("\n").forEach((line) => {
  const match = line.match(/HOTKEY_VALID (\S+) -> (\S+)$/);
  if (match) nativeCanonical[match[2]] = match[1];
});

assert.deepStrictEqual(
  nativeCanonical,
  expectedCanonical,
  "the native helper and the JavaScript registry disagree about hotkey parsing"
);

Object.keys(rejected).forEach((actionId) => {
  assert.ok(
    output.includes(`INVALID_ACTION_CONFIG actionId=${actionId}`),
    `native helper did not report the invalid hotkey for ${actionId}`
  );
});

// A digit key with no modifier would swallow that key system-wide.
assert.ok(
  registry.normalizeHotkey("4").issue.message.includes("ctrl, alt, or cmd"),
  "bare keys must be rejected with an explanatory message"
);

console.log(`hotkey-parity.test.js OK (${Object.keys(expectedCanonical).length} hotkeys registered without recompiling)`);
