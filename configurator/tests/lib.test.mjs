// The configurator's pure logic: ids, ordering, validation, hotkey formatting.
// Bundled with esbuild first so the tests run the same TypeScript the app ships.

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmb-gui-tests-"));
process.on("exit", () => fs.rmSync(outDir, { recursive: true, force: true }));

const bundle = path.join(outDir, "entry.mjs");
await esbuild.build({
  entryPoints: [path.join(here, "entry.ts")],
  outfile: bundle,
  bundle: true,
  format: "esm",
  platform: "neutral",
  external: ["@tauri-apps/*"]
});

// js/action-registry.js is a UMD module: with no CommonJS `module` in scope it
// publishes onto the global, exactly as it does inside the webview.
globalThis.window = globalThis;

const lib = await import(bundle);
const {
  ActionRegistry,
  canonicalFromEvent,
  displayHotkey,
  entriesOfType,
  hotkeyOwner,
  idFromLabel,
  orderedIds,
  removeAction,
  reorderWithin,
  serializeConfig,
  spellHotkey,
  upsertAction,
  validateDraft
} = lib;

const NONE = new Set();
let checks = 0;
const check = (name, run) => {
  run();
  checks += 1;
  void name;
};

// ---------- action ids ----------

check("labels become stable camelCase ids", () => {
  assert.strictEqual(idFromLabel("Gaussian Blur", []), "gaussianBlur");
  assert.strictEqual(idFromLabel("Whoosh Impact 01", []), "whooshImpact01");
  assert.strictEqual(idFromLabel("  Lower   Third  ", []), "lowerThird");
});

check("ids stay safe for the shell and for JSON keys", () => {
  // action.sh rejects anything outside [A-Za-z0-9._-]
  assert.match(idFromLabel("Zażółć gęślą jaźń", []), /^[A-Za-z0-9._-]+$/);
  assert.match(idFromLabel("!!!", []), /^[A-Za-z0-9._-]+$/);
  assert.strictEqual(idFromLabel("", []), "action");
  assert.strictEqual(idFromLabel("3D Glow", []), "action3dGlow");
});

check("a taken id gets a suffix instead of overwriting", () => {
  assert.strictEqual(idFromLabel("Whoosh", ["whoosh"]), "whoosh2");
  assert.strictEqual(idFromLabel("Whoosh", ["whoosh", "whoosh2"]), "whoosh3");
});

// ---------- ordering ----------

const sample = {
  port: 48777,
  actions: {
    blur: { type: "effect", label: "Blur", premiereName: "Gaussian Blur", hotkey: "ctrl+alt+1" },
    whoosh: { type: "sfx", label: "Whoosh", path: "/tmp/a.wav", hotkey: "ctrl+alt+2" },
    box: { type: "mogrt", label: "Box", path: "/tmp/b.mogrt", durationSeconds: 15, hotkey: "ctrl+alt+3" },
    crop: { type: "effect", label: "Crop", premiereName: "Crop" }
  },
  actionOrder: ["crop", "blur", "whoosh", "box"]
};

check("order list drives the listing", () => {
  assert.deepStrictEqual(orderedIds(sample), ["crop", "blur", "whoosh", "box"]);
  assert.deepStrictEqual(
    entriesOfType(sample, "effect").map((entry) => entry.id),
    ["crop", "blur"]
  );
});

check("a hand-edited config cannot hide an action", () => {
  const stale = { ...sample, actionOrder: ["box", "gone"] };
  assert.deepStrictEqual(orderedIds(stale), ["box", "blur", "whoosh", "crop"]);
});

check("reordering one category leaves the others in place", () => {
  const moved = reorderWithin(sample, "effect", "blur", 0);
  assert.deepStrictEqual(
    entriesOfType(moved, "effect").map((entry) => entry.id),
    ["blur", "crop"]
  );
  assert.deepStrictEqual(
    entriesOfType(moved, "sfx").map((entry) => entry.id),
    ["whoosh"]
  );
  assert.deepStrictEqual(
    entriesOfType(moved, "mogrt").map((entry) => entry.id),
    ["box"]
  );
});

check("adding and removing keeps the order list honest", () => {
  const added = upsertAction(sample, "newFx", { type: "effect", label: "New", premiereName: "Crop" });
  assert.ok(added.actionOrder.includes("newFx"));
  const removed = removeAction(added, "newFx");
  assert.ok(!removed.actionOrder.includes("newFx"));
  assert.ok(!("newFx" in removed.actions));
  // Editing must not move an action or change its id.
  const edited = upsertAction(sample, "blur", { ...sample.actions.blur, label: "Blur 2" });
  assert.deepStrictEqual(orderedIds(edited), orderedIds(sample));
});

// ---------- hotkeys ----------

check("the same combination written differently is still the same combination", () => {
  assert.strictEqual(ActionRegistry.normalizeHotkey("ALT+CTRL+1").canonical, "ctrl+alt+1");
  const owner = hotkeyOwner(sample, "Option+Control+1");
  assert.strictEqual(owner.id, "blur");
  // The action being edited never conflicts with itself.
  assert.strictEqual(hotkeyOwner(sample, "ctrl+alt+1", "blur"), null);
});

