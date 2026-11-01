// Moto Hop game rules: hand-rolled arcade state, no physics engine.
// Pure JS (no Qt) so it loads in QML and in node tests.
//
// Raised pieces are profile segments (up-slope, plateau, down-slope, gap).
// The rear wheel sticks to whatever segment is under it. A piece that ends
// in the air is a lip: crossing it launches. Landing compares pitch to the
// segment you touch, so a down-slope with a matching nose is clean.
// Changing lanes into a face that is above the wheels, or off the side of
// one, tumbles. Heights are in bike-heights of the 43px sprite.
// Speed on the HUD is km/h. The track scrolls at WORLD_SCALE pixels per
// (km/h · second). Holding throttle or turbo on a down-slope adds a small
// temporary bump over that cap. On flat ground a forward lean lifts the
// rear so the front tire stays on the road.
// See docs/track-pieces.md.

var TITLE = "Moto Hop"
// Wider than NES so more of the course is on screen. Overlay and preview
// integer-scale this canvas (nearest-neighbor) so pixels stay crisp.
var VIEW_W = 384
var VIEW_H = 224
var LANES = 4
var TRACK_TOP = 118
var LANE_H = 22
// Wheel-contact baseline per lane (0 = farthest/top).
var LANE_Y = [136, 158, 180, 202]

// Sprite layout inside the 81x43 assembled bike (matches full_bike.png).
var SPRITE = {
  w: 81, h: 43,
  chassis: { x: 4, y: 0 },
  fork: { x: 62, y: 12 },
  wheelSize: 23,
  rearHub: { x: 11.5, y: 31.5 },
  frontHub: { x: 66.5, y: 31.5 },
  wheelR: 11.5
}
// Exhaust point in assembled-sprite pixels, on top of the engine cases.
var ENGINE = { x: 36, y: 24 }
// One bike-height. Ramp peaks below are multiples of this.
var BIKE_H = SPRITE.h

// Tuning. Speeds are displayed km/h. Heat runs 0..HEAT_MAX.
// Pitch is degrees, negative = nose up (same sign as a wheelie).
// WORLD_SCALE is pixels of track per (km/h · second). The HUD still shows
// 120 and 180; the world just moves faster than one pixel per km/h.
var MAX_SPEED = 120
var TURBO_SPEED = 180
var WORLD_SCALE = 1.5
var ACCEL = 200
var TURBO_ACCEL = 360
var DECEL = 150
var OVERHEAT_DECEL = 450
var HEAT_MAX = 100
var HEAT_RISE = 30           // per second while turbo is held
var HEAT_COOL = 12           // per second on normal throttle
var HEAT_COOL_COAST = 24     // per second with the throttle off
var HEAT_YELLOW = 45         // TEMP bar leaves green
var HEAT_RED = 75            // TEMP bar leaves yellow
var HEAT_FLASH = 90          // TEMP bar flashes near the top
var OVERHEAT_TIME = 3        // seconds of locked cooldown at heat 100
var SMOKE_EVERY = 0.07
var SMOKE_LIFE = 0.9
var SMOKE_VX = [-14, -26, -8, -18]
var SMOKE_VY = [-18, -70, -28, -48]
var WHEELIE_DEG = -25
var NOSE_DEG = 12
var TILT_RATE = 120
var LANE_TIME = 0.25
var CRASH_TIME = 1.5
var CPU_COUNT = 3
var CPU_LOOKAHEAD = 90
var CPU_RIDER_GAP = 40
var CPU_REAR_OVERLAP = 10
var CPU_RUBBERBAND = 10
var CPU_RECOVER_GRACE = 0.35

// Air and ramps. Uphill slopes are negative so they share the wheelie sign.
var GRAVITY = 500            // px/s^2. Big lips stay up longer because they start high.
var AIR_PITCH_RATE = 160     // deg/s while left/right is held in the air
var PITCH_MIN = -55          // nose-up clamp (steep lips launch past the old -50)
var PITCH_MAX = 50           // nose-down clamp (down-slopes land around +35)
var AIR_COOL_RATE = 8        // heat per second while airborne (slow cool)
var LAND_CLEAN_TOL = 8       // |pitch - slope| at or under this lands clean
var LAND_OK_TOL = 16         // on a slope, within this: survive with a speed penalty
var LAND_NOSE_CRASH = 12     // nose-down past this (pitch - slope) crashes
var LAND_REAR_CRASH = 50     // on flat, nose-up past this is over-tilted and crashes
var LAND_SPEED_KEEP = 0.62   // speed kept on an off-angle but survivable landing
var LAUNCH_H = 4             // leaving a surface taller than this is a lip, not a roll-off
// vy += kick * speed/MAX_SPEED  +  speed * sin(|slope|) * SLOPE_LAUNCH
var SLOPE_LAUNCH = 0.65
// Raised surface this far above the wheels is a wall, not a lane you can merge into.
var SIDE_HIT = 8

// Optional. When true, "boost" strips give a short burst above the current cap
// and add no heat. When false, those course entries are ignored and not drawn.
var ENABLE_BOOST_STRIPS = true
var BOOST_TIME = 1           // seconds at the raised cap
var BOOST_SPEED = 250        // above TURBO_SPEED
var BOOST_ACCEL = 700

// Holding throttle or turbo on a down-slope adds this times sin(slope),
// a slight bump over the normal cap that fades as soon as the hill ends.
var DOWNHILL_BONUS = 36

// Mud caps speed hard. Grass is a lighter drag. Rumble is a washboard:
// speed falls between the two, and the rear wheel bounces over the teeth.
// All three are ground strips. Mud and boost in COURSE never span every lane.
var MUD_MAX = 40
var MUD_DECEL = 520
var GRASS_MAX = 72
var GRASS_DECEL = 420       // beats throttle and still slows turbo, gentler than mud
var RUMBLE_MAX = 64
var RUMBLE_DECEL = 460      // beats throttle and turbo; the teeth are the rest of the penalty
var RUMBLE_TOOTH = 12        // px, one bump in the strip
var RUMBLE_H = 6             // px, crest height
var RUMBLE_TILT = 10         // nose-up jolt on the rising face

