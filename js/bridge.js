(function () {
  "use strict";

  var fs = require("fs");
  var http = require("http");
  var path = require("path");
  var url = require("url");
  var ActionRegistry = window.PMBActionRegistry;
  var configPath = "/Users/apple/Documents/GitHub/premiere-macro-bridge/config.json";
  var logDir = path.join(process.env.HOME || "/tmp", "Library", "Logs", "PremiereMacroBridge");
  var logPath = path.join(logDir, "cep.log");
  var server;

  function ensureLogDir() {
    try { fs.mkdirSync(logDir, { recursive: true }); } catch (_) {}
  }

  function log(event, detail) {
    ensureLogDir();
    var line = new Date().toISOString() + " " + event + (detail ? " " + detail : "") + "\n";
    try { fs.appendFileSync(logPath, line, "utf8"); } catch (_) {}
    try { console.log(line.replace(/\n$/, "")); } catch (_) {}
  }

  function readConfig() {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  function sendJson(response, status, payload) {
    var body = JSON.stringify(payload);
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store"
    });
    response.end(body);
  }

  function normalizeAddress(address) {
    return String(address || "").replace(/^::ffff:/, "");
  }

  function executeAction(actionId, config) {
    if (!ActionRegistry) {
      var missingRegistry = new Error("action registry did not load");
      missingRegistry.code = "BRIDGE_ERROR";
      throw missingRegistry;
    }
    return ActionRegistry.commandForAction(config, actionId, { checkFiles: true });
  }

  function errorCode(error) {
    return error && error.code ? error.code : "BRIDGE_ERROR";
  }

  function evalInPremiere(command, callback) {
    var expression = "PMB.dispatch(" + JSON.stringify(JSON.stringify(command)) + ")";
    window.__adobe_cep__.evalScript(expression, function (raw) {
      if (raw === "EvalScript error.") {
        callback(new Error("BRIDGE_ERROR EvalScript error"));
        return;
      }
      try {
        callback(null, JSON.parse(raw));
      } catch (error) {
        callback(new Error("BRIDGE_ERROR invalid ExtendScript response: " + raw));
      }
    });
  }

  function handleAction(request, response) {
    var chunks = [];
    var total = 0;
    request.on("data", function (chunk) {
      total += chunk.length;
      if (total > 65536) {
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", function () {
      try {
        var config = readConfig();
        var payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!payload || typeof payload.actionId !== "string" || !payload.actionId) {
          var payloadError = new Error("expected non-empty actionId");
          payloadError.code = "INVALID_ACTION_CONFIG";
          throw payloadError;
        }
        var command = executeAction(payload.actionId, config);
        log("ACTION_RECEIVED", command.actionId + " type=" + command.type);
        evalInPremiere(command, function (error, result) {
          if (error) {
            log("BRIDGE_ERROR", error.message);
            sendJson(response, 500, { ok: false, error: "BRIDGE_ERROR", message: error.message });
            return;
          }
          if (result) result.actionId = command.actionId;
          var status = result && result.ok ? 200 : 409;
          log(result && result.ok ? "ACTION_OK" : "ACTION_FAILED", JSON.stringify(result));
          sendJson(response, status, result || { ok: false, error: "BRIDGE_ERROR" });
        });
      } catch (error) {
        var code = errorCode(error);
        log(code, error.message);
        sendJson(response, code === "UNKNOWN_ACTION" ? 404 : 400, { ok: false, error: code, message: error.message });
      }
    });
  }

  function start() {
    var config;
    try {
      config = readConfig();
    } catch (error) {
      log("BRIDGE_ERROR", "cannot read config: " + error.message);
      return;
    }
    if (!ActionRegistry) {
      log("BRIDGE_ERROR", "action registry did not load");
      return;
    }
    var validation = ActionRegistry.validateConfig(config, { checkFiles: true });
    validation.issues.forEach(function (configIssue) {
      log(configIssue.code, (configIssue.actionId ? configIssue.actionId + " " : "") + configIssue.message);
    });
    server = http.createServer(function (request, response) {
      var remote = normalizeAddress(request.socket && request.socket.remoteAddress);
      if (remote !== "127.0.0.1" && remote !== "::1") {
        sendJson(response, 403, { ok: false, error: "BRIDGE_ERROR", message: "localhost only" });
        return;
      }
      var pathname = url.parse(request.url).pathname;
      if (request.method === "GET" && pathname === "/health") {
        sendJson(response, 200, { ok: true, service: "premiere-macro-bridge", pid: process.pid });
        return;
      }
      if (request.method === "POST" && pathname === "/action") {
        handleAction(request, response);
        return;
      }
      sendJson(response, 404, { ok: false, error: "BRIDGE_ERROR", message: "not found" });
    });
    server.on("error", function (error) {
      log("BRIDGE_ERROR", "server: " + error.message);
    });
    server.listen(Number(config.port || 48777), "127.0.0.1", function () {
      var message = "LISTENING 127.0.0.1:" + Number(config.port || 48777);
      log(message);
      var statusNode = document.getElementById("status");
      if (statusNode) statusNode.textContent = message;
    });
  }

  window.addEventListener("unload", function () {
    try { if (server) server.close(); } catch (_) {}
  });

  start();
}());
