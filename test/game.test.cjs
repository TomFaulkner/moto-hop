const test = require("node:test")
const assert = require("node:assert/strict")
const G = require("../Game.js")

function run(s, n, input) {
  const base = { up: false, down: false, left: false, right: false, throttle: false, turbo: false, crash: false }
  for (let i = 0; i < n; i++) s = G.step(G.setInput(s, Object.assign({}, base, input)), 1 / 60)
  return s
}

test("throttle ramps speed and scrolls", () => {
  const s = run(G.initialState(), 60, { throttle: true })
  assert.ok(s.speed > 100 && s.speed <= 120)
  assert.equal(s.phase, "riding")
  assert.ok(s.scrollX > 0 && s.wheelAngle > 0)
})

test("lane change moves one lane and clamps", () => {
  let s = run(G.initialState(), 1, { up: true })
  s = run(s, 30, {})
  assert.equal(s.lane, 0)
  s = run(s, 1, { up: true }); s = run(s, 30, {})
  assert.equal(s.lane, 0)
  s = run(s, 1, { down: true }); s = run(s, 30, {})
  assert.equal(s.lane, 1)
  assert.equal(s.laneY, G.LANE_Y[1])
})

test("holding left at speed pops a wheelie", () => {
  let s = run(G.initialState(), 30, { throttle: true })
  s = run(s, 30, { throttle: true, left: true })
  assert.ok(s.tilt < -20)
  assert.equal(s.phase, "wheelie")
})

test("turbo raises heat and the speed cap", () => {
  const normal = run(G.initialState(), 90, { throttle: true })
  const turbo = run(G.initialState(), 90, { turbo: true })
  assert.equal(normal.heat, 0)
  assert.ok(turbo.heat > 30)
  assert.equal(G.heatBand(turbo.heat), "yellow")
  assert.ok(turbo.speed > normal.speed)
  assert.ok(turbo.speed <= G.TURBO_SPEED)
  assert.ok(normal.speed <= G.MAX_SPEED)
})

test("normal throttle cools heat", () => {
  const hot = run(G.initialState(), 90, { turbo: true })
  assert.ok(hot.heat > 30)
  const throttled = run(hot, 60, { throttle: true })
  const coast = run(hot, 60, {})
  assert.ok(throttled.heat < hot.heat)
  assert.ok(throttled.heat > 20)
  assert.ok(coast.heat < throttled.heat)
  assert.notEqual(throttled.phase, "overheat")
})

test("overheat at 100 locks input for the cooldown, then recovers", () => {
  let prev = G.initialState()
  let s = prev
  let frames = 0
  while (s.phase !== "overheat") {
    prev = s
    s = run(s, 1, { turbo: true })
    frames++
    assert.ok(frames < 1800, "turbo should reach heat 100")
  }
  assert.ok(prev.heat < G.HEAT_MAX)
  assert.equal(s.heat, G.HEAT_MAX)
  assert.equal(s.phase, "overheat")
  assert.ok(s.speed > 0)

  const lane = s.lane
  const speed = s.speed
  const lock = { throttle: true, turbo: true, up: true, down: true, left: true, right: true, crash: true }
  s = run(s, 30, lock)
  assert.equal(s.phase, "overheat")
  assert.equal(s.lane, lane)
  assert.equal(s.tilt, 0)
  assert.ok(s.speed < speed)
  assert.ok(s.heat < G.HEAT_MAX)
  assert.ok(s.smoke.length > 0)

  let guard = 0
  while (s.phase === "overheat") {
    s = run(s, 1, lock)
    guard++
    assert.ok(guard < 600, "cooldown should end")
  }
  assert.equal(s.phase, "idle")
  assert.equal(s.speed, 0)
  assert.equal(s.heat, 0)

  s = run(s, 20, { throttle: true })
  assert.equal(s.phase, "riding")
  assert.ok(s.speed > 0)
})

test("wheelie and lane change still work while turbo heats", () => {
  let s = run(G.initialState(), 20, { turbo: true })
  s = run(s, 20, { turbo: true, left: true })
  assert.equal(s.phase, "wheelie")
  assert.ok(s.tilt < -20)
  assert.ok(s.heat > 0)
  s = run(s, 1, { turbo: true, down: true })
  s = run(s, 30, { turbo: true })
  assert.equal(s.lane, 2)
  assert.equal(s.laneY, G.LANE_Y[2])
})

test("crash tumbles then returns to idle", () => {
  let s = run(G.initialState(), 30, { throttle: true })
  s = run(s, 1, { crash: true })
  assert.equal(s.phase, "crash")
  s = run(s, Math.ceil(G.CRASH_TIME * 60) + 2, {})
  assert.equal(s.phase, "idle")
  assert.equal(s.speed, 0)
})

function feature(type, size) {
  const f = G.courseFeature(type, size)
  assert.ok(f, "missing " + type + " " + size)
  return f
}

function featureWhere(pred) {
  const f = G.COURSE.find(pred)
  assert.ok(f, "no matching feature")
  return f
}

