import { invoke } from "@tauri-apps/api/core";

export interface ConfigPayload {
  path: string;
  text: string;
}

export interface SaveResult {
  path: string;
  backupPath: string;
}

export interface ScriptOutput {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export const readConfig = () => invoke<ConfigPayload>("read_config");

export const saveConfig = (text: string) => invoke<SaveResult>("save_config", { text });

export const reloadHelper = () => invoke<ScriptOutput>("reload_helper");

export const runAction = (actionId: string) => invoke<ScriptOutput>("run_action", { actionId });

export const bridgeHealth = () => invoke<boolean>("bridge_health");

export const helperRunning = () => invoke<boolean>("helper_running");

export const restartHelper = () => invoke<ScriptOutput>("restart_helper");

export const pathsExist = (paths: string[]) => invoke<Record<string, boolean>>("paths_exist", { paths });

export const revealConfig = () => invoke<null>("reveal_config");
