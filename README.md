# Premiere Macro Bridge

Private, local-only macOS bridge for Adobe Premiere Pro 2026.

Flow:

`Ulanzi shortcut -> Carbon global hotkey -> 127.0.0.1:48777 -> invisible CEP -> ExtendScript/QE -> Premiere`

Current mappings:

- `Control + Option + 1` -> `applyEffect:gaussianBlur`
- `Control + Option + 2` -> `insertSfx:whoosh01`
- `Control + Option + 3` -> `insertMogrt:questionBox`

Saved user presets are intentionally out of scope. The active code does not parse `.prfpset`, reconstruct presets, or automate drag-and-drop.

## Install

```sh
./scripts/install-local.sh
```

Restart Premiere after changing CEP or ExtendScript files. Changes to media paths in `config.json` are read on each request; changes to hotkey mappings require restarting the LaunchAgent:

```sh
launchctl kickstart -k gui/$UID/com.local.premieremacrobridge.hotkeys
```

Health and logs:

```sh
./scripts/status.sh
tail -f ~/Library/Logs/PremiereMacroBridge/hotkeys.log
tail -f ~/Library/Logs/PremiereMacroBridge/cep.log
```

The HTTP server binds only to `127.0.0.1:48777`.

## Config

Actions are data-driven. Add an entry under `effects`, `sfx`, or `mogrts`, then add a matching entry to `hotkeys`.

Built-in effects use the exact Premiere catalog name. MOGRT entries require a conservative `durationSeconds`; this lets the bridge verify that the whole destination range is free before insertion.

```json
{
  "effects": {
    "gaussianBlur": { "premiereName": "Gaussian Blur" }
  },
  "sfx": {
    "whoosh01": { "path": "/absolute/path/to/file.wav" }
  },
  "mogrts": {
    "questionBox": {
      "path": "/absolute/path/to/template.mogrt",
      "durationSeconds": 15
    }
  }
}
```

## Behavior

### Built-in effect

`applyEffect` requires a selected video clip. ExtendScript resolves the exact built-in effect through QE, locates the QE counterpart of the selected TrackItem, calls `addVideoEffect`, then verifies that the expected component was added. No UI focus is required.

### SFX

The bridge reads the playhead, reuses an existing ProjectItem by canonical media path or imports the WAV, measures its duration, and calls `findFirstFreeAudioTrackAtTime(time, duration)`. A track is free only when no clip overlaps the complete insertion range. It uses `overwriteClip` only after that check and verifies the inserted start ticks.

### MOGRT

The bridge calls Premiere's `Sequence.importMGT(path, ticks, videoTrackIndex, audioTrackIndex)`. `findFirstFreeVideoTrackAtTime(time, duration)` and the audio equivalent validate the complete configured duration before insertion. The returned TrackItem start and duration are verified afterward.

If no existing track is safe, the bridge returns `NO_FREE_AUDIO_TRACK` or `NO_FREE_VIDEO_TRACK`; it does not create tracks or overwrite existing clips.

## Ulanzi Studio

Create three keyboard shortcut buttons using macOS Control and Option, not Command:

1. `Control + Option + 1` — Gaussian Blur
2. `Control + Option + 2` — test WAV
3. `Control + Option + 3` — Question Box MOGRT

The Ulanzi device only emits the key combinations. It does not need to know about CEP or Premiere.