// Camera keeps the bike sprite and the tallest lip already on screen under the HUD.
var CAM_TOP = 28

function span(len, y0, y1) {
  var slope = -Math.atan2(y1 - y0, len) * 180 / Math.PI
  var kind = "flat"
  if (y1 > y0 + 0.01) kind = "up"
  else if (y1 < y0 - 0.01) kind = "down"
  return { len: len, y0: y0, y1: y1, slope: slope, kind: kind, gap: false }
}

function gapSpan(len) {
  return { len: len, y0: 0, y1: 0, slope: 0, kind: "gap", gap: true }
}

// kick is the vertical pop (px/s) at MAX_SPEED, before the slope term.
// Lengths sit on the spans. A span list that ends above the ground is a cliff lip.
var RAMP_SPEC = {
  // ~1 bike tall, short up, steep drop. NES hurdle A.
  small:  { kick: 70, spans: [span(72, 0, 43)] },
  // ~1.2 bikes, long gentle face so an untouched landing is a penalty not a crash.
  medium: { kick: 80, spans: [span(200, 0, 50)] },
  // 2 bikes, long up, short top, cliff. NES hurdle C.
  large:  { kick: 165, spans: [span(210, 0, 86), span(28, 86, 86)] },
  // 2 bikes on a short face. NES hurdle E.
  steep:  { kick: 110, spans: [span(92, 0, 86)] }
}

var TABLE_SPEC = {
  // Rideable up, long plateau, rideable down. NES hurdle D, stretched into a table.
  long: {
    kick: 70,
    spans: [span(120, 0, 64), span(260, 64, 64), span(130, 64, 0)]
  },
  // ~3.5 bike-heights, long up, long plateau, cliff drop. NES hurdle R.
  giant: {
    kick: 80,
    spans: [span(300, 0, 150), span(380, 150, 150)]
  }
}

// Up to a lip, a short gap with two humps under the arc, then a down-slope
// that the jump meets while it is still high. NES hurdle S.
var DOUBLE_SPEC = {
  kick: 100,
  spans: [
    span(180, 0, 120),
    gapSpan(16),
    span(22, 0, 14),
    span(22, 14, 0),
    span(200, 120, 0)
  ]
}

// Wide low mound, gentle both ways. The low cousin of hurdle D.
var HUMP_SPEC = {
  wide: {
    kick: 40,
    spans: [span(150, 0, 36), span(90, 36, 36), span(150, 36, 0)]
  }
}

// Partial-lane bumps. Long enough that both wheels can sit on one face.
// small ≈ hurdle H (about two lanes). tiny ≈ hurdles I and J.
var BUMP_SPEC = {
  small: { kick: 24, spans: [span(70, 0, 16), span(70, 16, 0)] },
  tiny:  { kick: 12, spans: [span(40, 0, 8), span(40, 8, 0)] }
}

// Looping test track. Raised pieces take their length from the profile.
// Strips are {type, x, len, lanes}. Keep x >= 0 and x + len <= COURSE_LEN.
// The first feature sits past the standing turbo run. World motion is
// WORLD_SCALE px per km/h, so that run is longer than the old 1:1 scroll
// and still ends on the empty straight. Lips have flat after them so a
// test launch lands before the next raised piece. The boost on lane 0 has
// a long clear run after it: the boost test rolls on from the strip.
// Mud and boost never list every lane — leave a line to steer.
// Surface patches never share x with a raised piece in ANY lane: tall
// ramps rise over the neighbouring lanes on screen, so a patch beside one
// draws on its slope.
var COURSE_LEN = 10800
var COURSE = [
  // Short hop. Grass on the bypass lanes; a short mud on the landing lanes
  // that a full jump clears and a crawl lands in.
  { type: "ramp", size: "small", x: 1400, lanes: [0, 1] },
  { type: "grass", x: 1580, len: 72, lanes: [2, 3] },
  { type: "mud", x: 1496, len: 56, lanes: [0, 1] },
  { type: "cool", x: 1720, len: 96, lanes: [0, 1] },
  // Full-width gentle ramp. Landing mud only on the lower pair.
  { type: "ramp", size: "medium", x: 2100, lanes: [0, 1, 2, 3] },
  { type: "mud", x: 2324, len: 64, lanes: [2, 3] },
  { type: "grass", x: 2520, len: 96, lanes: [0, 1] },
  // Lane 0 stays down. Landing mud on the ramp lanes, then a partial boost
  // beside a rumble strip so the next straight is a choice.
  { type: "ramp", size: "large", x: 2900, lanes: [1, 2, 3] },
  { type: "grass", x: 3160, len: 88, lanes: [0] },
  { type: "mud", x: 3164, len: 64, lanes: [1, 2, 3] },
  { type: "boost", x: 3280, len: 80, lanes: [0, 1] },
  { type: "rumble", x: 3360, len: 108, lanes: [2, 3] },
  // Steep face, a landing mud the jump clears, bumps to thread, a mound.
  { type: "ramp", size: "steep", x: 4600, lanes: [0, 1] },
  { type: "grass", x: 4720, len: 80, lanes: [2, 3] },
  { type: "mud", x: 4716, len: 56, lanes: [0, 1] },
  { type: "bump", size: "small", x: 5160, lanes: [1, 2] },
  { type: "bump", size: "tiny", x: 5400, lanes: [3] },
  { type: "hump", size: "wide", x: 5580, lanes: [2, 3] },
  // Long table leaves lane 3 open; giant leaves lane 0. A rumble on that
  // bypass, then a one-lane boost with empty track after it.
  { type: "table", size: "long", x: 6100, lanes: [0, 1, 2] },
  { type: "cool", x: 6780, len: 48, lanes: [1] },
  { type: "double", size: "std", x: 7100, lanes: [0, 1] },
  { type: "table", size: "giant", x: 7900, lanes: [1, 2, 3] },
  { type: "rumble", x: 8800, len: 132, lanes: [0, 1] },
  { type: "mud", x: 9100, len: 72, lanes: [2, 3] },
  { type: "boost", x: 9400, len: 56, lanes: [0] }
]

