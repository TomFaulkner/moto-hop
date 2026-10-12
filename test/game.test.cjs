const test = require("node:test")
const assert = require("node:assert/strict")
const G = require("../Game.js")

function run(s, n, input) { for (let i = 0; i < n; i++) { s = G.step(G.setInput(s, Object.assign({ up: false, down: false, left: false, right: false, throttle: false, crash: false }, input)), 1 / 60) } return s }

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

test("crash tumbles then returns to idle", () => {
  let s = run(G.initialState(), 30, { throttle: true })
  s = run(s, 1, { crash: true })
  assert.equal(s.phase, "crash")
  s = run(s, Math.ceil(G.CRASH_TIME * 60) + 2, {})
  assert.equal(s.phase, "idle")
  assert.equal(s.speed, 0)
})
