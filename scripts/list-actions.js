#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
const registry = require(path.join(root, "js", "action-registry.js"));
const validation = registry.validateConfig(config, { checkFiles: true });

Object.keys(config.actions || {}).sort().forEach((actionId) => {
  const action = config.actions[actionId];
  const checked = validation.actions[actionId];
  console.log(action.label || actionId);
  console.log(`  id: ${actionId}`);
  console.log(`  type: ${action.type || "(missing)"}`);
  console.log(`  hotkey: ${action.hotkey || "(none)"}`);
  console.log(`  status: ${checked && checked.ok ? "active" : "invalid"}`);
  if (checked && !checked.ok) {
    checked.issues.forEach((item) => console.log(`  error: ${item.code} ${item.message}`));
  }
  console.log();
});

if (!validation.ok) process.exitCode = 2;
