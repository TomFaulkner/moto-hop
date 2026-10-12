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

var MAX_SPEED = 120
var ACCEL = 200
var DECEL = 150
var WHEELIE_DEG = -25
var NOSE_DEG = 12
var TILT_RATE = 120
var LANE_TIME = 0.25
var CRASH_TIME = 1.5

function initialState() {
  return {
    phase: "idle", lane: 1, laneY: LANE_Y[1], x: 64,
    speed: 0, scrollX: 0, wheelAngle: 0, tilt: 0,
    crashT: 0, laneFrom: 1, laneTo: 1, laneT: 0,
    input: { up: false, down: false, left: false, right: false, throttle: false, crash: false },
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

function step(state, dt) {
  var s = clone(state)
  var inp = s.input
  var pressedUp = inp.up && !s.prevInput.up
  var pressedDown = inp.down && !s.prevInput.down
  var pressedCrash = inp.crash && !s.prevInput.crash
  s.prevInput = { up: inp.up, down: inp.down, crash: inp.crash }

  if (s.phase === "crash") {
    s.crashT += dt
    s.speed = approach(s.speed, 0, 300 * dt)
    if (s.crashT >= CRASH_TIME) {
      s.phase = "idle"; s.crashT = 0; s.tilt = 0; s.speed = 0
    }
  } else {
    if (pressedCrash) {
      s.phase = "crash"; s.crashT = 0; s.laneT = 0
      s.lane = s.laneTo; s.laneY = LANE_Y[s.lane]
    } else {
      s.speed = inp.throttle ? approach(s.speed, MAX_SPEED, ACCEL * dt)
                             : approach(s.speed, 0, DECEL * dt)
      var target = 0
      if (s.speed > 0 && inp.left) target = WHEELIE_DEG
      else if (s.speed > 0 && inp.right) target = NOSE_DEG
      s.tilt = approach(s.tilt, target, TILT_RATE * dt)

      if (s.laneT > 0) {
        s.laneT = Math.max(0, s.laneT - dt)
        var f = 1 - s.laneT / LANE_TIME
        s.laneY = LANE_Y[s.laneFrom] + (LANE_Y[s.laneTo] - LANE_Y[s.laneFrom]) * f
        if (s.laneT === 0) { s.lane = s.laneTo; s.laneY = LANE_Y[s.lane] }
      } else if (pressedUp || pressedDown) {
        var to = Math.max(0, Math.min(LANES - 1, s.lane + (pressedUp ? -1 : 1)))
        if (to !== s.lane) { s.laneFrom = s.lane; s.laneTo = to; s.laneT = LANE_TIME }
      }

      if (s.laneT > 0) s.phase = "lane"
      else if (s.tilt < -5) s.phase = "wheelie"
      else if (s.speed > 0) s.phase = "riding"
      else s.phase = "idle"
    }
  }
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
    initialState: initialState, setInput: setInput, step: step, pose: pose
  }
}
