# Macro Bridge configurator

A local Tauri app for editing the bridge's `config.json` without opening a text editor.

It is a layer over the working bridge, not a second implementation of it. The app never
applies an effect, imports a WAV, or inserts a MOGRT itself; it edits one file and runs the
scripts that were already there.

```
GUI -> ../config.json -> scripts/reload-config.sh -> Carbon helper
GUI -> scripts/action.sh <actionId> -> localhost bridge -> ExtendScript
```

## Run

```sh
npm install
npm run dev
```

The release build lands in `src-tauri/target/release/bundle/macos/Macro Bridge.app`:

```sh
npm run build
```

The bundle is unsigned. macOS will ask for confirmation the first time it is opened from
Finder; this is a private tool, not a distributed one.

## Which config it edits

`/Users/apple/Documents/GitHub/premiere-macro-bridge/config.json` — the same file the CEP
bridge reads and the same file `reload-config.sh` syncs to the helper. There is no second
config. Set `PMB_REPO_ROOT` to point the app at a different checkout; the tests use it to
work on scratch copies.

## What it does

- **Effects, SFX, MOGRT tabs** — add, edit, delete, reorder by dragging, search, and test.
- **Hotkey recorder** — click, press the combination, and the app stores `ctrl+alt+shift+1`
  while showing `⌃⌥⇧1`. It reads `event.code`, so Option producing `¡` instead of `1` does
  not matter. A combination already in use is refused, naming the action that owns it.
- **Test** — runs `scripts/action.sh <actionId>`, the same id a hotkey sends. Bridge error
  codes are shown in plain language with the code kept alongside.
- **Save** — validates, backs up to `config.backup.json`, writes atomically, then reloads
  the helper. A failed reload leaves the saved config in place rather than losing the edit.
- **Ulanzi Map** — a read-only deck view of the mappings, to copy into Ulanzi Studio. It
  does not talk to the device.
- **iconPath** — an optional image or GIF per action, used only by this app's own views.
  The bridge ignores the field.

## Validation

The rules are not reimplemented here. `src/lib/registry.ts` imports `../js/action-registry.js`
— the bridge's own validator — so the GUI accepts exactly what the Carbon helper accepts.
Two checks are added on top, because a webview cannot make them: whether an action id is
safe to pass through `action.sh`, and whether referenced files still exist on disk.

## Config shape

The app writes the same `actions` object the bridge already reads, plus one key of its own:

```json
{
  "port": 48777,
  "actions": { "...": { "type": "sfx", "label": "…", "path": "…", "hotkey": "ctrl+alt+2" } },
  "actionOrder": ["gaussianBlur", "whoosh01", "questionBox"]
}
```

`actionOrder` is drag-and-drop order. Neither the helper nor the CEP side reads it, so it
cannot affect playback, and an action missing from the list is still shown and still works.

## Tests

Run from the repository root, together with the bridge's own suite:

```sh
./scripts/test.sh
```

- `tests/lib.test.mjs` — ids, ordering, validation, hotkey parsing and formatting.
- `tests/roundtrip.test.mjs` — builds a config with the app's own code, then feeds it to
  `sync-runtime-config.js` and the compiled helper and checks the new hotkey registers.
- `src-tauri` unit tests — backup, atomic replace, and refusing to write a config the
  bridge could not load.
