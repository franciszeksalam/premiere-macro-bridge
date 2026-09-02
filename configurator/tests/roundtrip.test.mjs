// The configurator writes the same config.json the bridge loads. This drives the
// real data path: build a config with the GUI's own code, write it, then hand it to
// the bridge's runtime sync and to the compiled Carbon helper and check that the new
// action registers. Nothing here touches the live config or the running helper.

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const configurator = path.resolve(here, "..");
const repo = path.resolve(configurator, "..");
const helper = path.join(repo, ".build", "premiere-macro-hotkeys");

if (!fs.existsSync(helper)) {
  execFileSync(path.join(repo, "scripts", "build-helper.sh"), { stdio: "inherit" });
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pmb-roundtrip-"));
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));

const bundle = path.join(scratch, "entry.mjs");
await esbuild.build({
  entryPoints: [path.join(here, "entry.ts")],
  outfile: bundle,
  bundle: true,
  format: "esm",
  platform: "neutral",
  external: ["@tauri-apps/*"]
});
globalThis.window = globalThis;
const { serializeConfig, upsertAction, idFromLabel, orderedIds } = await import(bundle);

// A real file on disk, so the runtime sync's existence check is exercised for real.
const wav = path.join(scratch, "whoosh.wav");
fs.writeFileSync(wav, "RIFF");

const live = JSON.parse(fs.readFileSync(path.join(repo, "config.json"), "utf8"));

// Exactly what "Add SFX -> Whoosh -> Control+Option+Shift+1 -> Save" produces.
const newId = idFromLabel("Whoosh", orderedIds(live));
const next = upsertAction(live, newId, {
  type: "sfx",
  label: "Whoosh",
  path: wav,
  hotkey: "ctrl+alt+shift+1",
  iconPath: "/tmp/not-used-by-the-bridge.gif"
});

const sourceConfig = path.join(scratch, "config.json");
const runtimeConfig = path.join(scratch, "runtime.json");
fs.writeFileSync(sourceConfig, serializeConfig(next), "utf8");

// Step 1: the bridge's own validator, via the script the reload uses.
const syncOutput = execFileSync(
  "node",
  [path.join(repo, "scripts", "sync-runtime-config.js"), sourceConfig, runtimeConfig],
  { encoding: "utf8" }
);
assert.match(syncOutput, /RUNTIME_CONFIG_WRITTEN/);
assert.ok(syncOutput.includes("invalid=0"), `runtime sync rejected an action:\n${syncOutput}`);

// Step 2: the compiled Carbon helper, which is what actually registers hotkeys.
const helperOutput = execFileSync(helper, ["--config", runtimeConfig, "--check-config"], { encoding: "utf8" });

assert.ok(
  helperOutput.includes(`HOTKEY_VALID ctrl+alt+shift+1 -> ${newId}`),
  `the helper did not accept the new action:\n${helperOutput}`
);
for (const code of ["DUPLICATE_HOTKEY", "UNKNOWN_ACTION_TYPE", "FILE_NOT_FOUND", "INVALID_ACTION_CONFIG"]) {
  assert.ok(!helperOutput.includes(code), `helper reported ${code}:\n${helperOutput}`);
}

// The three actions that were already working must survive untouched.
for (const id of Object.keys(live.actions)) {
  assert.deepStrictEqual(next.actions[id], live.actions[id], `the GUI altered the existing action ${id}`);
}

// iconPath is configurator metadata; the helper must ignore it rather than choke.
const runtime = JSON.parse(fs.readFileSync(runtimeConfig, "utf8"));
assert.strictEqual(runtime.actions[newId].iconPath, "/tmp/not-used-by-the-bridge.gif");
assert.deepStrictEqual(runtime.runtimeValidation.invalidActions, {});

console.log(`configurator/tests/roundtrip.test.mjs OK (${newId} registered through the real bridge path)`);
