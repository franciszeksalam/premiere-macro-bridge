import type { Action } from "./types";

/**
 * Bridge and ExtendScript error codes, in plain language. The code itself is kept
 * alongside the sentence — when something goes wrong in Premiere the code is what
 * matches the hotkeys.log line.
 */
const CODES: Record<string, string> = {
  NO_ACTIVE_SEQUENCE: "Brak otwartej sekwencji w Premiere.",
  NO_SELECTED_CLIP: "Nie zaznaczono klipu.",
  EFFECT_NOT_FOUND: "Premiere nie zna efektu o tej nazwie.",
  EFFECT_APPLY_FAILED: "Nie udało się nałożyć efektu.",
  SFX_NOT_FOUND: "Nie znaleziono pliku audio.",
  SFX_IMPORT_FAILED: "Nie udało się zaimportować pliku audio do projektu.",
  SFX_INSERT_FAILED: "Nie udało się wstawić SFX-u na oś czasu.",
  NO_FREE_AUDIO_TRACK: "Brak wolnej ścieżki audio pod playheadem.",
  MOGRT_NOT_FOUND: "Nie znaleziono pliku MOGRT.",
  MOGRT_INSERT_FAILED: "Nie udało się wstawić MOGRT-a na oś czasu.",
  NO_FREE_VIDEO_TRACK: "Brak wolnej ścieżki wideo pod playheadem.",
  UNKNOWN_ACTION: "Bridge nie zna tej akcji. Zapisz konfigurację i przeładuj helpera.",
  UNKNOWN_ACTION_TYPE: "Nieobsługiwany typ akcji.",
  INVALID_ACTION_CONFIG: "Konfiguracja tej akcji jest niepoprawna.",
  DUPLICATE_HOTKEY: "Ten skrót jest przypisany do więcej niż jednej akcji.",
  FILE_NOT_FOUND: "Plik nie istnieje pod zapisaną ścieżką.",
  BRIDGE_ERROR: "Bridge nie odpowiedział poprawnie."
};

export function explain(code: string | undefined, fallback?: string): string {
  if (!code) return fallback || "Nieznany błąd.";
  const sentence = CODES[code];
  if (!sentence) return `${fallback || "Nieznany błąd."} (${code})`;
  return `${sentence} (${code})`;
}

export function successMessage(action: Action, label: string): string {
  if (action.type === "effect") return `${label} applied`;
  if (action.type === "sfx") return `${label} inserted`;
  return `${label} inserted`;
}

/** Premiere is not running, the extension has not loaded, or the port is taken. */
export const BRIDGE_OFFLINE_HINT =
  "Bridge nie odpowiada. Sprawdź, czy Premiere jest uruchomione — niewidoczne rozszerzenie CEP startuje razem z nim.";
