#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const registry = require(path.resolve(__dirname, "..", "js", "action-registry.js"));

const sourcePath = process.argv[2];
const destinationPath = process.argv[3];
if (!sourcePath || !destinationPath) {
  console.error("usage: sync-runtime-config.js SOURCE_CONFIG RUNTIME_CONFIG");
  process.exit(64);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
} catch (error) {
  console.error(`INVALID_ACTION_CONFIG cannot read ${sourcePath}: ${error.message}`);
  process.exit(1);
}

const validation = registry.validateConfig(config, { checkFiles: true });
const runtime = JSON.parse(JSON.stringify(config));
runtime.runtimeValidation = {
  generatedAt: new Date().toISOString(),
  sourcePath: path.resolve(sourcePath),
  invalidActions: {}
};

Object.keys(validation.actions).forEach((actionId) => {
  const checked = validation.actions[actionId];
  if (!checked.ok) {
    runtime.runtimeValidation.invalidActions[actionId] = checked.issues.map((item) => ({
      code: item.code,
      message: item.message
    }));
  }
});

validation.issues.forEach((item) => {
  console.log(`${item.code}${item.actionId ? ` actionId=${item.actionId}` : ""} ${item.message}`);
});

fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
const temporaryPath = `${destinationPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
fs.renameSync(temporaryPath, destinationPath);
const validCount = Object.keys(config.actions || {}).length - Object.keys(runtime.runtimeValidation.invalidActions).length;
console.log(`RUNTIME_CONFIG_WRITTEN valid=${validCount} invalid=${Object.keys(runtime.runtimeValidation.invalidActions).length} path=${destinationPath}`);
