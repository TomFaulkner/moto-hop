// Moto Hop game rules: hand-rolled arcade state, no physics engine.
// Pure JS (no Qt) so it loads in QML and in node tests.
// Track features (ramps, cooling arrows, optional boost strips) live in COURSE.

var TITLE = "Moto Hop"
var VIEW_W = 256
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

// Tuning. Speeds are px/s on the 256-wide logical view. Heat runs 0..HEAT_MAX.
// Pitch is degrees, negative = nose up (same sign as a wheelie).
var MAX_SPEED = 120
var TURBO_SPEED = 180
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

// Air and ramps. Uphill slopes are negative so they share the wheelie sign.
var GRAVITY = 320            // px/s^2, pulls jump height back down
var AIR_PITCH_RATE = 160     // deg/s while left/right is held in the air
var PITCH_MIN = -50          // nose-up clamp
var PITCH_MAX = 46           // nose-down clamp
var AIR_COOL_RATE = 8        // heat per second while airborne (slow cool)
var LAND_CLEAN_TOL = 8       // |pitch - slope| at or under this lands clean
var LAND_OK_TOL = 16         // within this: survive with a speed penalty
var LAND_NOSE_CRASH = 12     // nose-down past this (pitch - slope) crashes
var LAND_SPEED_KEEP = 0.62   // speed kept on an off-angle but survivable landing

// Optional. When true, "boost" strips give a short burst above the current cap
// and add no heat. When false, those course entries are ignored and not drawn.
var ENABLE_BOOST_STRIPS = true
var BOOST_TIME = 1           // seconds at the raised cap
var BOOST_SPEED = 250        // above TURBO_SPEED
var BOOST_ACCEL = 700

// Ramp size picks the lip height and the launch kick. Length lives on each
// course entry so two ramps of the same size can still differ.
var RAMP_SPEC = {
  small:  { height: 10, kick: 60 },
  medium: { height: 16, kick: 100 },
  large:  { height: 22, kick: 145 }
}

// Looping course. Each entry is {type, x, len, lanes, size?}.
// x is world px along the track; features repeat every COURSE_LEN.
// Keep x >= 0 and x + len <= COURSE_LEN so nothing straddles the seam.
// type "ramp" | "cool" | "boost". Later "mud", "grass", and "finish" can use
// the same shape. The first feature sits past the distance the turbo/heat
// tests travel from a standing start.
var COURSE_LEN = 5200
var COURSE = [
  { type: "ramp",  x: 1400, len: 120, lanes: [0, 1, 2, 3], size: "small" },
  { type: "cool",  x: 1750, len: 120, lanes: [0, 1, 2, 3] },
  { type: "ramp",  x: 2200, len: 80,  lanes: [1, 2],       size: "medium" },
  { type: "boost", x: 2800, len: 140, lanes: [0, 1, 2, 3] },
  { type: "ramp",  x: 3600, len: 72,  lanes: [2, 3],       size: "large" },
  { type: "cool",  x: 4100, len: 80,  lanes: [0, 1] },
  { type: "ramp",  x: 4500, len: 80,  lanes: [0],          size: "medium" },
  { type: "boost", x: 4850, len: 48,  lanes: [3] }
]