function specFor(f) {
  if (f.type === "ramp") return RAMP_SPEC[f.size] || RAMP_SPEC.small
  if (f.type === "table") return TABLE_SPEC[f.size] || TABLE_SPEC.long
  if (f.type === "double") return DOUBLE_SPEC
  if (f.type === "hump") return HUMP_SPEC[f.size] || HUMP_SPEC.wide
  if (f.type === "bump") return BUMP_SPEC[f.size] || BUMP_SPEC.small
  return null
}

function bakeCourse() {
  for (var i = 0; i < COURSE.length; i++) {
    var f = COURSE[i]
    var spec = specFor(f)
    if (!spec) {
      f.spans = []
      f.peak = 0
      f.peakAt = 0
      f.kick = 0
      continue
    }
    var spans = []
    var x = 0
    var peak = 0
    var peakAt = 0
    for (var j = 0; j < spec.spans.length; j++) {
      var src = spec.spans[j]
      var sp = {
        x0: x, x1: x + src.len, len: src.len,
        y0: src.y0, y1: src.y1, slope: src.slope,
        kind: src.kind, gap: src.gap
      }
      var top = src.y0 > src.y1 ? src.y0 : src.y1
      if (top > peak) {
        peak = top
        peakAt = src.y1 >= src.y0 ? sp.x1 : sp.x0
      }
      spans.push(sp)
      x += src.len
    }
    f.spans = spans
    f.len = x
    f.peak = peak
    f.peakAt = peakAt
    f.kick = spec.kick || 0
  }
}

bakeCourse()

function makeCpu(id) {
  var lane = [0, 2, 3, 1][id]
  var cruise = [100, 108, 114, 106][id]
  var start = [340, 430, 270, 520][id]
  return {
    id: id, lane: lane, laneY: LANE_Y[lane], worldX: start,
    speed: 0, targetSpeed: cruise,
    height: 0, vy: 0, air: false, tilt: 0,
    phase: "riding", crashT: 0, contactT: 0,
    laneFrom: lane, laneTo: lane, laneT: 0, changing: false,
    palette: id, mudSkill: [0.9, 0.15, 0.75, 0.55][id],
    onPiece: null, onRumble: false, boostT: 0, boostHeld: false
  }
}

function initialState(cpuCount) {
  var count = cpuCount == null ? CPU_COUNT : Math.floor(cpuCount)
  count = Math.max(2, Math.min(4, count))
  var cpus = []
  for (var i = 0; i < count; i++) cpus.push(makeCpu(i))
  return {
    phase: "idle", lane: 1, laneY: LANE_Y[1], x: 64,
    speed: 0, scrollX: 0, wheelAngle: 0, tilt: 0,
    heat: 0, overheatT: 0, t: 0, raceStarted: false,
    smoke: [], smokeT: 0, puffN: 0, cpus: cpus,
    crashT: 0, crashY: null, laneFrom: 1, laneTo: 1, laneT: 0, changing: false,
    air: false, height: 0, vy: 0, onPiece: null, onRumble: false,
    boostT: 0, boostHeld: false,
    lap: 1, lapTime: 0, lastLap: -1,
    input: { up: false, down: false, left: false, right: false, throttle: false, turbo: false, crash: false },
    prevInput: { up: false, down: false, crash: false }
  }
}

function clone(s) {
  var n = {}
  for (var k in s) n[k] = s[k]
  n.input = {}
  for (var a in s.input) n.input[a] = s.input[a]
  n.prevInput = {}
  for (var b in s.prevInput) n.prevInput[b] = s.prevInput[b]
  n.cpus = []
  var cpus = s.cpus || []
  for (var c = 0; c < cpus.length; c++) {
    var cpu = {}
    for (var key in cpus[c]) cpu[key] = cpus[c][key]
    n.cpus.push(cpu)
  }
  n.smoke = []
  var sm = s.smoke || []
  for (var i = 0; i < sm.length; i++) {
    var p = sm[i]
    n.smoke.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, life: p.life, max: p.max })
  }
  return n
}

function setInput(state, input) {
  var s = clone(state)
  for (var k in input) s.input[k] = !!input[k]
  return s
}

function approach(v, target, rate) {
  if (v < target) return Math.min(target, v + rate)
  return Math.max(target, v - rate)
}

function heatBand(heat) {
  if (heat >= HEAT_FLASH) return "flash"
  if (heat >= HEAT_RED) return "red"
  if (heat >= HEAT_YELLOW) return "yellow"
  return "green"
}

function rampHeight(size) {
  var spec = RAMP_SPEC[size] || RAMP_SPEC.small
  var peak = 0
  for (var i = 0; i < spec.spans.length; i++) {
    var sp = spec.spans[i]
    if (sp.y0 > peak) peak = sp.y0
    if (sp.y1 > peak) peak = sp.y1
  }
  return peak
}

// Slope you leave the piece with: the last solid span (the lip, or the run-off).
function rampSlope(feature) {
  if (!feature || !feature.spans) return 0
  var last = null
  for (var i = 0; i < feature.spans.length; i++) {
    if (!feature.spans[i].gap) last = feature.spans[i]
  }
  return last ? last.slope : 0
}

// First matching feature. Pass a falsy size to ignore size.
function courseFeature(type, size) {
  for (var i = 0; i < COURSE.length; i++) {
    var f = COURSE[i]
    if (f.type !== type) continue
    if (size && f.size !== size) continue
    return f
  }
  return null
}

function localX(world) {
  var m = world % COURSE_LEN
  if (m < 0) m += COURSE_LEN
  return m
}