check("hotkeys render for humans", () => {
  assert.strictEqual(displayHotkey("ctrl+alt+shift+4"), "⌃⌥⇧4");
  assert.strictEqual(displayHotkey("cmd+b"), "⌘B");
  assert.strictEqual(spellHotkey("ctrl+alt+1"), "Control + Option + 1");
  assert.strictEqual(spellHotkey(undefined), "No hotkey");
});

check("the recorder reads the physical key, not the character Option produces", () => {
  // Option+1 arrives as event.key "¡" on macOS; event.code stays Digit1.
  const recorded = canonicalFromEvent({ code: "Digit1", key: "¡", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false });
  assert.strictEqual(recorded.ok, true);
  assert.strictEqual(recorded.value.canonical, "ctrl+alt+1");
  assert.strictEqual(recorded.value.display, "⌃⌥1");

  const withShift = canonicalFromEvent({ code: "KeyQ", key: "Q", ctrlKey: true, altKey: true, shiftKey: true, metaKey: false });
  assert.strictEqual(withShift.value.canonical, "ctrl+alt+shift+q");
});

check("the recorder refuses combinations the helper would refuse", () => {
  const bare = canonicalFromEvent({ code: "Digit4", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false });
  assert.strictEqual(bare.ok, false);
  const shiftOnly = canonicalFromEvent({ code: "KeyA", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false });
  assert.strictEqual(shiftOnly.ok, false);
  const functionKey = canonicalFromEvent({ code: "F5", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false });
  assert.strictEqual(functionKey.ok, false);
});

// ---------- validation ----------

check("duplicate hotkeys are rejected however they are spelled", () => {
  const clash = {
    actions: {
      one: { type: "effect", label: "One", premiereName: "Crop", hotkey: "ctrl+alt+9" },
      two: { type: "effect", label: "Two", premiereName: "Transform", hotkey: "ALT+CTRL+9" }
    }
  };
  const result = validateDraft(clash, NONE);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.issues.filter((issue) => issue.code === "DUPLICATE_HOTKEY").length, 2);
  assert.ok(result.byAction.one && result.byAction.two);
});

check("incomplete actions are reported per action", () => {
  const broken = {
    actions: {
      noName: { type: "effect", label: "No name" },
      noPath: { type: "sfx", label: "No path" },
      badDuration: { type: "mogrt", label: "Bad", path: "/tmp/x.mogrt", durationSeconds: 0 },
      badType: { type: "transition", label: "Nope" },
      badHotkey: { type: "effect", label: "Bare", premiereName: "Crop", hotkey: "4" }
    }
  };
  const result = validateDraft(broken, NONE);
  const codeFor = (id) => result.byAction[id].map((issue) => issue.code);
  assert.ok(codeFor("noName").includes("INVALID_ACTION_CONFIG"));
  assert.ok(codeFor("noPath").includes("INVALID_ACTION_CONFIG"));
  assert.ok(codeFor("badDuration").includes("INVALID_ACTION_CONFIG"));
  assert.ok(codeFor("badType").includes("UNKNOWN_ACTION_TYPE"));
  assert.ok(codeFor("badHotkey").includes("INVALID_ACTION_CONFIG"));
});

check("a file that vanished from disk is reported without breaking the rest", () => {
  const missing = new Set(["/tmp/a.wav"]);
  const result = validateDraft(sample, missing);
  assert.deepStrictEqual(
    result.issues.map((issue) => [issue.actionId, issue.code]),
    [["whoosh", "FILE_NOT_FOUND"]]
  );
  assert.ok(!result.byAction.blur);
});

check("an id the shell could not pass is rejected", () => {
  const weird = { actions: { "bad id!": { type: "effect", label: "X", premiereName: "Crop" } } };
  const result = validateDraft(weird, NONE);
  assert.ok(result.issues.some((issue) => issue.actionId === "bad id!" && issue.code === "INVALID_ACTION_CONFIG"));
});

// ---------- serialization ----------

check("the written file keeps the bridge's shape", () => {
  const text = serializeConfig(sample);
  assert.ok(text.endsWith("\n"));
  const parsed = JSON.parse(text);
  assert.strictEqual(parsed.port, 48777);
  assert.deepStrictEqual(Object.keys(parsed.actions), ["crop", "blur", "whoosh", "box"]);
  assert.deepStrictEqual(parsed.actionOrder, ["crop", "blur", "whoosh", "box"]);
  // Unknown top-level keys survive a round trip rather than being dropped.
  const extra = serializeConfig({ ...sample, somethingElse: { keep: true } });
  assert.deepStrictEqual(JSON.parse(extra).somethingElse, { keep: true });
});

check("what the GUI writes is what the bridge validator accepts", () => {
  const parsed = JSON.parse(serializeConfig(sample));
  const validation = ActionRegistry.validateConfig(parsed, { checkFiles: false });
  assert.strictEqual(validation.ok, true, JSON.stringify(validation.issues));
});

console.log(`configurator/tests/lib.test.mjs OK (${checks} checks)`);
