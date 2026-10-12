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
