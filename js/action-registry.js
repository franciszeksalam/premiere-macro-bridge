(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.PMBActionRegistry = api;
}(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var fs = null;
  try { fs = require("fs"); } catch (_) {}

  function issue(code, message, actionId, hotkey) {
    var result = { code: code, message: message };
    if (actionId) result.actionId = actionId;
    if (hotkey) result.hotkey = hotkey;
    return result;
  }

  function normalizeHotkey(value) {
    if (typeof value !== "string" || !value.trim()) {
      return { ok: false, issue: issue("INVALID_ACTION_CONFIG", "hotkey must be a non-empty string") };
    }
    var aliases = {
      ctrl: "ctrl", control: "ctrl",
      alt: "alt", option: "alt",
      shift: "shift",
      cmd: "cmd", command: "cmd"
    };
    var modifiers = { ctrl: false, alt: false, shift: false, cmd: false };
    var key = null;
    var tokens = value.toLowerCase().split("+");
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i].trim();
      if (!token) {
        return { ok: false, issue: issue("INVALID_ACTION_CONFIG", "hotkey contains an empty token") };
      }
      if (aliases[token]) {
        var modifier = aliases[token];
        if (modifiers[modifier]) {
          return { ok: false, issue: issue("INVALID_ACTION_CONFIG", "duplicate hotkey modifier: " + token) };
        }
        modifiers[modifier] = true;
      } else if (/^[a-z0-9]$/.test(token) && key === null) {
        key = token;
      } else {
        return { ok: false, issue: issue("INVALID_ACTION_CONFIG", "unsupported hotkey token: " + token) };
      }
    }
    if (key === null) {
      return { ok: false, issue: issue("INVALID_ACTION_CONFIG", "hotkey requires one letter or digit") };
    }
    var ordered = [];
    if (modifiers.ctrl) ordered.push("ctrl");
    if (modifiers.alt) ordered.push("alt");
    if (modifiers.shift) ordered.push("shift");
    if (modifiers.cmd) ordered.push("cmd");
    ordered.push(key);
    return { ok: true, canonical: ordered.join("+"), key: key, modifiers: modifiers };
  }

  function validateAction(actionId, action, options) {
    options = options || {};
    var issues = [];
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      return { ok: false, issues: [issue("INVALID_ACTION_CONFIG", "action must be an object", actionId)] };
    }

    var type = action.type;
    if (type !== "effect" && type !== "sfx" && type !== "mogrt") {
      issues.push(issue("UNKNOWN_ACTION_TYPE", "unsupported type: " + String(type || ""), actionId));
    } else if (type === "effect") {
      if (typeof action.premiereName !== "string" || !action.premiereName.trim()) {
        issues.push(issue("INVALID_ACTION_CONFIG", "effect requires premiereName", actionId));
      }
    } else {
      if (typeof action.path !== "string" || !action.path.trim()) {
        issues.push(issue("INVALID_ACTION_CONFIG", type + " requires path", actionId));
      } else if (options.checkFiles !== false && fs && !fs.existsSync(action.path)) {
        issues.push(issue("FILE_NOT_FOUND", action.path, actionId));
      }
      if (type === "mogrt" && !(Number(action.durationSeconds) > 0)) {
        issues.push(issue("INVALID_ACTION_CONFIG", "mogrt requires durationSeconds > 0", actionId));
      }
    }

    var parsedHotkey = null;
    if (action.hotkey !== undefined && action.hotkey !== null && action.hotkey !== "") {
      parsedHotkey = normalizeHotkey(action.hotkey);
      if (!parsedHotkey.ok) {
        parsedHotkey.issue.actionId = actionId;
        parsedHotkey.issue.hotkey = String(action.hotkey);
        issues.push(parsedHotkey.issue);
      }
    }
    return { ok: issues.length === 0, issues: issues, hotkey: parsedHotkey && parsedHotkey.ok ? parsedHotkey : null };
  }

  function validateConfig(config, options) {
    options = options || {};
    var result = { ok: true, issues: [], actions: {} };
    if (!config || typeof config !== "object" || !config.actions || typeof config.actions !== "object" || Array.isArray(config.actions)) {
      result.ok = false;
      result.issues.push(issue("INVALID_ACTION_CONFIG", "config.actions must be an object"));
      return result;
    }

    var hotkeyOwners = {};
    Object.keys(config.actions).sort().forEach(function (actionId) {
      var validation = validateAction(actionId, config.actions[actionId], options);
      result.actions[actionId] = validation;
      result.issues = result.issues.concat(validation.issues);
      if (validation.ok && validation.hotkey) {
        var canonical = validation.hotkey.canonical;
        if (!hotkeyOwners[canonical]) hotkeyOwners[canonical] = [];
        hotkeyOwners[canonical].push(actionId);
      }
    });

    Object.keys(hotkeyOwners).forEach(function (canonical) {
      var owners = hotkeyOwners[canonical];
      if (owners.length < 2) return;
      owners.forEach(function (actionId) {
        result.actions[actionId].hotkeyConflict = true;
        result.actions[actionId].ok = false;
        var duplicate = issue("DUPLICATE_HOTKEY", canonical + " is also assigned to " + owners.filter(function (id) { return id !== actionId; }).join(", "), actionId, canonical);
        result.actions[actionId].issues.push(duplicate);
        result.issues.push(duplicate);
      });
    });

    result.ok = result.issues.length === 0;
    return result;
  }

  function commandForAction(config, actionId, options) {
    if (!config || !config.actions || !Object.prototype.hasOwnProperty.call(config.actions, actionId)) {
      var unknown = new Error("unknown action id: " + actionId);
      unknown.code = "UNKNOWN_ACTION";
      throw unknown;
    }
    var action = config.actions[actionId];
    var validation = validateAction(actionId, action, options);
    if (!validation.ok) {
      var first = validation.issues[0];
      var invalid = new Error(first.message);
      invalid.code = first.code;
      throw invalid;
    }
    var command = {
      actionId: actionId,
      type: action.type,
      label: action.label || actionId
    };
    if (action.type === "effect") {
      command.action = "applyEffect";
      command.premiereName = action.premiereName;
    } else if (action.type === "sfx") {
      command.action = "insertSfx";
      command.path = action.path;
    } else if (action.type === "mogrt") {
      command.action = "insertMogrt";
      command.path = action.path;
      command.durationSeconds = Number(action.durationSeconds);
    }
    return command;
  }

  return {
    normalizeHotkey: normalizeHotkey,
    validateAction: validateAction,
    validateConfig: validateConfig,
    commandForAction: commandForAction
  };
}));