function initialState() {
  return {
    phase: "idle", lane: 1, laneY: LANE_Y[1], x: 64,
    speed: 0, scrollX: 0, wheelAngle: 0, tilt: 0,
    heat: 0, overheatT: 0, t: 0,
    smoke: [], smokeT: 0, puffN: 0,
    crashT: 0, laneFrom: 1, laneTo: 1, laneT: 0,
    air: false, height: 0, vy: 0, onRamp: null,
    boostT: 0, boostHeld: false,
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
  return spec.height
}

function rampKick(size) {
  var spec = RAMP_SPEC[size] || RAMP_SPEC.small
  return spec.kick
}

function rampSlope(feature) {
  return -Math.atan(rampHeight(feature.size) / feature.len) * 180 / Math.PI
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
  for (var i = 0; i < feature.lanes.length; i++) {
    if (feature.lanes[i] === lane) return true
  }
  return false
}

function rampAt(world, lane) {
  var local = localX(world)
  for (var i = 0; i < COURSE.length; i++) {
    var f = COURSE[i]
    if (f.type !== "ramp" || !hasLane(f, lane)) continue
    if (local < f.x || local >= f.x + f.len) continue
    var h = rampHeight(f.size)
    var t = (local - f.x) / f.len
    return { index: i, height: h * t, slope: rampSlope(f), feature: f }
  }
  return null
}

function lipCrossed(x0, x1, lane) {
  if (!(x1 > x0)) return null
  var best = null
  var bestLip = -1e9
  var n0 = Math.floor(x0 / COURSE_LEN) - 1
  var n1 = Math.floor(x1 / COURSE_LEN) + 1
  for (var i = 0; i < COURSE.length; i++) {
    var f = COURSE[i]
    if (f.type !== "ramp" || !hasLane(f, lane)) continue
    var lipLocal = f.x + f.len
    for (var n = n0; n <= n1; n++) {
      var lip = n * COURSE_LEN + lipLocal
      if (x0 < lip && x1 >= lip && lip >= bestLip) {
        bestLip = lip
        best = f
      }
    }
  }
  return best
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

function advanceLane(s, dt, allowStart, pressedUp, pressedDown) {
  if (s.laneT > 0) {
    s.laneT = Math.max(0, s.laneT - dt)
    var f = 1 - s.laneT / LANE_TIME
    s.laneY = LANE_Y[s.laneFrom] + (LANE_Y[s.laneTo] - LANE_Y[s.laneFrom]) * f
    if (s.laneT === 0) { s.lane = s.laneTo; s.laneY = LANE_Y[s.lane] }
  } else if (allowStart && (pressedUp || pressedDown)) {
    var to = Math.max(0, Math.min(LANES - 1, s.lane + (pressedUp ? -1 : 1)))
    if (to !== s.lane) { s.laneFrom = s.lane; s.laneTo = to; s.laneT = LANE_TIME }
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
  s.onRamp = null
  s.boostT = 0
  s.boostHeld = false
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
  clearAerial(s)
}

function beginCrash(s) {
  s.phase = "crash"
  s.crashT = 0
  s.laneT = 0
  s.lane = s.laneTo
  s.laneY = LANE_Y[s.lane]
  clearAerial(s)
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
  if (inp.turbo) s.speed = approach(s.speed, TURBO_SPEED, TURBO_ACCEL * dt)
  else if (inp.throttle) s.speed = approach(s.speed, MAX_SPEED, ACCEL * dt)
  else s.speed = approach(s.speed, 0, DECEL * dt)
  applyHeat(s, inp, dt)
}

function launch(s, feature) {
  var kick = rampKick(feature.size)
  s.air = true
  s.onRamp = null
  s.height = rampHeight(feature.size)
  s.tilt = rampSlope(feature)
  s.vy = kick * (s.speed / MAX_SPEED)
  if (s.vy < 0) s.vy = 0
}

function land(s, ground) {
  var slope = ground ? ground.slope : 0
  var diff = Math.abs(s.tilt - slope)
  var noseDown = s.tilt - slope
  s.vy = 0
  s.air = false
  s.height = ground ? ground.height : 0
  s.onRamp = ground ? ground.index : null
  // Nose-down is stricter than a mirrored wheelie: too steep crashes
  // even when the absolute error is still inside LAND_OK_TOL.
  if (noseDown > LAND_NOSE_CRASH || diff > LAND_OK_TOL) {
    beginCrash(s)
    return
  }
  if (diff > LAND_CLEAN_TOL) s.speed *= LAND_SPEED_KEEP
  s.tilt = slope
}

function interactTrack(s, prevScroll, dt) {
  var lane = activeLane(s)
  var x0 = prevScroll + s.x
  var x1 = s.scrollX + s.x

  if (s.air) {
    s.vy -= GRAVITY * dt
    s.height += s.vy * dt
    var under = rampAt(x1, lane)
    var floorH = under ? under.height : 0
    if (s.vy <= 0 && s.height <= floorH) land(s, under)
    return
  }

  var ground = rampAt(x1, lane)
  if (ground) {
    s.onRamp = ground.index
    s.height = ground.height
    s.vy = 0
    s.tilt = ground.slope
    return
  }

  var lip = lipCrossed(x0, x1, lane)
  if (lip) {
    launch(s, lip)
    return
  }

  // Left the ramp sideways (lane change off a partial ramp) while still raised.
  if (s.onRamp !== null && s.height > 1) {
    s.air = true
    s.vy = 0
    s.onRamp = null
    return
  }

  s.onRamp = null
  s.height = 0
  s.vy = 0
}

function applyStrips(s) {
  var lane = activeLane(s)
  var wx = s.scrollX + s.x
  if (stripAt(wx, lane, "cool")) s.heat = 0
  if (ENABLE_BOOST_STRIPS && stripAt(wx, lane, "boost")) {
    if (!s.boostHeld) s.boostT = BOOST_TIME
    s.boostHeld = true
  } else {
    s.boostHeld = false
  }
}

function assignPhase(s) {
  if (s.air) s.phase = "air"
  else if (s.onRamp !== null) s.phase = "ramp"
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

  if (s.phase === "crash") {
    s.crashT += dt
    s.speed = approach(s.speed, 0, 300 * dt)
    if (s.crashT >= CRASH_TIME) {
      s.phase = "idle"
      s.crashT = 0
      s.tilt = 0
      s.speed = 0
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
  s.scrollX += s.speed * dt

  if (s.phase !== "crash" && s.phase !== "overheat") {
    interactTrack(s, prevScroll, dt)
    if (s.phase !== "crash") {
      if (!s.air) applyStrips(s)
      if (s.heat >= HEAT_MAX) enterOverheat(s)
      else assignPhase(s)
    }
  }

  updateSmoke(s, dt, s.phase === "overheat")
  s.wheelAngle += s.speed * dt / SPRITE.wheelR
  return s
}

// Render pose: rear-wheel contact point (x, y) plus rotation.
function pose(s) {
  if (s.phase === "crash") {
    // Tumble about the bike's centre: one and a half flips, landing upside down.
    var t = Math.min(1, s.crashT / (CRASH_TIME * 0.6))
    var cx = s.x - SPRITE.rearHub.x + SPRITE.w / 2 + 24 * t
    var cy = s.laneY - SPRITE.h / 2 - Math.sin(Math.PI * t) * 30
    return { pivot: "center", x: Math.round(cx), y: Math.round(cy), angleDeg: 540 * t,
             wheelAngle: s.wheelAngle, scrollX: s.scrollX }
  }
  var lift = s.height || 0
  return { pivot: "rear", x: Math.round(s.x), y: Math.round(s.laneY - lift), angleDeg: s.tilt,
           wheelAngle: s.wheelAngle, scrollX: s.scrollX }
}

if (typeof module !== "undefined") {
  module.exports = {
    TITLE: TITLE, VIEW_W: VIEW_W, VIEW_H: VIEW_H, LANES: LANES, LANE_Y: LANE_Y,
    TRACK_TOP: TRACK_TOP, LANE_H: LANE_H, SPRITE: SPRITE, CRASH_TIME: CRASH_TIME,
    HEAT_MAX: HEAT_MAX, HEAT_YELLOW: HEAT_YELLOW, HEAT_RED: HEAT_RED, HEAT_FLASH: HEAT_FLASH,
    OVERHEAT_TIME: OVERHEAT_TIME, MAX_SPEED: MAX_SPEED, TURBO_SPEED: TURBO_SPEED,
    AIR_COOL_RATE: AIR_COOL_RATE, GRAVITY: GRAVITY,
    LAND_CLEAN_TOL: LAND_CLEAN_TOL, LAND_OK_TOL: LAND_OK_TOL,
    LAND_NOSE_CRASH: LAND_NOSE_CRASH, LAND_SPEED_KEEP: LAND_SPEED_KEEP,
    ENABLE_BOOST_STRIPS: ENABLE_BOOST_STRIPS, BOOST_TIME: BOOST_TIME, BOOST_SPEED: BOOST_SPEED,
    COURSE: COURSE, COURSE_LEN: COURSE_LEN, RAMP_SPEC: RAMP_SPEC,
    initialState: initialState, setInput: setInput, step: step, pose: pose, heatBand: heatBand,
    courseFeature: courseFeature, rampHeight: rampHeight, rampSlope: rampSlope
  }
}
