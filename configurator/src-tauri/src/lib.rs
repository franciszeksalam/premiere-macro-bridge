//! Thin shell over the existing bridge. Nothing here knows what an effect, an SFX,
//! or a MOGRT is: it reads and writes the one config.json the bridge already reads,
//! and shells out to the scripts that were already there.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

const DEFAULT_REPO_ROOT: &str = "/Users/apple/Documents/GitHub/premiere-macro-bridge";
const HELPER_LABEL: &str = "com.local.premieremacrobridge.hotkeys";

/// Overridable so the test suite can point at a scratch copy instead of the live config.
fn repo_root() -> PathBuf {
    std::env::var("PMB_REPO_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_REPO_ROOT))
}

fn config_path() -> PathBuf {
    repo_root().join("config.json")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigPayload {
    path: String,
    text: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    path: String,
    backup_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScriptOutput {
    ok: bool,
    code: i32,
    stdout: String,
    stderr: String,
}

fn run(program: &str, args: &[&str]) -> Result<ScriptOutput, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("cannot run {program}: {error}"))?;
    Ok(ScriptOutput {
        ok: output.status.success(),
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

fn script(name: &str) -> Result<PathBuf, String> {
    let path = repo_root().join("scripts").join(name);
    if !path.is_file() {
        return Err(format!("missing bridge script: {}", path.display()));
    }
    Ok(path)
}

fn configured_port() -> u16 {
    let fallback = 48777;
    let Ok(text) = std::fs::read_to_string(config_path()) else {
        return fallback;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return fallback;
    };
    value
        .get("port")
        .and_then(|port| port.as_u64())
        .and_then(|port| u16::try_from(port).ok())
        .unwrap_or(fallback)
}

#[tauri::command]
fn read_config() -> Result<ConfigPayload, String> {
    let path = config_path();
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
    Ok(ConfigPayload {
        path: path.display().to_string(),
        text,
    })
}

/// Backup, then temp file, then rename. A crash mid-save leaves either the previous
/// config or the new one, never a half-written file the helper would refuse to load.
/// Takes the root explicitly so it can be exercised against a scratch directory.
fn save_config_in(root: &Path, text: &str) -> Result<SaveResult, String> {
    let parsed: serde_json::Value = serde_json::from_str(text)
        .map_err(|error| format!("refusing to write invalid JSON: {error}"))?;
    if !parsed.get("actions").map(|a| a.is_object()).unwrap_or(false) {
        return Err("refusing to write a config without an actions object".into());
    }

    let path = root.join("config.json");
    let backup = root.join("config.backup.json");
    if path.is_file() {
        std::fs::copy(&path, &backup)
            .map_err(|error| format!("cannot write backup {}: {error}", backup.display()))?;
    }

    let temporary = path.with_file_name(format!("config.json.tmp-{}", std::process::id()));
    std::fs::write(&temporary, text.as_bytes())
        .map_err(|error| format!("cannot write {}: {error}", temporary.display()))?;
    std::fs::rename(&temporary, &path).map_err(|error| {
        let _ = std::fs::remove_file(&temporary);
        format!("cannot replace {}: {error}", path.display())
    })?;

    Ok(SaveResult {
        path: path.display().to_string(),
        backup_path: backup.display().to_string(),
    })
}

#[tauri::command]
fn save_config(text: String) -> Result<SaveResult, String> {
    save_config_in(&repo_root(), &text)
}

#[tauri::command]
fn reload_helper() -> Result<ScriptOutput, String> {
    let path = script("reload-config.sh")?;
    run("/bin/zsh", &[path.to_str().unwrap_or_default()])
}

#[tauri::command]
fn run_action(action_id: String) -> Result<ScriptOutput, String> {
    if action_id.is_empty()
        || !action_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err(format!("unsupported action id: {action_id}"));
    }
    let path = script("action.sh")?;
    run("/bin/zsh", &[path.to_str().unwrap_or_default(), &action_id])
}

#[tauri::command]
fn bridge_health() -> bool {
    let url = format!("http://127.0.0.1:{}/health", configured_port());
    match run("/usr/bin/curl", &["-sS", "--max-time", "2", &url]) {
        Ok(output) => output.ok && output.stdout.contains("\"ok\":true"),
        Err(_) => false,
    }
}

#[tauri::command]
fn helper_running() -> bool {
    let query = format!("launchctl print gui/$(id -u)/{HELPER_LABEL}");
    match run("/bin/sh", &["-c", &query]) {
        Ok(output) => output.ok && output.stdout.contains("state = running"),
        Err(_) => false,
    }
}

#[tauri::command]
fn restart_helper() -> Result<ScriptOutput, String> {
    // kickstart -k restarts a loaded agent; bootstrap covers the case where it was
    // never loaded in this login session.
    let query = format!(
        "launchctl kickstart -k gui/$(id -u)/{HELPER_LABEL} || launchctl bootstrap gui/$(id -u) \
         \"$HOME/Library/LaunchAgents/{HELPER_LABEL}.plist\""
    );
    run("/bin/sh", &["-c", &query])
}

#[tauri::command]
fn paths_exist(paths: Vec<String>) -> HashMap<String, bool> {
    paths
        .into_iter()
        .map(|path| {
            let exists = Path::new(&path).exists();
            (path, exists)
        })
        .collect()
}

#[tauri::command]
fn reveal_config() -> Result<(), String> {
    let path = config_path();
    run("/usr/bin/open", &["-R", path.to_str().unwrap_or_default()]).map(|_| ())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run_app() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_config,
            save_config,
            reload_helper,
            run_action,
            bridge_health,
            helper_running,
            restart_helper,
            paths_exist,
            reveal_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running Macro Bridge");
}

#[cfg(test)]
mod tests {
    use super::save_config_in;
    use std::path::{Path, PathBuf};

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pmb-save-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn seed(root: &Path, text: &str) {
        std::fs::write(root.join("config.json"), text).unwrap();
    }

    fn read(root: &Path, name: &str) -> String {
        std::fs::read_to_string(root.join(name)).unwrap()
    }

    fn leftovers(root: &Path) -> Vec<String> {
        std::fs::read_dir(root)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
            .filter(|name| name.contains(".tmp-"))
            .collect()
    }

    #[test]
    fn keeps_the_previous_config_as_a_backup() {
        let root = scratch("backup");
        seed(&root, r#"{"actions":{"old":{"type":"effect"}}}"#);

        save_config_in(&root, "{\"actions\":{\"new\":{\"type\":\"effect\"}}}\n").unwrap();

        assert!(read(&root, "config.json").contains("new"));
        assert!(read(&root, "config.backup.json").contains("old"));
        assert!(leftovers(&root).is_empty(), "a temp file was left behind");
    }

    #[test]
    fn refuses_invalid_json_without_touching_the_live_config() {
        let root = scratch("invalid");
        let original = r#"{"actions":{"keep":{"type":"effect"}}}"#;
        seed(&root, original);

        let error = save_config_in(&root, "{ not json").unwrap_err();

        assert!(error.contains("invalid JSON"), "{error}");
        assert_eq!(read(&root, "config.json"), original);
        assert!(!root.join("config.backup.json").exists(), "a rejected save must not rotate the backup");
        assert!(leftovers(&root).is_empty());
    }

    #[test]
    fn refuses_a_config_the_bridge_could_not_load() {
        let root = scratch("shape");
        let original = r#"{"actions":{"keep":{"type":"effect"}}}"#;
        seed(&root, original);

        // Valid JSON, but the helper and the CEP side both require `actions`.
        let error = save_config_in(&root, r#"{"port":48777}"#).unwrap_err();

        assert!(error.contains("actions"), "{error}");
        assert_eq!(read(&root, "config.json"), original);
    }

    #[test]
    fn writes_the_first_config_when_none_exists_yet() {
        let root = scratch("fresh");

        save_config_in(&root, r#"{"actions":{}}"#).unwrap();

        assert!(root.join("config.json").exists());
        assert!(!root.join("config.backup.json").exists());
    }
}
