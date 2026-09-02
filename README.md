# Premiere Macro Bridge

Private, local-only macOS bridge for Adobe Premiere Pro 2026.

`Ulanzi shortcut -> Carbon global hotkey -> 127.0.0.1:48777 -> invisible CEP -> ExtendScript/QE -> Premiere`

All user actions live in one `actions` object in `config.json`. Adding another effect, SFX, or MOGRT does not require editing or recompiling the helper.

Saved user presets are intentionally out of scope. The active code does not parse `.prfpset`, reconstruct presets, or automate drag-and-drop.

## Current mappings

- `Control + Option + 1` -> `gaussianBlur` -> Gaussian Blur
- `Control + Option + 2` -> `whoosh01` -> Camera Flash Charge WAV
- `Control + Option + 3` -> `questionBox` -> Video Thumbnail + Title MOGRT

`transform` and `crop` are valid manual actions without hotkeys.

Run `./scripts/list-actions.sh` for the current source of truth.

## Install

```sh
./scripts/install-local.sh
```

Restart Premiere after changing CEP, JavaScript, or ExtendScript source. Editing only `config.json` requires no compilation and no Premiere restart:

```sh
./scripts/reload-config.sh
```

The CEP side reads the editable `config.json` for every action. `reload-config.sh` validates it, writes an internal runtime snapshot under `~/Library/Application Support/PremiereMacroBridge`, and restarts only the Carbon helper so it can rebuild its hotkey registrations. The snapshot works around macOS privacy restrictions on LaunchAgents reading `Documents`; do not edit it manually.

Health and logs:

```sh
./scripts/status.sh
tail -f ~/Library/Logs/PremiereMacroBridge/hotkeys.log
tail -f ~/Library/Logs/PremiereMacroBridge/cep.log
```

The HTTP server binds only to `127.0.0.1:48777`.

## Action registry schema

```json
{
  "port": 48777,
  "actions": {
    "gaussianBlur": {
      "type": "effect",
      "label": "Gaussian Blur",
      "premiereName": "Gaussian Blur",
      "hotkey": "ctrl+alt+1"
    },
    "whoosh01": {
      "type": "sfx",
      "label": "Whoosh 01",
      "path": "/absolute/path/to/whoosh.wav",
      "hotkey": "ctrl+alt+2"
    },
    "questionBox": {
      "type": "mogrt",
      "label": "Question Box",
      "path": "/absolute/path/to/question-box.mogrt",
      "durationSeconds": 15,
      "hotkey": "ctrl+alt+3"
    }
  }
}
```

Requirements:

- `effect`: `type`, `premiereName`; optional `label`, `hotkey`.
- `sfx`: `type`, absolute existing `path`; optional `label`, `hotkey`.
- `mogrt`: `type`, absolute existing `path`, positive `durationSeconds`; optional `label`, `hotkey`.

Supported hotkey tokens are `ctrl`, `alt`, `shift`, and `cmd`, followed by one letter or digit. Parsing is case-insensitive. `control`, `option`, and `command` are accepted aliases. Examples:

- `ctrl+alt+4`
- `ctrl+alt+shift+1`
- `ctrl+shift+a`
- `ctrl+alt+q`
- `cmd+shift+7`

Modifier order does not matter for conflict detection. If two actions resolve to the same combination, neither conflicting hotkey is registered. Invalid actions and missing files are logged and skipped; valid mappings remain active.

## Add an action

Effect:

```json
"transform": {
  "type": "effect",
  "label": "Transform",
  "premiereName": "Transform",
  "hotkey": "ctrl+alt+t"
}
```

SFX:

```json
"impact01": {
  "type": "sfx",
  "label": "Impact 01",
  "path": "/absolute/path/to/impact.wav",
  "hotkey": "ctrl+alt+i"
}
```

MOGRT:

```json
"lowerThird": {
  "type": "mogrt",
  "label": "Lower Third",
  "path": "/absolute/path/to/lower-third.mogrt",
  "durationSeconds": 10,
  "hotkey": "ctrl+alt+l"
}
```

After saving `config.json`, run:

```sh
./scripts/reload-config.sh
./scripts/list-actions.sh
```

No helper rebuild is needed.

## Manual execution

Every valid action can be tested without a hotkey:

```sh
./scripts/action.sh gaussianBlur
./scripts/action.sh whoosh01
./scripts/action.sh questionBox
./scripts/action.sh transform
```

The helper sends only `{ "actionId": "..." }`. The CEP bridge runs the central `executeAction(actionId)` dispatcher, reads the matching config object, and selects the existing implementation by `type`.

## Premiere behavior

### Built-in effect

An effect requires a selected video clip. ExtendScript resolves the exact built-in effect through QE, locates the QE counterpart of the selected TrackItem, calls `addVideoEffect`, then verifies that the expected component was added. No UI focus is required.

### SFX

The bridge reads the playhead, reuses an existing ProjectItem by canonical media path or imports the WAV, measures its duration, and calls `findFirstFreeAudioTrackAtTime(time, duration)`. A track is free only when no clip overlaps the complete insertion range.

### MOGRT

The bridge calls Premiere's `Sequence.importMGT(path, ticks, videoTrackIndex, audioTrackIndex)`. The complete configured duration is checked on both destination tracks before insertion.

If no existing track is safe, the bridge returns `NO_FREE_AUDIO_TRACK` or `NO_FREE_VIDEO_TRACK`; it does not create tracks or overwrite existing clips.

## Ulanzi Studio

Create Keyboard Shortcut buttons using the label/hotkey pairs printed by:

```sh
./scripts/list-actions.sh
```

On macOS, `ctrl` is Control, `alt` is Option, and `cmd` is Command. The Ulanzi device only emits the combination; it does not need Premiere integration.