function place(worldX, speed, lane, extra) {
  const s = G.initialState()
  s.speed = speed
  s.lane = lane
  s.laneFrom = lane
  s.laneTo = lane
  s.laneT = 0
  s.laneY = G.LANE_Y[lane]
  s.scrollX = worldX - s.x
  if (extra) Object.assign(s, extra)
  return s
}

// Ride off the lip. Returns the first airborne state.
function flyOff(size, speed) {
  const ramp = feature("ramp", size)
  let s = place(ramp.x + ramp.len - 3, speed, ramp.lanes[0])
  let guard = 0
  while (!s.air && guard < 40) {
    s = run(s, 1, {})
    guard++
  }
  assert.equal(s.air, true, "expected launch from " + size + " ramp at speed " + speed)
  return s
}

function airFrames(speed) {
  let s = flyOff("large", speed)
  let n = 1
  let guard = 0
  while (s.air && guard < 500) {
    s = run(s, 1, {})
    guard++
    if (s.air) n++
  }
  return n
}

test("launch airtime scales with speed", () => {
  const slow = airFrames(60)
  const fast = airFrames(160)
  assert.ok(slow > 8, "slow air frames " + slow)
  assert.ok(fast > slow + 8, "fast " + fast + " slow " + slow)
})

test("correct-pitch landing survives", () => {
  let s = flyOff("large", 120)
  let guard = 0
  while (s.air && guard < 500) {
    s = run(s, 1, { right: s.tilt < -2, left: s.tilt > 2 })
    guard++
  }
  assert.equal(s.air, false)
  assert.notEqual(s.phase, "crash")
  assert.ok(s.speed > 80, "speed " + s.speed)
})

test("bad pitch crashes", () => {
  let s = flyOff("large", 120)
  let guard = 0
  while (s.air && guard < 500) {
    s = run(s, 1, { right: true })
    guard++
  }
  assert.equal(s.phase, "crash")
  assert.ok(s.tilt > G.LAND_NOSE_CRASH, "tilt " + s.tilt)
})

test("off-angle landing bleeds speed without a crash", () => {
  let s = flyOff("medium", 100)
  const launched = s.speed
  let guard = 0
  while (s.air && guard < 500) {
    s = run(s, 1, {})
    guard++
  }
  assert.equal(s.air, false)
  assert.notEqual(s.phase, "crash")
  assert.ok(s.speed < launched * 0.9, "speed " + s.speed + " launched " + launched)
  assert.ok(Math.abs(s.speed - launched * G.LAND_SPEED_KEEP) < 0.02, "speed " + s.speed)
})

test("cooling arrow zeroes heat", () => {
  const arrow = feature("cool")
  let s = place(arrow.x + 8, 40, arrow.lanes[0], { heat: 80 })
  s = run(s, 5, { turbo: true })
  assert.equal(s.heat, 0)
})

test("cooling arrow ignores other lanes", () => {
  const arrow = featureWhere((f) => f.type === "cool" && f.lanes.indexOf(3) < 0)
  let s = place(arrow.x + 6, 30, 3, { heat: 50 })
  s = run(s, 4, { throttle: true })
  assert.ok(s.heat > 40, "heat " + s.heat)
  assert.ok(s.heat < 50)
})

test("boost raises speed temporarily then decays", () => {
  assert.equal(G.ENABLE_BOOST_STRIPS, true)
  const strip = featureWhere((f) => f.type === "boost" && f.lanes.length === G.LANES)
  let s = place(strip.x - 4, G.MAX_SPEED, 1, { heat: 55 })
  const startHeat = s.heat
  let peak = s.speed
  let sawDecay = false
  for (let i = 0; i < 180; i++) {
    s = run(s, 1, { throttle: true })
    if (s.speed > peak) peak = s.speed
    if (peak > G.TURBO_SPEED && s.speed <= G.MAX_SPEED + 0.5 && s.speed < peak - 15) sawDecay = true
  }
  assert.ok(peak > G.TURBO_SPEED, "peak " + peak)
  assert.ok(sawDecay, "peak " + peak + " end " + s.speed)
  assert.ok(Math.abs(s.speed - G.MAX_SPEED) < 2, "end speed " + s.speed)
  assert.ok(s.heat <= startHeat, "heat " + s.heat)
  assert.notEqual(s.phase, "crash")
})

test("no lane change mid-air", () => {
  let s = flyOff("large", 120)
  const lane = s.lane
  const laneY = s.laneY
  s = run(s, 1, { up: true })
  s = run(s, 12, { up: true, down: true })
  assert.equal(s.air, true)
  assert.equal(s.lane, lane)
  assert.equal(s.laneY, laneY)
})

test("airborne slowly cools heat", () => {
  let s = flyOff("large", 120)
  s.heat = 60
  s = run(s, 30, {})
  assert.equal(s.air, true)
  assert.ok(s.heat < 60, "heat " + s.heat)
  assert.ok(s.heat > 60 - 6, "heat " + s.heat)
})

test("partial ramp does not launch other lanes", () => {
  const ramp = feature("ramp", "large")
  assert.ok(ramp.lanes.indexOf(0) < 0)
  let s = place(ramp.x - 4, 90, 0)
  s = run(s, 50, { throttle: true })
  assert.equal(s.air, false)
  assert.ok(!s.height)
  assert.notEqual(s.phase, "crash")
})
