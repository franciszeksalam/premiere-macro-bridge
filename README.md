# Premiere Macro Bridge (private local MVP)

Local-only macOS hotkeys for Adobe Premiere Pro 2026:

- `Control + Option + 1` -> saved Premiere preset selected in `config.json`
- `Control + Option + 2` -> SFX `whoosh01` at the playhead

Architecture: Carbon global hotkey helper -> `127.0.0.1:48777` -> invisible CEP extension -> ExtendScript/QE DOM -> Premiere timeline.

## Setup

```sh
./scripts/install-local.sh
```

Restart Premiere Pro after the first install. The CEP extension is copied into the per-user CEP directory, is invisible, and starts on Premiere application activation; no panel focus is required. It reads the live `config.json` from this repository on every action.

This machine already has CEP PlayerDebugMode enabled. The setup script deliberately does not change that global Adobe preference.

Health check:

```sh
./scripts/status.sh
```

Direct bridge checks (do not replace the real hotkey E2E test):

```sh
./scripts/action.sh applyPreset smoothZoom
./scripts/action.sh applyPreset scalePopBounceIn
./scripts/action.sh insertSfx whoosh01
```

Logs:

- `~/Library/Logs/PremiereMacroBridge/hotkeys.log`
- `~/Library/Logs/PremiereMacroBridge/cep.log`
- `~/Library/Logs/PremiereMacroBridge/launchagent.out.log`
- `~/Library/Logs/PremiereMacroBridge/launchagent.err.log`

## Config

Edit `config.json`. Preset and SFX action logic is generic; new buttons are data entries.

Before SFX testing, set an absolute WAV path:

```json
"sfx": {
  "whoosh01": {
    "path": "/absolute/path/to/whoosh.wav"
  }
}
```

Restart the hotkey helper after changing `hotkeys` or `port`:

```sh
launchctl kickstart -k gui/$UID/com.local.premieremacrobridge.hotkeys
```

Preset/SFX paths are re-read by CEP for every action, so changing only those values does not require a restart.

## Ulanzi Studio

Create two keyboard-shortcut actions:

1. Preset button: macOS `Control` + `Option` + `1` (not Command). On this laptop it maps to `TEXT PRESET - Scale POP Bounce IN`.
2. SFX button: macOS `Control` + `Option` + `2`.

The Ulanzi device only emits the shortcut. It does not need awareness of CEP or Premiere.

## Known constraints

- Applying saved Effects Presets is not in Premiere's supported scripting DOM. The bridge first checks the private QE catalog. Premiere 26 does not expose user presets there, so the working fallback locates the exact case-sensitive name in the active profile's `Effect Presets and Custom Items.prfpset`, adds each underlying effect through QE, and copies its values and keyframes through ExtendScript.
- The preset must actually exist in the active Premiere profile and be visible under Effects > Presets.
- On this laptop `Control + Option + 1` is currently mapped to the available test preset `TEXT PRESET - Scale POP Bounce IN`; change its config `id` back to `smoothZoom` when that preset exists here.
- The `.prfpset` fallback covers ordinary component values and keyframes. Premiere's public property API does not expose every saved Bezier tangent/influence field, so unusually complex presets may require a small compatibility adjustment or keyboard UI automation.
- CEP 12 / ExtendScript still works in Premiere Pro 2026, but Adobe has superseded CEP for new extensions. This local bridge intentionally favors today's shortest working path.
- SFX placement uses `overwriteClip` only after checking that the complete SFX interval is free. If no existing audio track is free, QE adds a stereo audio track at the end.
