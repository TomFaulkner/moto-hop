// Moto Hop game rules: hand-rolled arcade state, no physics engine.
// Pure JS (no Qt) so it loads in QML and in node tests.

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

function initialState() {
  return {
    phase: "idle", lane: 1, laneY: LANE_Y[1], x: 64,
    speed: 0, scrollX: 0, wheelAngle: 0, tilt: 0,
    heat: 0, overheatT: 0, t: 0,
    smoke: [], smokeT: 0, puffN: 0,
    crashT: 0, laneFrom: 1, laneTo: 1, laneT: 0,
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
  return { x: s.x + dx * c - dy * sn, y: s.laneY + dx * sn + dy * c }
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

function recover(s) {
  s.phase = "idle"
  s.overheatT = 0
  s.heat = 0
  s.speed = 0
  s.tilt = 0
  s.laneT = 0
  s.lane = s.laneTo
  s.laneY = LANE_Y[s.lane]
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
      s.phase = "idle"; s.crashT = 0; s.tilt = 0; s.speed = 0
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
    s.phase = "crash"; s.crashT = 0; s.laneT = 0
    s.lane = s.laneTo; s.laneY = LANE_Y[s.lane]
  } else {
    if (inp.turbo) {
      s.speed = approach(s.speed, TURBO_SPEED, TURBO_ACCEL * dt)
      s.heat = Math.min(HEAT_MAX, s.heat + HEAT_RISE * dt)
    } else if (inp.throttle) {
      s.speed = approach(s.speed, MAX_SPEED, ACCEL * dt)
      s.heat = Math.max(0, s.heat - HEAT_COOL * dt)
    } else {
      s.speed = approach(s.speed, 0, DECEL * dt)
      s.heat = Math.max(0, s.heat - HEAT_COOL_COAST * dt)
    }

    var target = 0
    if (s.speed > 0 && inp.left) target = WHEELIE_DEG
    else if (s.speed > 0 && inp.right) target = NOSE_DEG
    s.tilt = approach(s.tilt, target, TILT_RATE * dt)
    advanceLane(s, dt, true, pressedUp, pressedDown)

    if (s.heat >= HEAT_MAX) {
      s.phase = "overheat"; s.overheatT = 0; s.heat = HEAT_MAX; s.smokeT = SMOKE_EVERY
      spawnSmoke(s); spawnSmoke(s); spawnSmoke(s)
    } else if (s.laneT > 0) s.phase = "lane"
    else if (s.tilt < -5) s.phase = "wheelie"
    else if (s.speed > 0) s.phase = "riding"
    else s.phase = "idle"
  }

  updateSmoke(s, dt, s.phase === "overheat")
  s.scrollX += s.speed * dt
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
  return { pivot: "rear", x: Math.round(s.x), y: Math.round(s.laneY), angleDeg: s.tilt,
           wheelAngle: s.wheelAngle, scrollX: s.scrollX }
}

if (typeof module !== "undefined") {
  module.exports = {
    TITLE: TITLE, VIEW_W: VIEW_W, VIEW_H: VIEW_H, LANES: LANES, LANE_Y: LANE_Y,
    TRACK_TOP: TRACK_TOP, LANE_H: LANE_H, SPRITE: SPRITE, CRASH_TIME: CRASH_TIME,
    HEAT_MAX: HEAT_MAX, HEAT_YELLOW: HEAT_YELLOW, HEAT_RED: HEAT_RED, HEAT_FLASH: HEAT_FLASH,
    OVERHEAT_TIME: OVERHEAT_TIME, MAX_SPEED: MAX_SPEED, TURBO_SPEED: TURBO_SPEED,
    initialState: initialState, setInput: setInput, step: step, pose: pose, heatBand: heatBand
  }
}