function activeLane(s) {
  var best = s.lane
  var bestD = 1e9
  for (var i = 0; i < LANES; i++) {
    var d = Math.abs(LANE_Y[i] - s.laneY)
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

function hasLane(feature, lane) {
  if (!feature || !feature.lanes) return false
  for (var i = 0; i < feature.lanes.length; i++) {
    if (feature.lanes[i] === lane) return true
  }
  return false
}

// Raised surface under a point, or null on flat ground, a gap, or the wrong lane.
function surfaceAt(world, lane) {
  var local = localX(world)
  for (var i = 0; i < COURSE.length; i++) {
    var f = COURSE[i]
    if (!f.spans || !f.spans.length || !hasLane(f, lane)) continue
    if (local < f.x || local >= f.x + f.len) continue
    var rel = local - f.x
    for (var j = 0; j < f.spans.length; j++) {
      var sp = f.spans[j]
      if (rel < sp.x0 || rel >= sp.x1 || sp.gap) continue
      var t = (rel - sp.x0) / sp.len
      var h = sp.y0 + (sp.y1 - sp.y0) * t
      return { index: i, height: h, slope: sp.slope, kind: sp.kind, feature: f, span: sp }
    }
    // Inside the piece but on a gap: the ground is not this piece.
    return null
  }
  return null
}

function stripAt(world, lane, type) {
  var local = localX(world)
  for (var i = 0; i < COURSE.length; i++) {
    var f = COURSE[i]
    if (f.type !== type || !hasLane(f, lane)) continue
    if (local >= f.x && local < f.x + f.len) return f
  }
  return null
}

// How far to push the world down so the bike and the tall lips in view clear the HUD.
function cameraY(s) {
  var scroll = s.scrollX || 0
  var bikeX = s.x || 64
  var base = (s.laneY == null) ? LANE_Y[1] : s.laneY
  var lift = s.height || 0
  if (s.phase === "crash" && s.crashY != null) {
    var crashed = s.laneY - s.crashY
    if (crashed > lift) lift = crashed
  }
  var highest = base - lift - SPRITE.h
  var n0 = Math.floor((scroll - 40) / COURSE_LEN)
  var n1 = Math.floor((scroll + VIEW_W + 40) / COURSE_LEN)
  for (var n = n0; n <= n1; n++) {
    var origin = n * COURSE_LEN
    for (var i = 0; i < COURSE.length; i++) {
      var f = COURSE[i]
      if (!f.peak) continue
      var peakX = origin + f.x + (f.peakAt || 0)
      var screen = peakX - scroll
      if (screen < -30 || screen > VIEW_W + 8) continue
      var spanW = VIEW_W - bikeX
      if (spanW < 1) spanW = 1
      var t = (VIEW_W - screen) / spanW
      if (t < 0) t = 0
      if (t > 1) t = 1
      var lane = f.lanes[0]
      for (var li = 1; li < f.lanes.length; li++) {
        if (f.lanes[li] < lane) lane = f.lanes[li]
      }
      var peakWorld = LANE_Y[lane] - f.peak * t
      if (peakWorld < highest) highest = peakWorld
    }
  }
  if (highest < CAM_TOP) return Math.round(CAM_TOP - highest)
  return 0
}

function advanceLane(s, dt, allowStart, pressedUp, pressedDown) {
  if (s.laneT > 0) {
    // Includes the frame the move finishes. laneFrom stays put after that,
    // so callers must only treat this flag, not a stale laneFrom.
    s.changing = true
    s.laneT = Math.max(0, s.laneT - dt)
    var f = 1 - s.laneT / LANE_TIME
    s.laneY = LANE_Y[s.laneFrom] + (LANE_Y[s.laneTo] - LANE_Y[s.laneFrom]) * f
    if (s.laneT === 0) { s.lane = s.laneTo; s.laneY = LANE_Y[s.lane] }
  } else if (allowStart && (pressedUp || pressedDown)) {
    var to = Math.max(0, Math.min(LANES - 1, s.lane + (pressedUp ? -1 : 1)))
    if (to !== s.lane) {
      s.laneFrom = s.lane
      s.laneTo = to
      s.laneT = LANE_TIME
      s.changing = true
    }
  }
}

// Screen-space exhaust point. Canvas rotation is clockwise in y-down space.
function engineOrigin(s) {
  var dx = ENGINE.x - SPRITE.rearHub.x
  var dy = ENGINE.y - SPRITE.h
  var rad = s.tilt * Math.PI / 180
  var c = Math.cos(rad)
  var sn = Math.sin(rad)
  return { x: s.x + dx * c - dy * sn, y: s.laneY - (s.height || 0) + dx * sn + dy * c }
}

function spawnSmoke(s) {
  var o = engineOrigin(s)
  var n = s.puffN % 4
  // Born on the cases. Faster puffs climb into open air; slow ones stay at the engine.
  s.smoke.push({
    x: o.x + [-6, 0, 6, 2][n],
    y: o.y + [0, -1, 2, 1][n],
    vx: SMOKE_VX[n],
    vy: SMOKE_VY[n],
    life: SMOKE_LIFE,
    max: SMOKE_LIFE
  })
  s.puffN++
}

function updateSmoke(s, dt, spawn) {
  if (spawn) {
    s.smokeT -= dt
    if (s.smokeT <= 0 && s.smoke.length < 24) {
      spawnSmoke(s)
      s.smokeT += SMOKE_EVERY
      if (s.smokeT <= 0) s.smokeT = SMOKE_EVERY
    }
  }
  var next = []
  for (var i = 0; i < s.smoke.length; i++) {
    var p = s.smoke[i]
    p.life -= dt
    if (p.life <= 0) continue
    p.x += p.vx * dt
    p.y += p.vy * dt
    next.push(p)
  }
  s.smoke = next
}

function clearAerial(s) {
  s.air = false
  s.vy = 0
  s.height = 0
  s.onPiece = null
  s.onRumble = false
  s.boostT = 0
  s.boostHeld = false
}

// How far the front tire's lowest point sits below the rear contact after a
// nose-down rotation, in px. Zero when the bike is level. Positive means the
// front wheel would enter the road if the rear contact stayed on the ground.
function frontTireDrop(tiltDeg) {
  var rad = tiltDeg * Math.PI / 180
  var dx = SPRITE.frontHub.x - SPRITE.rearHub.x
  var dy = SPRITE.frontHub.y - SPRITE.h
  return dx * Math.sin(rad) + dy * Math.cos(rad) + SPRITE.wheelR
}

// Extra km/h on a down-slope. sin(slope) keeps a gentle face slight.
function downhillBonus(slopeDeg) {
  if (!slopeDeg || slopeDeg <= 0.5) return 0
  return DOWNHILL_BONUS * Math.sin(slopeDeg * Math.PI / 180)
}

function downhillExtra(s, inp) {
  if (s.air || s.boostT > 0) return 0
  if (!inp.throttle && !inp.turbo) return 0
  var ground = surfaceAt((s.scrollX || 0) + s.x, activeLane(s))
  if (!ground || ground.kind !== "down") return 0
  return downhillBonus(ground.slope)
}

// One tooth of a rumble strip. rel is px into the strip.
function rumbleSample(rel) {
  var tooth = RUMBLE_TOOTH
  var u = rel % tooth
  if (u < 0) u += tooth
  var half = tooth / 2
  var rising = u < half
  var t = rising ? u / half : (tooth - u) / half
  return { h: Math.round(t * RUMBLE_H), rising: rising }
}

function recover(s) {
  s.phase = "idle"
  s.overheatT = 0
  s.heat = 0
  s.speed = 0
  s.tilt = 0
  s.laneT = 0
  s.lane = s.laneTo
  s.laneY = LANE_Y[s.lane]
  s.crashY = null
  clearAerial(s)
}

function beginCrash(s) {
  // Tumble where the bike actually was, not dropped through a tall piece.
  s.crashY = s.laneY - (s.height || 0)
  s.phase = "crash"
  s.crashT = 0
  s.laneT = 0
  s.changing = false
  s.lane = s.laneTo
  s.laneY = LANE_Y[s.lane]
  clearAerial(s)
}

// While a lane change is in progress, the two lanes have to offer about the
// same surface. Merging into a face above the wheels, or leaving one for an
// empty lane, is the tumble. A change that ends before the piece never sees it.
function checkSide(s, world) {
  if (!s.changing || s.air) return false
  var fromS = surfaceAt(world, s.laneFrom)
  var toS = surfaceAt(world, s.laneTo)
  var fromH = fromS ? fromS.height : 0
  var toH = toS ? toS.height : 0
  if (toH > fromH + SIDE_HIT || fromH > toH + SIDE_HIT) {
    beginCrash(s)
    return true
  }
  return false
}

function enterOverheat(s) {
  s.phase = "overheat"
  s.overheatT = 0
  s.heat = HEAT_MAX
  s.smokeT = SMOKE_EVERY
  clearAerial(s)
  spawnSmoke(s)
  spawnSmoke(s)
  spawnSmoke(s)
}

function applyHeat(s, inp, dt) {
  if (inp.turbo) s.heat = Math.min(HEAT_MAX, s.heat + HEAT_RISE * dt)
  else if (inp.throttle) s.heat = Math.max(0, s.heat - HEAT_COOL * dt)
  else s.heat = Math.max(0, s.heat - HEAT_COOL_COAST * dt)
}

function applyThrottle(s, inp, dt) {
  var extra = downhillExtra(s, inp)
  if (inp.turbo) s.speed = approach(s.speed, TURBO_SPEED + extra, TURBO_ACCEL * dt)
  else if (inp.throttle) s.speed = approach(s.speed, MAX_SPEED + extra, ACCEL * dt)
  else s.speed = approach(s.speed, 0, DECEL * dt)
  applyHeat(s, inp, dt)
}

function applyTerrainAt(s, wx, dt) {
  var lane = activeLane(s)
  if (stripAt(wx, lane, "mud")) {
    if (s.speed > MUD_MAX) s.speed = Math.max(MUD_MAX, s.speed - MUD_DECEL * dt)
  } else if (stripAt(wx, lane, "grass")) {
    if (s.speed > GRASS_MAX) s.speed = Math.max(GRASS_MAX, s.speed - GRASS_DECEL * dt)
  } else if (stripAt(wx, lane, "rumble")) {
    if (s.speed > RUMBLE_MAX) s.speed = Math.max(RUMBLE_MAX, s.speed - RUMBLE_DECEL * dt)
  }
}

function applyTerrain(s, dt) {
  applyTerrainAt(s, s.scrollX + s.x, dt)
}

function launch(s, feature, height, slope) {
  s.air = true
  s.onPiece = null
  s.height = height
  s.tilt = slope
  var speed = s.speed > 0 ? s.speed : 0
  var kick = feature && feature.kick ? feature.kick : 0
  var rad = Math.abs(slope) * Math.PI / 180
  var vy = kick * (speed / MAX_SPEED) + speed * Math.sin(rad) * SLOPE_LAUNCH
  if (vy < 0) vy = 0
  s.vy = vy
}

function land(s, ground, noCrash) {
  var slope = ground ? ground.slope : 0
  var diff = Math.abs(s.tilt - slope)
  var noseDown = s.tilt - slope
  s.vy = 0
  s.air = false
  s.height = ground ? ground.height : 0
  s.onPiece = ground ? ground.index : null
  // Flat: rear-wheel (nose-up) is safe unless over-rotated. Nose-down still
  // crashes. On a slope the pitch has to match; a miss tumbles.
  var flat = !ground || Math.abs(slope) < 1
  var crash = noseDown > LAND_NOSE_CRASH
  if (flat) crash = crash || -s.tilt > LAND_REAR_CRASH
  else crash = crash || diff > LAND_OK_TOL
  if (crash && !noCrash) {
    beginCrash(s)
    return
  }
  if (diff > LAND_CLEAN_TOL) s.speed *= LAND_SPEED_KEEP
  s.tilt = slope
}

function interactTrackWorld(s, x0, x1, dt, noCrash) {
  var lane = activeLane(s)

  // Before the new lane's surface can catch the wheels.
  if (!noCrash && checkSide(s, x1)) return

  if (s.air) {
    s.vy -= GRAVITY * dt
    s.height += s.vy * dt
    var under = surfaceAt(x1, lane)
    var floorH = under ? under.height : 0
    if (s.vy <= 0 && s.height <= floorH) land(s, under, noCrash)
    return
  }

  var ground = surfaceAt(x1, lane)
  if (ground) {
    s.onPiece = ground.index
    s.height = ground.height
    s.vy = 0
    s.tilt = ground.slope
    return
  }

  var prevH = s.height || 0
  if (s.onPiece != null && prevH > LAUNCH_H) {
    // Slope of the span we just left, not the 2° the wheelie spring stole this frame.
    var left = surfaceAt(x0, lane)
    var slope = left ? left.slope : s.tilt
    var feature = left ? left.feature : COURSE[s.onPiece]
    launch(s, feature, prevH, slope)
    return
  }

  s.onPiece = null
  s.height = 0
  s.vy = 0
  // Washboard under the rear wheel. Teeth are too low to launch; the pitch
  // kicks nose-up on the way up and settles in the trough.
  var rumble = stripAt(x1, lane, "rumble")
  if (rumble) {
    var sample = rumbleSample(localX(x1) - rumble.x)
    s.onRumble = true
    s.height = sample.h
    s.tilt = (sample.rising && sample.h >= 2) ? -RUMBLE_TILT : 0
  }
}

function interactTrack(s, prevScroll, dt) {
  interactTrackWorld(s, prevScroll + s.x, s.scrollX + s.x, dt, false)
}

function applyBoostAt(s, wx) {
  if (ENABLE_BOOST_STRIPS && stripAt(wx, activeLane(s), "boost")) {
    if (!s.boostHeld) s.boostT = BOOST_TIME
    s.boostHeld = true
  } else {
    s.boostHeld = false
  }
}

function applyStrips(s) {
  var lane = activeLane(s)
  var wx = s.scrollX + s.x
  if (stripAt(wx, lane, "cool")) s.heat = 0
  applyBoostAt(s, wx)
}

function cpuCruiseTarget(s, cpu) {
  var target = cpu.targetSpeed
  var gap = cpu.worldX - (s.scrollX + s.x)
  if (gap < -VIEW_W * 1.5) target = Math.min(MAX_SPEED - 2, target + CPU_RUBBERBAND)
  else if (gap > VIEW_W * 1.5) target = Math.max(60, target - CPU_RUBBERBAND)
  return target
}

function cpuHazardAt(cpu, world, lane) {
  if (cpu.mudSkill >= 0.5 && stripAt(world, lane, "mud")) return true
  if (cpu.mudSkill >= 0.75 && stripAt(world, lane, "grass")) return true
  return false
}

// Do not start a merge that would put either wheel over a tall side edge
// during the lane change. Riding straight up a ramp is not a hazard.
function cpuSideHazard(cpu, to) {
  var from = activeLane(cpu)
  for (var d = 0; d <= CPU_LOOKAHEAD; d += 30) {
    var a = surfaceAt(cpu.worldX + d, from)
    var b = surfaceAt(cpu.worldX + d, to)
    var ah = a ? a.height : 0
    var bh = b ? b.height : 0
    if (Math.abs(ah - bh) > SIDE_HIT) return true
  }
  return false
}

function cpuLaneOccupied(s, cpu, to) {
  var y = LANE_Y[to]
  var playerX = s.scrollX + s.x
  if (Math.abs(s.laneY - y) < LANE_H * 0.6 && Math.abs(playerX - cpu.worldX) < CPU_RIDER_GAP) return true
  for (var i = 0; i < s.cpus.length; i++) {
    var other = s.cpus[i]
    if (other.id === cpu.id) continue
    if (Math.abs(other.laneY - y) < LANE_H * 0.6 && Math.abs(other.worldX - cpu.worldX) < CPU_RIDER_GAP) return true
  }
  return false
}

function chooseCpuLane(s, cpu) {
  if (cpu.air || cpu.laneT > 0) return -1
  var lane = activeLane(cpu)
  var ahead = cpu.worldX + CPU_LOOKAHEAD
  if (!cpuHazardAt(cpu, ahead, lane)) return -1
  var first = cpu.id % 2 === 0 ? -1 : 1
  var dirs = [first, -first]
  for (var i = 0; i < dirs.length; i++) {
    var to = lane + dirs[i]
    if (to < 0 || to >= LANES) continue
    if (cpuHazardAt(cpu, ahead, to)) continue
    if (cpuSideHazard(cpu, to)) continue
    if (cpuLaneOccupied(s, cpu, to)) continue
    return to
  }
  return -1
}

function beginCpuCrash(cpu) {
  cpu.phase = "crashed"
  cpu.crashT = 0
  cpu.speed = 0
  cpu.laneT = 0
  cpu.changing = false
  cpu.lane = cpu.laneTo
  cpu.laneFrom = cpu.lane
  cpu.laneY = LANE_Y[cpu.lane]
  cpu.tilt = 0
  clearAerial(cpu)
}

function updateCpu(s, cpu, dt) {
  cpu.changing = false
  cpu.onRumble = false
  if (cpu.phase === "crashed") {
    cpu.speed = 0
    cpu.crashT += dt
    if (cpu.crashT >= CRASH_TIME) {
      cpu.phase = "riding"
      cpu.crashT = 0
      cpu.contactT = CPU_RECOVER_GRACE
      cpu.tilt = 0
    }
    return
  }

  cpu.contactT = Math.max(0, cpu.contactT - dt)
  if (!cpu.air) {
    if (cpu.laneT > 0) {
      advanceLane(cpu, dt, false, false, false)
    } else {
      var to = chooseCpuLane(s, cpu)
      if (to >= 0) {
        cpu.laneFrom = cpu.lane
        cpu.laneTo = to
        cpu.laneT = LANE_TIME
        cpu.changing = true
      }
    }
    cpu.tilt = approach(cpu.tilt, 0, TILT_RATE * dt)
    if (cpu.boostT > 0) {
      cpu.boostT = Math.max(0, cpu.boostT - dt)
      cpu.speed = approach(cpu.speed, BOOST_SPEED, BOOST_ACCEL * dt)
    } else {
      cpu.speed = approach(cpu.speed, cpuCruiseTarget(s, cpu), ACCEL * dt)
    }
  }

  var prevWorld = cpu.worldX
  cpu.worldX += cpu.speed * WORLD_SCALE * dt
  interactTrackWorld(cpu, prevWorld, cpu.worldX, dt, true)
  if (!cpu.air) {
    applyBoostAt(cpu, cpu.worldX)
    applyTerrainAt(cpu, cpu.worldX, dt)
  }
}

function checkRiderCollisions(s) {
  if (s.phase === "crash" || s.phase === "overheat") return
  var playerX = s.scrollX + s.x
  var front = SPRITE.frontHub.x - SPRITE.rearHub.x
  for (var i = 0; i < s.cpus.length; i++) {
    var cpu = s.cpus[i]
    if (cpu.phase !== "riding") continue
    if (Math.abs(s.laneY - cpu.laneY) >= LANE_H * 0.6) continue
    if (Math.abs((s.height || 0) - (cpu.height || 0)) >= 10) continue
    var behindCpu = cpu.worldX - (playerX + front)
    if (behindCpu >= 0 && behindCpu <= CPU_REAR_OVERLAP && s.speed > cpu.speed) {
      beginCrash(s)
      return
    }
    var behindPlayer = playerX - (cpu.worldX + front)
    if (behindPlayer >= 0 && behindPlayer <= CPU_REAR_OVERLAP && cpu.speed > s.speed && cpu.contactT <= 0) beginCpuCrash(cpu)
  }
}

function updateCpus(s, dt) {
  if (!s.raceStarted) return
  for (var i = 0; i < s.cpus.length; i++) updateCpu(s, s.cpus[i], dt)
  checkRiderCollisions(s)
}

// m:ss.hh. A negative time is "no lap yet".
function formatRaceTime(t) {
  if (t == null || !(t >= 0) || t !== t) return "--:--.--"
  var cs = Math.floor(t * 100 + 1e-4)
  if (cs > 99 * 6000 + 5999) cs = 99 * 6000 + 5999
  var m = Math.floor(cs / 6000)
  var s = Math.floor(cs / 100) % 60
  var f = cs % 100
  function pad(n) { return (n < 10 ? "0" : "") + n }
  return m + ":" + pad(s) + "." + pad(f)
}

// One count per forward crossing of course x = 0. Floor of world position
// over the lap length, so sitting on the line, a crash slide, or the
// idle reset after a crash cannot tick it again.
function noteFinish(s, prevScroll, dt) {
  var prev = prevScroll + s.x
  var now = s.scrollX + s.x
  if (!(now > prev)) return
  var a = Math.floor(prev / COURSE_LEN)
  var b = Math.floor(now / COURSE_LEN)
  if (b <= a) return
  var span = now - prev
  var into = now - b * COURSE_LEN
  var frac = span > 0 ? into / span : 1
  if (frac < 0) frac = 0
  if (frac > 1) frac = 1
  var completed = s.lapTime - frac * dt
  if (completed < 0) completed = 0
  s.lastLap = completed
  s.lapTime = frac * dt
  s.lap += b - a
}

function assignPhase(s) {
  if (s.air) s.phase = "air"
  else if (s.onRumble) s.phase = "rumble"
  else if (s.onPiece != null && (s.height || 0) > 0.5) s.phase = "ramp"
  else if (s.laneT > 0) s.phase = "lane"
  else if (s.tilt < -5) s.phase = "wheelie"
  else if (s.speed > 0) s.phase = "riding"
  else s.phase = "idle"
}

function step(state, dt) {
  var s = clone(state)
  var inp = s.input
  var pressedUp = inp.up && !s.prevInput.up
  var pressedDown = inp.down && !s.prevInput.down
  var pressedCrash = inp.crash && !s.prevInput.crash
  s.prevInput = { up: inp.up, down: inp.down, crash: inp.crash }
  s.t += dt
  if (inp.throttle || inp.turbo || s.speed > 0 || s.scrollX > 0) s.raceStarted = true
  s.changing = false
  s.onRumble = false

  if (s.phase === "crash") {
    s.crashT += dt
    s.speed = approach(s.speed, 0, 300 * dt)
    if (s.crashT >= CRASH_TIME) {
      s.phase = "idle"
      s.crashT = 0
      s.tilt = 0
      s.speed = 0
      s.crashY = null
      clearAerial(s)
    }
  } else if (s.phase === "overheat") {
    // Inputs are ignored until the meter drains. 1e-4 absorbs 1/60 summation dust.
    s.overheatT += dt
    if (s.overheatT >= OVERHEAT_TIME - 1e-4) {
      recover(s)
    } else {
      s.heat = HEAT_MAX * (1 - s.overheatT / OVERHEAT_TIME)
      s.speed = approach(s.speed, 0, OVERHEAT_DECEL * dt)
      s.tilt = approach(s.tilt, 0, TILT_RATE * dt)
      advanceLane(s, dt, false, false, false)
    }
  } else if (pressedCrash) {
    beginCrash(s)
  } else if (s.air) {
    // Horizontal speed holds. Left/right rotate pitch; lane changes stay disabled.
    s.heat = Math.max(0, s.heat - AIR_COOL_RATE * dt)
    if (inp.left) s.tilt -= AIR_PITCH_RATE * dt
    if (inp.right) s.tilt += AIR_PITCH_RATE * dt
    if (s.tilt < PITCH_MIN) s.tilt = PITCH_MIN
    if (s.tilt > PITCH_MAX) s.tilt = PITCH_MAX
  } else {
    if (s.boostT > 0) {
      s.boostT = Math.max(0, s.boostT - dt)
      s.speed = approach(s.speed, BOOST_SPEED, BOOST_ACCEL * dt)
      applyHeat(s, inp, dt)
    } else {
      applyThrottle(s, inp, dt)
    }
    var target = 0
    if (s.speed > 0 && inp.left) target = WHEELIE_DEG
    else if (s.speed > 0 && inp.right) target = NOSE_DEG
    s.tilt = approach(s.tilt, target, TILT_RATE * dt)
    advanceLane(s, dt, true, pressedUp, pressedDown)
  }

  var prevScroll = s.scrollX
  s.scrollX += s.speed * WORLD_SCALE * dt
  s.lapTime += dt
  noteFinish(s, prevScroll, dt)

  if (s.phase !== "crash" && s.phase !== "overheat") {
    interactTrack(s, prevScroll, dt)
    if (s.phase !== "crash") {
      if (!s.air) {
        applyStrips(s)
        applyTerrain(s, dt)
      }
      if (s.heat >= HEAT_MAX) enterOverheat(s)
      else assignPhase(s)
    }
  }

  updateCpus(s, dt)
  updateSmoke(s, dt, s.phase === "overheat")
  s.wheelAngle += s.speed * WORLD_SCALE * dt / SPRITE.wheelR
  return s
}

// Render pose: rear-wheel contact point (x, y) plus rotation.
function pose(s) {
  if (s.phase === "crash") {
    // Tumble about the bike's centre: one and a half flips, landing upside down.
    var t = Math.min(1, s.crashT / (CRASH_TIME * 0.6))
    var ground = s.crashY == null ? s.laneY : s.crashY
    var cx = s.x - SPRITE.rearHub.x + SPRITE.w / 2 + 24 * t
    var cy = ground - SPRITE.h / 2 - Math.sin(Math.PI * t) * 30
    return { pivot: "center", x: Math.round(cx), y: Math.round(cy), angleDeg: 540 * t,
             wheelAngle: s.wheelAngle, scrollX: s.scrollX }
  }
  var lift = s.height || 0
  // Flat ground only. On a slope the rear contact is already on the face.
  // Nose-down around that contact would bury the front tire, so the rear
  // rises until the front tire is tangent to the road.
  var drop = 0
  if (!s.air && !s.onRumble && s.onPiece == null && lift <= 0.5 && s.tilt > 0) {
    drop = frontTireDrop(s.tilt)
    if (drop < 0) drop = 0
  }
  var y = Math.round(s.laneY - lift - drop)
  if (drop > 0) {
    var rad = s.tilt * Math.PI / 180
    var dx = SPRITE.frontHub.x - SPRITE.rearHub.x
    var dy = SPRITE.frontHub.y - SPRITE.h
    var bottom = y + dx * Math.sin(rad) + dy * Math.cos(rad) + SPRITE.wheelR
    if (bottom > s.laneY) y -= 1
  }
  return { pivot: "rear", x: Math.round(s.x), y: y, angleDeg: s.tilt,
           wheelAngle: s.wheelAngle, scrollX: s.scrollX }
}

if (typeof module !== "undefined") {
  module.exports = {
    TITLE: TITLE, VIEW_W: VIEW_W, VIEW_H: VIEW_H, LANES: LANES, LANE_Y: LANE_Y,
    TRACK_TOP: TRACK_TOP, LANE_H: LANE_H, SPRITE: SPRITE, BIKE_H: BIKE_H, CRASH_TIME: CRASH_TIME,
    CPU_COUNT: CPU_COUNT, LANE_TIME: LANE_TIME,
    HEAT_MAX: HEAT_MAX, HEAT_YELLOW: HEAT_YELLOW, HEAT_RED: HEAT_RED, HEAT_FLASH: HEAT_FLASH,
    OVERHEAT_TIME: OVERHEAT_TIME, MAX_SPEED: MAX_SPEED, TURBO_SPEED: TURBO_SPEED,
    WORLD_SCALE: WORLD_SCALE,
    AIR_COOL_RATE: AIR_COOL_RATE, GRAVITY: GRAVITY,
    LAND_CLEAN_TOL: LAND_CLEAN_TOL, LAND_OK_TOL: LAND_OK_TOL,
    LAND_NOSE_CRASH: LAND_NOSE_CRASH, LAND_REAR_CRASH: LAND_REAR_CRASH,
    LAND_SPEED_KEEP: LAND_SPEED_KEEP, PITCH_MIN: PITCH_MIN, WHEELIE_DEG: WHEELIE_DEG,
    NOSE_DEG: NOSE_DEG,
    ENABLE_BOOST_STRIPS: ENABLE_BOOST_STRIPS, BOOST_TIME: BOOST_TIME, BOOST_SPEED: BOOST_SPEED,
    DOWNHILL_BONUS: DOWNHILL_BONUS,
    MUD_MAX: MUD_MAX, GRASS_MAX: GRASS_MAX, SIDE_HIT: SIDE_HIT,
    RUMBLE_MAX: RUMBLE_MAX, RUMBLE_TOOTH: RUMBLE_TOOTH, RUMBLE_H: RUMBLE_H, RUMBLE_TILT: RUMBLE_TILT,
    COURSE: COURSE, COURSE_LEN: COURSE_LEN, RAMP_SPEC: RAMP_SPEC,
    initialState: initialState, setInput: setInput, step: step, pose: pose, heatBand: heatBand,
    courseFeature: courseFeature, rampHeight: rampHeight, rampSlope: rampSlope,
    surfaceAt: surfaceAt, cameraY: cameraY, formatRaceTime: formatRaceTime,
    frontTireDrop: frontTireDrop, downhillBonus: downhillBonus, rumbleSample: rumbleSample
  }
}
