# Track pieces

Shape reference only: the NES Excitebike track sprites on
[nesmaps.com](https://nesmaps.com) (Excitebike sprites page). Proportions were
read off that sheet. No pixels are copied. `Scene.qml` draws every piece with
its own dirt, mud, and grass palette.

The NES bike sprite is 20×21. Ours is 81×43 (`SPRITE` in `Game.js`). One
bike-height here is 43px. NES full-width sprites include the isometric depth
of the four-lane track (a flat strip is 48px tall), so the rise above the
ground is the extra height. The notes below use that rise, in NES bike-heights,
and the matching height of our piece.

Raised pieces are a list of profile segments. Height starts at 0 at the
piece's `x` and each segment is one of:

- **up** — height increases. Slope is nose-up (negative degrees, same sign as a wheelie).
- **flat** — a plateau. Slope 0.
- **down** — height decreases. Slope is nose-down (positive degrees).
- **gap** — no surface. Leaving a raised span into a gap, or off the end while still in the air, launches.

The rear wheel sticks to the segment under it, on an up-slope, a plateau, or a
down-slope. Pitch is the segment slope, so the tire sits on the face. Landing
compares pitch to that slope: within 8° is clean, within 16° keeps 62% of
speed. Nose-down past 12° from the slope tumbles. On flat ground a rear-wheel
landing is safe unless the bike is over-rotated past 50° nose-up; a mismatched
pitch on a slope still tumbles. A down-slope whose pitch matches the bike is a
clean landing. A span that ends above the ground is a cliff lip; crossing it
launches. Vertical speed is the piece's kick scaled by `speed / MAX_SPEED`,
plus a term from the lip angle, so a taller lip and a faster run both stay up
longer.

A piece only fills the lanes in its `lanes` array. Changing lanes into a lane
whose surface at the bike's x is more than a few pixels above the wheels, or
off the side of a raised piece into a lane that does not have it, uses the
same tumble as a bad landing. A lane change that finishes before the piece is
clear, and a change along a piece that fills both lanes stays on the face.
On the near edge, where the next lane does not have the piece, `Scene.qml`
draws a dark side face under the riding surface. The drawn crust is one pixel
into the tire so the wheel meets the dirt.

`cameraY` drops the horizon when the bike or a lip already on screen would
pass under the HUD, so a 3.5-bike table and the air above it stay in the
384×224 view.

## NES pieces

| NES | Sprite | Shape | Lanes | Effect | Ours |
| --- | --- | --- | --- | --- | --- |
| Hurdle A | 24×57 | Short up-slope, steep drop. About 1 bike tall. | Full | Small jump | `ramp` `small` |
| Hurdle B | 40×65 | Up-slope then a down-slope. About 1.2 bikes. | Full | Jump off the crest | `ramp` `medium` |
| Hurdle C | 72×81 | Long up, short top, steep drop. About 2 bikes. | Full | Big jump | `ramp` `large` |
| Hurdle D | 72×64 | Wide low mound, gentle both ways. | Full | Roll over | `hump` `wide` |
| Hurdle E | 40×81 | Short face, about 2 bikes tall. | Full | Steep jump | `ramp` `steep` |
| Hurdle F | 48×73 | Medium-tall ramp, steep back face. | Full | Jump | `ramp` `large` (same family) |
| Hurdle G | 47×73 | Mirror of F, steep back face. | Full | Jump | `ramp` `steep` (same family) |
| Hurdle H | 16×40 | Low wedge, about two lanes wide. | Partial | Small kick | `bump` `small` |
| Hurdles I & J | 8×32 | Tiny low bumps. | Partial | Light disturbance | `bump` `tiny` |
| Hurdles K & L | 24×48 | Small mud patches. | Partial | Heavy slow | `mud` (partial lanes) |
| Hurdles M & N | 16×8 | Single-lane cooling chevrons. | One lane | Heat to 0 | `cool` |
| Hurdle O | 200×48 | Long mud strip. | Full | Heavy slow | `mud` (all lanes) |
| Hurdle P | 200×48 | Long grass strip. | Full | Slow | `grass` |
| Hurdle Q | 96×48 | Short grass strip. | Full | Slow | `grass` (shorter `len`) |
| Hurdle R | 208×96 | Long up, long plateau, steep drop. About 3–4 bikes. | Full | Land on top, or launch off the end | `table` `giant` |
| Hurdle S | 216×96 | Up to a lip, gap with humps below, down-slope landing. | Full | Double jump | `double` |

`boost` is ours, not an NES piece: a one-second burst above the turbo cap that adds no heat (`ENABLE_BOOST_STRIPS`).

## Our profiles

Heights are the peak above the lane. Angles are the face angle.

| Entry | Peak | Profile | Gameplay |
| --- | --- | --- | --- |
| `ramp` `small` | 43px, 1.0 bike | Up 72px (31°), cliff | Short jump. Rear-wheel landing on the flat is safe. |
| `ramp` `medium` | 50px, 1.2 bikes | Up 200px (14°), cliff | Untouched landing on flat is a speed penalty, not a crash. |
| `ramp` `large` | 86px, 2.0 bikes | Up 210px (22°), plateau 28px, cliff | Big air. The short top launches level. |
| `ramp` `steep` | 86px, 2.0 bikes | Up 92px (43°), cliff | Tall and short. Partial lanes, side face drawn. |
| `hump` `wide` | 36px, 0.8 bike | Up 150, plateau 90, down 150 (about 14°) | Ride over. No lip. |
| `table` `long` | 64px, 1.5 bikes | Up 120 (28°), plateau 260, down 130 (26°) | Land on the up, the top, or the down. |
| `table` `giant` | 150px, 3.5 bikes | Up 300 (27°), plateau 380, cliff | The big table. Camera lifts to keep the top on screen. |
| `double` | 120px, 2.8 bikes | Up 180 (34°), gap, two 14px humps, down 200 (31°) | Jump the gap and land on the down-slope. |
| `bump` `small` | 16px | Up 70, down 70 (13°), lanes `[1, 2]` | Partial mound, side face on the near lane. |
| `bump` `tiny` | 8px | Up 40, down 40 (11°), one lane | Smaller partial mound, side face drawn. |
| `mud` | 0 | Ground strip, `len` from the course entry | Speed falls to 40. Full strip or a partial one. |
| `grass` | 0 | Ground strip | Speed falls to 72. |
| `cool` | 0 | Chevrons on the listed lanes | Heat to 0. Other lanes ignore it. |
| `boost` | 0 | Hazard stripes | One second at 250, no heat. Ignored when the flag is off. |

Course entries are `{type, x, lanes, size?, len?}`. Raised pieces take `len` from the profile. Strips set `len` themselves. Nothing crosses the `COURSE_LEN` seam. The first piece is past the run the turbo and overheat tests travel from a standing start.
