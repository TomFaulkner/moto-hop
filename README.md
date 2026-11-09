# Moto Hop

A side-scrolling, four-lane motocross overlay game as a native
[Omarchy](https://omarchy.org/) shell plugin (Quickshell / QML Canvas).
Working title; to rename, change `TITLE` in `Game.js` plus `id`/`name` in
`manifest.json` (and the id strings in `BarWidget.qml` / `MotoHop.qml`).

No physics engine: hand-rolled arcade rules and state in `Game.js`.

**Milestone 1:** bike render. Flat scrolling track, 4 lanes, spinning wheels,
wheelie / nose-down lean, lane changes, crash tumble.

**Milestone 2a:** turbo and engine heat. Turbo raises the speed cap and
fills a TEMP bar; at 100 the bike overheats, coasts to a stop, and cools down.

**Milestone 2b:** ramps, cooling arrows, and optional boost strips. Riding a
slope pitches the bike; leaving a lip launches it. Left/right in the air set
the landing angle (clean, speed penalty, or the existing tumble). Cooling
arrows zero heat. Boost strips (`ENABLE_BOOST_STRIPS`) give a one-second burst
above the cap and add no heat.

**Milestone 2c (this):** track pieces at NES scale. Raised pieces are profile
segments (up, plateau, down, gap), so a landing on any of those faces works,
including a down-slope whose pitch matches the bike. Big ramps are two to
three-and-a-half bike-heights (the sprite is 43px). The camera lifts for tall
lips. Mud and grass slow the bike. Changing lanes into a raised piece from
the side, or off the side of one, tumbles. Partial raised pieces draw a side
face. The course is a loop of these pieces, plus downward steps, a washboard of tiny mounds, and low walls / half-lane barriers that clear only with a wheelie or a jump. A checkered line marks the start of each lap, and the HUD shows the lap, the time on this lap, and the last lap time. See `docs/track-pieces.md`.
Shapes follow the nesmaps.com Excitebike sheet; the pixels are ours.

CPU riders share the player's side-crash rule on ramp edges, recover after
1.5s, and use turbo on open straights while managing their own heat (they can
overheat and stall if they redline while catching up). Cooling arrows zero
their heat too.

The race is three laps of the loop. The finish that would start lap four ends
it: everything freezes, a results panel shows your position out of four, the
total race time, and the best time banked in
`~/.local/state/moto-hop/prefs.json` (a new best is flagged). `R` restarts and
keeps the best. The HUD counts `LAP n/3` with the current lap, the last split,
and the best total.

The HUD speed is km/h (120 cruise, 180 turbo). The track moves at 1.5 pixels
per km/h each second. Mud and boost never cover all four lanes, and mud is
short. Grass or mud after a ramp sits in the landing and the bypass, so a
jump clears it. Rumble strips are a run of small teeth that jolt and slow
the bike. Holding the accelerator or turbo on a down-slope adds a slight
speed bump that fades on the flat. Forward lean on flat ground keeps the
front tire on the road.

## Layout

- `Game.js` — pure rules/state (no Qt), also loaded by node tests
- `Scene.qml` — pure QtQuick drawing; 384×224 logical canvas, integer-scaled, nearest filtering
- `MotoHop.qml` — Quickshell overlay (PanelWindow, keys, 60 Hz tick)
- `BarWidget.qml`, `manifest.json` — Omarchy plugin glue
- `tools/shoot.py`, `tools/preview.qml` — headless screenshots

## Controls

- `Space` / `Z` / `J`: throttle (hold). Top speed 120 km/h; heat slowly cools. A down-slope adds a little more while it is held.
- `Shift` / `K`: turbo (hold). Top speed 180 km/h, faster acceleration, heat rises. Same downhill bump, still no extra heat.
- `←` / `A`: lean back (wheelie, at speed); in the air, nose up
- `→` / `D`: lean forward. On flat ground the rear lifts so the front tire stays on the road. In the air, nose down.
- `↑` `↓` / `W` `S`: change lane
- `R`: restart the race (any time; the best time is kept)
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
writes `idle`, `riding`, `wheelie`, `lane`, `crash`, `crashed`, `turbo`, `overheat`,
`ramp-up`, `airborne`, `cool-arrow`, `boost`, `land-crash`, `wide-partial`,
`hazards`, `rumble`, `nose`, `downhill`, `ramp-climb`, `pieces-closeup`,
`finish`, `results`, `ramp-top`, `cpu-pack`, `cpu-pass`, `cpu-ramp`, `cpu-clip`, `cpu-mud`, `cpu-side-crash`, `cpu-turbo`, `wall-hit`, `wall-wheelie`, `barrier`, `step`, `wash` PNGs.

See `CREDITS.md` for asset sources and licenses.
