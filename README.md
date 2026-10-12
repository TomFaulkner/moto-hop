# Moto Hop

A side-scrolling, four-lane motocross overlay game as a native
[Omarchy](https://omarchy.org/) shell plugin (Quickshell / QML Canvas).
Working title; to rename, change `TITLE` in `Game.js` plus `id`/`name` in
`manifest.json` (and the id strings in `BarWidget.qml` / `MotoHop.qml`).

No physics engine: hand-rolled arcade rules and state in `Game.js`.

**Milestone 1 (this):** bike render only. Flat scrolling track, 4 lanes, spinning
wheels, wheelie / nose-down lean, lane changes, crash tumble.

## Layout

- `Game.js` — pure rules/state (no Qt), also loaded by node tests
- `Scene.qml` — pure QtQuick drawing; 256×224 logical canvas, integer-scaled, nearest filtering
- `MotoHop.qml` — Quickshell overlay (PanelWindow, keys, 60 Hz tick)
- `BarWidget.qml`, `manifest.json` — Omarchy plugin glue
- `tools/shoot.py`, `tools/preview.qml` — headless screenshots

## Controls

- `Space` / `Z` / `J`: throttle (hold)
- `←` / `A`: lean back (wheelie, at speed)  ·  `→` / `D`: lean forward
- `↑` `↓` / `W` `S`: change lane
- `X` / `C`: crash (debug pose)
- `Esc` or click outside: close

## Install (from this checkout)

```sh
ln -sfn "$PWD" ~/.config/omarchy/plugins/io.github.tomfaulkner.moto-hop
omarchy plugin validate ~/.config/omarchy/plugins/io.github.tomfaulkner.moto-hop
omarchy plugin enable io.github.tomfaulkner.moto-hop --section right
omarchy-shell shell toggle io.github.tomfaulkner.moto-hop
```

## Tests and screenshots

```sh
node --test test/*.cjs
QT_QPA_PLATFORM=offscreen python tools/shoot.py screens   # needs PySide6 6.x
```

`shoot.py` renders `Scene.qml` (the same file the plugin uses) offscreen and
writes `idle`, `riding`, `wheelie`, `lane`, `crash`, `crashed` PNGs.

See `CREDITS.md` for asset sources and licenses.
