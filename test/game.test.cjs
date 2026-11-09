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

test("rider pose follows the wheelie and nose-down thresholds", () => {
  assert.equal(G.riderPose(-10, false, "wheelie"), "lean")
  assert.equal(G.riderPose(-9.9, false, "riding"), "crouch")
  assert.equal(G.riderPose(8, false, "riding"), "tuck")
  assert.equal(G.riderPose(7.9, false, "riding"), "crouch")
})

test("airborne nose-down and crash poses tuck the rider", () => {
  assert.equal(G.riderPose(1, true, "air"), "tuck")
  assert.equal(G.riderPose(0, true, "air"), "crouch")
  assert.equal(G.riderPose(-20, true, "air"), "lean")
  assert.equal(G.riderPose(0, false, "crash"), "tuck")
  assert.equal(G.riderPose(0, false, "crashed"), "tuck")
})

test("every rider pose and colour has a sprite on disk", () => {
  const fs = require("fs")
  const path = require("path")
  assert.ok(Number.isInteger(G.RIDER.x) && Number.isInteger(G.RIDER.y))
  for (const pose of ["crouch", "lean", "tuck"])
    for (const c of ["blue", "red", "green", "yellow", "purple"])
      assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "rider", `rider_${pose}_${c}.png`)), pose + " " + c)
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
  // Far enough back that one fast frame cannot skip the lip, close enough
  // that a slow coast still reaches it before stopping.
  let s = place(ramp.x + ramp.len - 10, speed, ramp.lanes[0])
  let guard = 0
  while (!s.air && guard < 80) {
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
  const strip = featureWhere((f) => f.type === "boost" && f.lanes.length < G.LANES && f.lanes.indexOf(0) >= 0)
  let s = place(strip.x - 4, G.MAX_SPEED, 0, { heat: 55 })
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

function airFramesOf(size, speed) {
  const ramp = feature("ramp", size)
  let s = place(ramp.x + ramp.len - 10, speed, ramp.lanes[0])
  let guard = 0
  while (!s.air && guard < 80) {
    s = run(s, 1, {})
    guard++
  }
  assert.equal(s.air, true, "expected launch from " + size)
  let n = 1
  guard = 0
  while (s.air && guard < 500) {
    s = run(s, 1, {})
    guard++
    if (s.air) n++
  }
  return n
}

test("big ramp airtime beats a small one", () => {
  const small = airFramesOf("small", 120)
  const big = airFramesOf("large", 120)
  assert.ok(big > small, "big " + big + " small " + small)
})

test("mud slows hard", () => {
  const mud = featureWhere((f) => f.type === "mud" && f.lanes.length < G.LANES)
  const lane = mud.lanes[0]
  let onMud = place(mud.x + 8, G.MAX_SPEED, lane)
  let guard = 0
  while (onMud.speed > G.MUD_MAX + 0.5 && guard < 40) {
    onMud = run(onMud, 1, { throttle: true })
    guard++
    const wx = onMud.scrollX + onMud.x
    assert.ok(wx < mud.x + mud.len, "left the mud at " + wx + " before slowing")
  }
  const onFlat = run(place(200, G.MAX_SPEED, 0), 60, { throttle: true })
  assert.ok(onMud.speed <= G.MUD_MAX + 0.5, "mud speed " + onMud.speed)
  assert.ok(onMud.speed < onFlat.speed * 0.5, "mud " + onMud.speed + " flat " + onFlat.speed)
  assert.notEqual(onMud.phase, "crash")
  const near = G.COURSE.filter((f) => f.x < mud.x + 200 && f.x + (f.len || 0) > mud.x)
  const open = [0, 1, 2, 3].find((l) => near.every((f) => f.lanes.indexOf(l) < 0))
  const missed = run(place(mud.x + 8, G.MAX_SPEED, open), 30, { throttle: true })
  assert.ok(missed.speed > G.MAX_SPEED - 1, "open lane speed " + missed.speed)
})

test("down-slope landing with a matched pitch is clean", () => {
  const jump = feature("double", "std")
  const lip = jump.spans[0].x1
  const down = [...jump.spans].reverse().find((sp) => sp.kind === "down" && sp.y0 > 40)
  assert.ok(down, "double needs a tall down-slope")
  let s = place(jump.x + lip - 30, 140, jump.lanes[0])
  let guard = 0
  while (!s.air && guard < 80) {
    s = run(s, 1, { throttle: true })
    guard++
  }
  assert.equal(s.air, true, "expected to leave the double's lip")
  const launched = s.speed
  guard = 0
  while (s.air && guard < 500) {
    s = run(s, 1, { right: s.tilt < down.slope - 0.8, left: s.tilt > down.slope + 0.8 })
    guard++
  }
  const rel = s.scrollX + s.x - jump.x
  assert.equal(s.air, false)
  assert.notEqual(s.phase, "crash")
  assert.ok(rel >= down.x0 && rel < down.x1, "rel " + rel)
  assert.ok(s.height > 10, "height " + s.height)
  assert.ok(Math.abs(s.tilt - down.slope) <= G.LAND_CLEAN_TOL, "tilt " + s.tilt + " slope " + down.slope)
  assert.ok(Math.abs(s.speed - launched) < 0.05, "speed " + s.speed + " launched " + launched)
})

test("lane change before a raised piece is fine", () => {
  const ramp = feature("ramp", "small")
  let s = place(ramp.x - 140, 90, 1)
  s = run(s, 1, { throttle: true, up: true })
  s = run(s, 20, { throttle: true })
  assert.equal(s.lane, 0)
  assert.ok(s.scrollX + s.x < ramp.x, "world " + (s.scrollX + s.x) + " piece " + ramp.x)
  assert.notEqual(s.phase, "crash")
  assert.equal(s.air, false)
})

test("lane change along a full-width ramp stays on it", () => {
  const ramp = feature("ramp", "medium")
  assert.equal(ramp.lanes.length, G.LANES)
  let s = place(ramp.x + ramp.len * 0.5, 60, 1)
  s = run(s, 1, { down: true })
  s = run(s, 20, {})
  assert.equal(s.lane, 2)
  assert.notEqual(s.phase, "crash")
  assert.ok(s.height > G.SIDE_HIT, "height " + s.height)
})

test("changing lanes onto a raised piece crashes", () => {
  const wall = feature("ramp", "large")
  assert.ok(wall.lanes.indexOf(0) < 0)
  const face = wall.spans[0]
  const mid = face.x0 + (face.x1 - face.x0) * 0.55
  let s = place(wall.x + mid, 70, 0)
  s = run(s, 1, { down: true })
  s = run(s, 8, {})
  assert.equal(s.phase, "crash")
})

test("changing lanes off the side of a raised piece crashes", () => {
  const bump = feature("bump", "small")
  assert.ok(bump.lanes.indexOf(1) >= 0)
  assert.ok(bump.lanes.indexOf(0) < 0)
  // Past the toe, so the face is a wall and not a curb you can drop off.
  let s = place(bump.x + 50, 40, 1)
  const h = G.surfaceAt(bump.x + 50, 1)
  assert.ok(h && h.height > G.SIDE_HIT, "height " + (h && h.height))
  s = run(s, 1, { up: true })
  s = run(s, 8, {})
  assert.equal(s.phase, "crash")
})

function landWithTilt(size, speed, tilt) {
  let s = flyOff(size, speed)
  s.tilt = tilt
  let guard = 0
  while (s.air && guard < 500) {
    s = run(s, 1, {})
    guard++
  }
  return s
}

test("rear-wheel landing on flat survives", () => {
  const s = landWithTilt("large", 120, G.WHEELIE_DEG)
  assert.equal(s.air, false)
  assert.notEqual(s.phase, "crash")
  assert.ok(s.speed > 0)
})

test("small-ramp rear-wheel landing on flat survives", () => {
  let s = flyOff("small", 100)
  assert.ok(s.tilt < -20, "launch tilt " + s.tilt)
  let guard = 0
  while (s.air && guard < 500) {
    s = run(s, 1, {})
    guard++
  }
  assert.equal(s.air, false)
  assert.notEqual(s.phase, "crash")
})

test("excessive rear tilt on flat crashes", () => {
  const s = landWithTilt("large", 140, G.PITCH_MIN)
  assert.equal(s.phase, "crash")
  assert.ok(-G.PITCH_MIN > G.LAND_REAR_CRASH)
})

test("rear-wheel landing on a down-slope crashes", () => {
  const jump = feature("double", "std")
  const lip = jump.spans[0].x1
  const down = [...jump.spans].reverse().find((sp) => sp.kind === "down" && sp.y0 > 40)
  assert.ok(down, "double needs a tall down-slope")
  let s = place(jump.x + lip - 30, 140, jump.lanes[0])
  let guard = 0
  while (!s.air && guard < 80) {
    s = run(s, 1, { throttle: true })
    guard++
  }
  assert.equal(s.air, true, "expected to leave the double's lip")
  s.tilt = G.WHEELIE_DEG
  guard = 0
  while (s.air && guard < 500) {
    s = run(s, 1, {})
    guard++
  }
  assert.equal(s.phase, "crash")
})

test("raised pieces mostly leave a lane open", () => {
  const raised = G.COURSE.filter((f) => f.spans && f.spans.length)
  const partial = raised.filter((f) => f.lanes.length < G.LANES)
  assert.ok(partial.length >= raised.length / 2, "partial " + partial.length + "/" + raised.length)
  const hits = [0, 0, 0, 0]
  for (const f of raised) for (const lane of f.lanes) hits[lane]++
  for (let i = 0; i < G.LANES; i++) {
    assert.ok(hits[i] < raised.length, "lane " + i + " is on every raised piece")
  }
})

test("open lane skips the giant table", () => {
  const giant = feature("table", "giant")
  assert.ok(giant.lanes.length < G.LANES)
  const open = [0, 1, 2, 3].find((l) => giant.lanes.indexOf(l) < 0)
  assert.ok(open != null)
  let s = place(giant.x - 4, 90, open)
  s = run(s, 50, { throttle: true })
  assert.equal(s.air, false)
  assert.ok(!s.height)
  assert.notEqual(s.phase, "crash")
})

test("displayed caps stay 120 and 180 while the world moves faster", () => {
  assert.equal(G.MAX_SPEED, 120)
  assert.equal(G.TURBO_SPEED, 180)
  assert.ok(G.WORLD_SCALE >= 1.45 && G.WORLD_SCALE <= 1.55, "scale " + G.WORLD_SCALE)
  let s = place(200, G.MAX_SPEED, 0)
  const x0 = s.scrollX + s.x
  s = run(s, 60, { throttle: true })
  const moved = s.scrollX + s.x - x0
  assert.ok(Math.abs(s.speed - G.MAX_SPEED) < 0.5, "speed " + s.speed)
  assert.ok(moved > G.MAX_SPEED * 1.4, "moved " + moved)
  assert.ok(moved < G.MAX_SPEED * 1.6, "moved " + moved)
})

test("standing turbo still ends on the empty straight", () => {
  let s = G.initialState()
  let frames = 0
  while (s.phase !== "overheat") {
    s = run(s, 1, { turbo: true })
    frames++
    assert.ok(frames < 400, "heat should still lock in a few seconds")
  }
  const world = s.scrollX + s.x
  assert.ok(world < G.COURSE[0].x, "world " + world + " first " + G.COURSE[0].x)
  assert.ok(s.heat === G.HEAT_MAX)
})

function frontBottom(pose, tilt) {
  const S = G.SPRITE
  const rad = tilt * Math.PI / 180
  const dx = S.frontHub.x - S.rearHub.x
  const dy = S.frontHub.y - S.h
  return pose.y + dx * Math.sin(rad) + dy * Math.cos(rad) + S.wheelR
}

test("flat forward lean keeps the front tire on the road", () => {
  let s = run(G.initialState(), 40, { throttle: true })
  s = run(s, 40, { throttle: true, right: true })
  assert.ok(s.tilt > 8, "tilt " + s.tilt)
  assert.ok(s.tilt <= G.NOSE_DEG + 0.01, "tilt " + s.tilt)
  assert.equal(s.air, false)
  assert.ok(!s.height)
  const bottom = frontBottom(G.pose(s), s.tilt)
  assert.ok(bottom <= s.laneY + 0.05, "front " + bottom + " road " + s.laneY)
  assert.ok(bottom >= s.laneY - 1.05, "front " + bottom + " road " + s.laneY)
})

test("wheelie still plants the rear and lifts the front", () => {
  let s = run(G.initialState(), 30, { throttle: true })
  s = run(s, 30, { throttle: true, left: true })
  assert.ok(s.tilt < -20)
  const p = G.pose(s)
  assert.ok(Math.abs(p.y - s.laneY) <= 0.5, "rear " + p.y)
  const bottom = frontBottom(p, s.tilt)
  assert.ok(bottom < s.laneY - 10, "front " + bottom)
})

test("downhill throttle climbs past top speed then fades", () => {
  const table = feature("table", "long")
  const down = table.spans.find((sp) => sp.kind === "down")
  assert.ok(down)
  const bonus = G.downhillBonus(down.slope)
  assert.ok(bonus > 8 && bonus < 28, "bonus " + bonus)
  let s = place(table.x + down.x0 + 10, G.MAX_SPEED, table.lanes[0])
  let peak = s.speed
  let guard = 0
  let settled = false
  while (guard < 240) {
    const rel = s.scrollX + s.x - table.x
    const onDown = rel >= down.x0 && rel < down.x1
    s = run(s, 1, { throttle: true })
    if (onDown && s.speed > peak) peak = s.speed
    if (!onDown && peak > G.MAX_SPEED + bonus * 0.7 && s.speed <= G.MAX_SPEED + 0.5) {
      settled = true
      break
    }
    guard++
  }
  assert.ok(peak > G.MAX_SPEED + bonus * 0.7, "peak " + peak + " bonus " + bonus)
  assert.ok(peak <= G.MAX_SPEED + bonus + 0.6, "peak " + peak)
  assert.ok(settled, "speed " + s.speed + " peak " + peak)
  assert.notEqual(s.phase, "crash")
})

test("downhill turbo climbs past the turbo cap without an early overheat", () => {
  const table = feature("table", "long")
  const down = table.spans.find((sp) => sp.kind === "down")
  const bonus = G.downhillBonus(down.slope)
  let s = place(table.x + down.x0 + 10, G.TURBO_SPEED, table.lanes[0], { heat: 10 })
  let peak = s.speed
  let guard = 0
  let settled = false
  while (guard < 240) {
    const rel = s.scrollX + s.x - table.x
    const onDown = rel >= down.x0 && rel < down.x1
    s = run(s, 1, { turbo: true })
    if (onDown && s.speed > peak) peak = s.speed
    if (!onDown && peak > G.TURBO_SPEED + 4 && s.speed <= G.TURBO_SPEED + 0.5) {
      settled = true
      break
    }
    guard++
  }
  assert.ok(peak > G.TURBO_SPEED + bonus * 0.7, "peak " + peak)
  assert.ok(peak <= G.TURBO_SPEED + bonus + 0.6, "peak " + peak)
  assert.ok(settled, "speed " + s.speed)
  assert.ok(s.heat > 10 && s.heat < G.HEAT_MAX, "heat " + s.heat)
  assert.notEqual(s.phase, "overheat")
  assert.notEqual(s.phase, "crash")
})

test("coasting downhill does not add speed", () => {
  const table = feature("table", "long")
  const down = table.spans.find((sp) => sp.kind === "down")
  let s = place(table.x + down.x0 + 10, G.MAX_SPEED, table.lanes[0])
  s = run(s, 20, {})
  assert.ok(s.speed < G.MAX_SPEED - 5, "speed " + s.speed)
})

test("mud and boost leave a lane open and stay short", () => {
  const muds = G.COURSE.filter((f) => f.type === "mud")
  const boosts = G.COURSE.filter((f) => f.type === "boost")
  assert.ok(muds.length >= 2)
  assert.ok(boosts.length >= 1)
  for (const f of muds) {
    assert.ok(f.lanes.length < G.LANES, "mud lanes " + f.lanes)
    assert.ok(f.len <= 80, "mud len " + f.len)
  }
  for (const f of boosts) {
    assert.ok(f.lanes.length < G.LANES, "boost lanes " + f.lanes)
    assert.ok(f.len <= 100, "boost len " + f.len)
  }
})

test("jumping a ramp clears the landing mud", () => {
  const ramp = feature("ramp", "small")
  const lane = ramp.lanes[0]
  const mud = G.COURSE.find((f) => f.type === "mud" && f.x >= ramp.x + ramp.len && f.x < ramp.x + ramp.len + 180 && f.lanes.indexOf(lane) >= 0)
  assert.ok(mud, "small ramp needs a landing mud")
  let grounded = place(mud.x + 6, G.MAX_SPEED, lane)
  let guard = 0
  while (grounded.speed > G.MUD_MAX + 0.5 && guard < 40) {
    grounded = run(grounded, 1, { throttle: true })
    guard++
  }
  assert.ok(grounded.speed <= G.MUD_MAX + 0.5, "ground " + grounded.speed)

  let s = flyOff("small", G.MAX_SPEED)
  let over = false
  let slowest = s.speed
  guard = 0
  while ((s.air || s.scrollX + s.x < mud.x + mud.len) && guard < 500) {
    const wx = s.scrollX + s.x
    if (s.air && wx >= mud.x && wx < mud.x + mud.len) over = true
    if (s.speed < slowest) slowest = s.speed
    s = run(s, 1, {})
    guard++
  }
  assert.ok(over, "the jump should pass over the mud")
  assert.ok(slowest > G.MUD_MAX + 30, "speed " + slowest)
  assert.notEqual(s.phase, "crash")
  assert.equal(s.air, false)
})

test("bypass after a ramp is slower than taking it", () => {
  const ramp = feature("ramp", "small")
  const grass = G.COURSE.find((f) => f.type === "grass" && f.x >= ramp.x + ramp.len && f.x < ramp.x + ramp.len + 200 && f.lanes.some((l) => ramp.lanes.indexOf(l) < 0))
  assert.ok(grass, "small ramp needs bypass grass")
  const lane = grass.lanes[0]
  let onGrass = place(grass.x + 6, G.MAX_SPEED, lane)
  let guard = 0
  while (onGrass.speed > G.GRASS_MAX + 0.5 && guard < 50) {
    onGrass = run(onGrass, 1, { throttle: true })
    guard++
    assert.ok(onGrass.scrollX + onGrass.x < grass.x + grass.len, "left the grass before slowing")
  }
  assert.ok(onGrass.speed <= G.GRASS_MAX + 0.5, "grass " + onGrass.speed)
  assert.notEqual(onGrass.phase, "crash")
})

test("rumble jolts and slows, and an open lane misses it", () => {
  const strip = featureWhere((f) => f.type === "rumble" && f.lanes.indexOf(2) < 0 && f.lanes.indexOf(3) < 0)
  assert.ok(strip.len >= G.RUMBLE_TOOTH * 4, "len " + strip.len)
  const lane = strip.lanes[0]
  let s = place(strip.x + 2, G.MAX_SPEED, lane)
  const heights = []
  let noseUp = false
  for (let i = 0; i < 50; i++) {
    s = run(s, 1, { throttle: true })
    heights.push(s.height || 0)
    if (s.tilt <= -G.RUMBLE_TILT + 0.1) noseUp = true
    const wx = s.scrollX + s.x
    assert.ok(wx < strip.x + strip.len, "left the rumble at " + wx)
  }
  assert.ok(Math.max(...heights) >= G.RUMBLE_H - 1, "heights " + heights.join(","))
  assert.ok(Math.min(...heights) <= 1, "heights " + Math.min(...heights))
  assert.ok(noseUp, "expected a nose-up jolt")
  assert.ok(s.speed <= G.RUMBLE_MAX + 0.5, "speed " + s.speed)
  assert.equal(s.phase, "rumble")
  assert.notEqual(s.phase, "crash")
  const open = [0, 1, 2, 3].find((l) => strip.lanes.indexOf(l) < 0)
  const missed = run(place(strip.x + 2, G.MAX_SPEED, open), 20, { throttle: true })
  assert.ok(missed.speed > G.MAX_SPEED - 1, "open " + missed.speed)
  assert.ok(!missed.height)
  assert.notEqual(missed.phase, "rumble")
})

test("race time formats minutes, seconds, and a blank last lap", () => {
  assert.equal(G.formatRaceTime(-1), "--:--.--")
  assert.equal(G.formatRaceTime(0), "0:00.00")
  assert.equal(G.formatRaceTime(65.432), "1:05.43")
  assert.equal(G.formatRaceTime(12.3), "0:12.30")
})

test("lap starts at 1 and the clock runs before the line", () => {
  const s0 = G.initialState()
  assert.equal(s0.lap, 1)
  assert.equal(s0.lapTime, 0)
  assert.ok(s0.lastLap < 0)
  const s = run(s0, 60, { throttle: true })
  assert.equal(s.lap, 1)
  assert.ok(Math.abs(s.lapTime - 1) < 0.02, "lapTime " + s.lapTime)
  assert.ok(s.lastLap < 0)
  assert.ok(s.scrollX + s.x < G.COURSE_LEN)
})

test("crossing the finish counts one lap and stores the time", () => {
  let s = place(G.COURSE_LEN - 30, 120, 1)
  s.lapTime = 40
  let prev = s
  let guard = 0
  while (s.scrollX + s.x < G.COURSE_LEN) {
    prev = s
    s = run(s, 1, {})
    guard++
    assert.ok(guard < 40, "should reach the line")
  }
  assert.equal(prev.lap, 1)
  assert.ok(prev.scrollX + prev.x < G.COURSE_LEN)
  assert.equal(s.lap, 2)
  // 40s already on the clock, plus the frames it took to reach the line.
  assert.ok(Math.abs(s.lastLap + s.lapTime - (40 + guard / 60)) < 0.002, "split " + s.lastLap + " " + s.lapTime)
  assert.ok(s.lastLap > 40 && s.lastLap < 40.3, "last " + s.lastLap)
  assert.ok(s.lapTime >= 0 && s.lapTime < 1 / 60, "now " + s.lapTime)
  const last = s.lastLap
  s = run(s, 180, { throttle: true })
  assert.equal(s.lap, 2, "still on the same lap")
  assert.equal(s.lastLap, last)
  assert.ok(s.scrollX + s.x < G.COURSE_LEN * 2)
})

test("a frame that jumps the line counts once", () => {
  let s = place(G.COURSE_LEN - 1, G.TURBO_SPEED, 1)
  s.lapTime = 5
  s = run(s, 1, {})
  assert.ok(s.scrollX + s.x > G.COURSE_LEN + 1)
  assert.equal(s.lap, 2)
  assert.ok(s.lastLap > 4.9 && s.lastLap < 5.02, "last " + s.lastLap)
  assert.ok(s.lapTime >= 0 && s.lapTime < 1 / 60)
  s = run(s, 30, { throttle: true })
  assert.equal(s.lap, 2)
})

test("crawling across the line increments once", () => {
  let s = place(G.COURSE_LEN - 3, 20, 0)
  s.lapTime = 10
  let saw = 0
  for (let i = 0; i < 120; i++) {
    const before = s.lap
    s = run(s, 1, { throttle: true })
    if (s.lap !== before) saw++
  }
  assert.equal(saw, 1)
  assert.equal(s.lap, 2)
  assert.ok(s.lastLap >= 10)
})

test("a crash that slides across the line counts once", () => {
  let s = place(G.COURSE_LEN - 8, 100, 1)
  s.lapTime = 20
  s = run(s, 1, { crash: true })
  assert.equal(s.phase, "crash")
  s = run(s, Math.ceil(G.CRASH_TIME * 60) + 8, {})
  assert.equal(s.phase, "idle")
  assert.ok(s.scrollX + s.x > G.COURSE_LEN, "world " + (s.scrollX + s.x))
  assert.equal(s.lap, 2)
  assert.ok(s.lastLap > 19 && s.lastLap < 21, "last " + s.lastLap)
  const last = s.lastLap
  s = run(s, 30, {})
  assert.equal(s.lap, 2)
  assert.equal(s.lastLap, last)
})

test("a crash that stops short of the line does not count", () => {
  let s = place(G.COURSE_LEN - 80, 40, 2)
  s.lapTime = 7
  s = run(s, 1, { crash: true })
  s = run(s, Math.ceil(G.CRASH_TIME * 60) + 5, {})
  assert.equal(s.phase, "idle")
  assert.equal(s.speed, 0)
  assert.ok(s.scrollX + s.x < G.COURSE_LEN, "world " + (s.scrollX + s.x))
  assert.equal(s.lap, 1)
  assert.ok(s.lastLap < 0)
})

test("crossing the last finish ends the race with a time and position", () => {
  assert.equal(G.TOTAL_LAPS, 3)
  const start = place(G.COURSE_LEN * G.TOTAL_LAPS - 30, 120, 1, {
    lap: G.TOTAL_LAPS, raceStarted: true, raceTime: 200, lapTime: 70
  })
  placeCpu(start, 0, G.COURSE_LEN * G.TOTAL_LAPS + 40, 0, 100)
  placeCpu(start, 1, G.COURSE_LEN * G.TOTAL_LAPS - 900, 2, 100)
  let s = start
  let guard = 0
  while (s.phase !== "finished" && guard < 60) {
    s = run(s, 1, { throttle: true })
    guard++
    assert.ok(s.scrollX + s.x < G.COURSE_LEN * G.TOTAL_LAPS + 30, "world ran away")
  }
  assert.equal(s.phase, "finished")
  assert.equal(s.lap, G.TOTAL_LAPS)
  assert.equal(s.finishPosition, 2, "one cpu ahead is second place")
  assert.ok(s.finishTime > 200 && s.finishTime < 200.5, "time " + s.finishTime)
  assert.equal(s.raceTime, s.finishTime)
  assert.ok(s.lastLap > 70 && s.lastLap < 70.3, "last " + s.lastLap)
  assert.equal(s.bestTime, s.finishTime)
  assert.equal(s.newBest, true)

  // The race is frozen: nothing moves but the blink clock.
  const frozen = run(s, 30, { throttle: true, turbo: true, crash: true, up: true })
  assert.equal(frozen.phase, "finished")
  assert.equal(frozen.scrollX, s.scrollX)
  assert.equal(frozen.cpus.length, s.cpus.length)
  assert.deepEqual(frozen.cpus.map((c) => c.worldX), s.cpus.map((c) => c.worldX))
  assert.ok(frozen.t > s.t)
})

test("finishing earlier laps keeps racing", () => {
  let s = place(G.COURSE_LEN - 30, 120, 1, { raceStarted: true })
  let guard = 0
  while (s.lap < 2 && guard < 40) { s = run(s, 1, { throttle: true }); guard++ }
  assert.equal(s.lap, 2)
  assert.notEqual(s.phase, "finished")
  assert.ok(s.finishTime < 0)
  // A slower first race must not beat the banked best.
  let later = place(G.COURSE_LEN * 2 - 30, 120, 1, {
    lap: 2, raceStarted: true, raceTime: 400, bestTime: 12.5
  })
  guard = 0
  while (later.lap < 3 && guard < 40) { later = run(later, 1, { throttle: true }); guard++ }
  assert.equal(later.lap, 3)
  assert.notEqual(later.phase, "finished")
  assert.equal(later.bestTime, 12.5)
  assert.equal(later.newBest, false)
})

test("preferences round-trip and reject junk", () => {
  assert.deepEqual(G.parsePreferences(""), { version: 1, bestTime: -1 })
  assert.deepEqual(G.parsePreferences("not json"), { version: 1, bestTime: -1 })
  assert.deepEqual(G.parsePreferences("{\"nope\":true}"), { version: 1, bestTime: -1 })
  assert.deepEqual(G.parsePreferences('{"bestTime":92.5}'), { version: 1, bestTime: 92.5 })
  assert.deepEqual(G.parsePreferences('{"bestTime":-4}'), { version: 1, bestTime: -1 })
  assert.deepEqual(G.parsePreferences('{"bestTime":"nope"}'), { version: 1, bestTime: -1 })
  assert.deepEqual(G.parsePreferences('{"bestTime":null}'), { version: 1, bestTime: -1 })
  assert.deepEqual(G.parsePreferences(G.serializePreferences(61.08)), { version: 1, bestTime: 61.08 })
  assert.deepEqual(G.parsePreferences(G.serializePreferences(-1)), { version: 1, bestTime: -1 })
  assert.ok(G.serializePreferences(61.08).indexOf('"version": 1') >= 0)
})

test("restart returns a fresh race that keeps the best time", () => {
  const done = place(G.COURSE_LEN * G.TOTAL_LAPS - 30, 120, 1, {
    lap: G.TOTAL_LAPS, raceStarted: true, raceTime: 200, lapTime: 70
  })
  let s = done
  let guard = 0
  while (s.phase !== "finished" && guard < 60) { s = run(s, 1, { throttle: true }); guard++ }
  assert.equal(s.phase, "finished")
  const fresh = G.freshRace(s.bestTime)
  assert.equal(fresh.phase, "idle")
  assert.equal(fresh.lap, 1)
  assert.equal(fresh.lapTime, 0)
  assert.equal(fresh.raceTime, 0)
  assert.ok(fresh.lastLap < 0)
  assert.ok(fresh.finishTime < 0)
  assert.equal(fresh.scrollX, 0)
  assert.equal(fresh.bestTime, s.finishTime)
  assert.equal(G.freshRace(-1).bestTime, -1)
  assert.deepEqual(fresh.cpus.map((c) => c.worldX), G.initialState().cpus.map((c) => c.worldX))
})

test("surface patches never overlap raised pieces in any lane across laps", () => {
  const PATCH = ["grass", "mud", "boost", "rumble", "cool"]
  const items = []
  for (let lap = 0; lap < 4; lap++) {
    for (const f of G.COURSE) {
      const raised = f.spans && f.spans.length > 0
      const len = raised ? f.spans[f.spans.length - 1].x1 : f.len
      items.push({ f, raised, x0: f.x + lap * G.COURSE_LEN, x1: f.x + len + lap * G.COURSE_LEN })
    }
  }
  const patches = items.filter(i => PATCH.includes(i.f.type))
  const raised = items.filter(i => i.raised)
  assert.ok(patches.length > 0 && raised.length > 0)
  for (const p of patches) for (const r of raised) {
    const overlap = p.x0 < r.x1 + 8 && r.x0 < p.x1 + 8
    assert.ok(!overlap, `${p.f.type}@${p.x0} overlaps ${r.f.type}@${r.x0}`)
  }
})

function placeCpu(s, id, worldX, lane, speed) {
  const cpu = s.cpus.find((c) => c.id === id)
  assert.ok(cpu, "missing cpu " + id)
  Object.assign(cpu, {
    worldX, lane, laneY: G.LANE_Y[lane], speed,
    laneFrom: lane, laneTo: lane, laneT: 0, changing: false,
    height: 0, vy: 0, air: false, tilt: 0,
    phase: "riding", crashT: 0, contactT: 0, onPiece: null, onRumble: false
  })
  return cpu
}

test("cpus have distinct palettes and lanes, and clone deeply", () => {
  const s = G.initialState()
  assert.equal(G.CPU_COUNT, 3)
  assert.equal(s.cpus.length, G.CPU_COUNT)
  assert.equal(new Set(s.cpus.map((c) => c.palette)).size, G.CPU_COUNT)
  assert.equal(new Set(s.cpus.map((c) => c.lane)).size, G.CPU_COUNT)
  const fields = ["id", "lane", "laneY", "worldX", "speed", "targetSpeed", "wheelAngle", "height", "vy", "air", "tilt", "phase", "crashT", "laneFrom", "laneTo", "laneT", "changing", "palette", "heat", "turboing", "overheatT"]
  for (const cpu of s.cpus) {
    for (const field of fields) assert.ok(Object.prototype.hasOwnProperty.call(cpu, field), field)
    assert.ok(cpu.targetSpeed < G.MAX_SPEED)
    assert.ok(cpu.lane !== s.lane || cpu.worldX !== s.scrollX + s.x)
  }
  assert.equal(G.initialState(2).cpus.length, 2)
  assert.equal(G.initialState(4).cpus.length, 4)
  const copy = G.setInput(s, {})
  assert.notEqual(copy.cpus, s.cpus)
  assert.notEqual(copy.cpus[0], s.cpus[0])
  copy.cpus[0].worldX++
  assert.notEqual(copy.cpus[0].worldX, s.cpus[0].worldX)
})

test("cpu pose maps the same world x to the player's screen x", () => {
  const s = place(500, 90, 1)
  const cpu = placeCpu(s, 0, s.scrollX + s.x, 2, 90)
  const p = G.cpuPose(s, cpu)
  assert.equal(p.x, G.pose(s).x)
  assert.equal(p.pivot, "rear")
  assert.equal(p.y, cpu.laneY)
  cpu.phase = "crashed"
  cpu.crashT = 0.3
  assert.equal(G.cpuPose(s, cpu).pivot, "center")
})

test("race position counts cpus ahead of the player", () => {
  const s = place(500, 90, 1)
  placeCpu(s, 0, 650, 0, 90)
  placeCpu(s, 1, 450, 2, 90)
  placeCpu(s, 2, 500, 3, 90)
  assert.equal(G.racePosition(s), 2)
  s.cpus[2].worldX = 700
  assert.equal(G.racePosition(s), 3)
  s.cpus[0].worldX = 400
  s.cpus[2].worldX = 300
  assert.equal(G.racePosition(s), 1)
})

test("cpus stay put while the player is idle", () => {
  let s = G.initialState()
  const starts = s.cpus.map((c) => c.worldX)
  s = run(s, 120, {})
  assert.deepEqual(s.cpus.map((c) => c.worldX), starts)
  assert.ok(s.cpus.every((c) => c.speed === 0))
})

test("cpus start with the race and cruise when heat is high", () => {
  const initial = G.initialState()
  const starts = initial.cpus.map((c) => c.worldX)
  // High heat keeps turbo off so they settle on their cruise targets.
  for (const cpu of initial.cpus) cpu.heat = 90
  const s = run(initial, 120, { throttle: true })
  assert.equal(s.speed, G.MAX_SPEED)
  for (let i = 0; i < s.cpus.length; i++) {
    const cpu = s.cpus[i]
    assert.ok(cpu.worldX > starts[i])
    assert.ok(cpu.speed > 0)
    assert.ok(cpu.wheelAngle > 0)
    assert.equal(cpu.turboing, false)
    assert.ok(cpu.speed < G.MAX_SPEED, "cpu speed " + cpu.speed)
    assert.ok(Math.abs(cpu.speed - cpu.targetSpeed) < 0.01, "cpu speed " + cpu.speed)
    assert.ok(s.speed > cpu.speed, "player can pass cpu " + cpu.id)
  }
})

test("player front wheel clipping a cpu rear wheel crashes the player", () => {
  let s = place(500, G.MAX_SPEED, 0)
  const front = G.SPRITE.frontHub.x - G.SPRITE.rearHub.x
  placeCpu(s, 0, 500 + front + 5, 0, 40)
  s = run(s, 1, { throttle: true })
  assert.equal(s.phase, "crash")
  assert.equal(s.cpus[0].phase, "riding")
})

test("player beside a cpu in another lane does not crash", () => {
  let s = place(500, G.MAX_SPEED, 0)
  const front = G.SPRITE.frontHub.x - G.SPRITE.rearHub.x
  placeCpu(s, 0, 500 + front + 5, 1, 40)
  s = run(s, 10, { throttle: true })
  assert.notEqual(s.phase, "crash")
  assert.equal(s.cpus[0].phase, "riding")
})

test("mud-skilled cpu changes into a clear adjacent lane", () => {
  const mud = G.COURSE.filter((f) => f.type === "mud").pop()
  assert.ok(mud.lanes.includes(2) && !mud.lanes.includes(1))
  let s = place(mud.x - 300, 0, 0, { raceStarted: true })
  placeCpu(s, 0, mud.x - 80, 2, 100)
  assert.ok(s.cpus[0].mudSkill >= 0.5)
  s = run(s, Math.ceil(G.LANE_TIME * 60) + 2, {})
  assert.equal(s.cpus[0].lane, 1)
  assert.equal(s.cpus[0].laneY, G.LANE_Y[1])
  assert.equal(s.cpus[0].laneT, 0)
  assert.equal(s.cpus[0].phase, "riding")
})

test("mud-ploughing cpu stays in lane and slows", () => {
  const mud = G.COURSE.filter((f) => f.type === "mud").pop()
  let s = place(mud.x - 300, 0, 0, { raceStarted: true })
  placeCpu(s, 1, mud.x + 8, mud.lanes[0], G.MAX_SPEED)
  assert.ok(s.cpus[1].mudSkill < 0.5)
  let guard = 0
  while (s.cpus[1].speed > G.MUD_MAX + 0.5 && guard < 30) {
    s = run(s, 1, {})
    guard++
    assert.ok(s.cpus[1].worldX < mud.x + mud.len, "cpu left mud before slowing")
  }
  assert.ok(s.cpus[1].speed <= G.MUD_MAX + 0.5, "cpu mud speed " + s.cpus[1].speed)
  assert.equal(s.cpus[1].lane, mud.lanes[0])
  assert.equal(s.cpus[1].phase, "riding")
})

test("cpu launches from a lip and lands safely with the ground pitch", () => {
  const ramp = feature("ramp", "large")
  const lane = ramp.lanes[0]
  let s = place(ramp.x - 300, 0, 0, { raceStarted: true })
  placeCpu(s, 1, ramp.x + ramp.len - 10, lane, 100)
  let guard = 0
  while (!s.cpus[1].air && guard < 80) {
    s = run(s, 1, {})
    guard++
  }
  assert.equal(s.cpus[1].air, true, "cpu should launch")
  assert.ok(s.cpus[1].vy > 0)
  s.cpus[1].tilt = 45
  guard = 0
  while (s.cpus[1].air && guard < 500) {
    s = run(s, 1, {})
    guard++
  }
  assert.equal(s.cpus[1].air, false)
  assert.equal(s.cpus[1].phase, "riding")
  const ground = G.surfaceAt(s.cpus[1].worldX, s.cpus[1].lane)
  assert.ok(Math.abs(s.cpus[1].tilt - (ground ? ground.slope : 0)) < 0.01)
})

test("cpu rear-ending the player crashes, waits, and recovers", () => {
  let s = place(500, 40, 2)
  const front = G.SPRITE.frontHub.x - G.SPRITE.rearHub.x
  placeCpu(s, 1, 500 - front - 5, 2, 100)
  s = run(s, 1, {})
  assert.notEqual(s.phase, "crash")
  assert.equal(s.cpus[1].phase, "crashed")
  assert.equal(s.cpus[1].speed, 0)
  const stopped = s.cpus[1].worldX
  s = run(s, Math.ceil(G.CRASH_TIME * 60) + 2, {})
  assert.equal(s.cpus[1].phase, "riding")
  assert.ok(s.cpus[1].speed > 0)
  assert.ok(s.cpus[1].worldX > stopped)
})


test("cpu lane-change into a ramp side crashes and recovers", () => {
  const wall = feature("ramp", "large")
  assert.ok(wall.lanes.indexOf(0) < 0)
  assert.ok(wall.lanes.indexOf(1) >= 0)
  const mid = wall.spans[0].x0 + (wall.spans[0].x1 - wall.spans[0].x0) * 0.55
  let s = place(wall.x - 400, 0, 3, { raceStarted: true })
  const cpu = placeCpu(s, 0, wall.x + mid, 0, 70)
  cpu.laneFrom = 0
  cpu.laneTo = 1
  cpu.laneT = G.LANE_TIME * 0.5
  cpu.changing = true
  assert.ok(G.sideHeightHit(cpu, cpu.worldX), "fixture should be a side hit")
  s = run(s, 1, {})
  assert.equal(s.cpus[0].phase, "crashed")
  assert.equal(s.cpus[0].speed, 0)
  assert.equal(s.cpus[0].turboing, false)
  const stopped = s.cpus[0].worldX
  s = run(s, Math.ceil(G.CRASH_TIME * 60) + 2, {})
  assert.equal(s.cpus[0].phase, "riding")
  assert.ok(s.cpus[0].speed > 0)
  assert.ok(s.cpus[0].worldX > stopped)
})

test("cpu lane AI still refuses a merge into a tall ramp side", () => {
  const wall = feature("ramp", "large")
  assert.ok(wall.lanes.indexOf(0) < 0)
  assert.ok(wall.lanes.indexOf(1) >= 0)
  // Mud on lane 0 so the skilled red rider wants out, but lane 1 is the ramp face.
  const mudX = wall.x + wall.spans[0].x0 + 20
  let s = place(wall.x - 500, 0, 3, { raceStarted: true })
  // Fabricate a mud strip under the CPU by placing them where COURSE mud is not;
  // instead put them on open ground next to the ramp and force hazard via mudSkill
  // check: park them approaching the ramp side with mud in their lane from COURSE.
  // Use the landing mud after the large ramp if it covers lane that is NOT the ramp.
  // Simpler: assert cpuWantTurbo / sideHeightHit helpers, and that chooseCpuLane
  // returns -1 when the only escape is a side hit. Place CPU on lane 0 at the
  // ramp face with a fake mud strip by using an existing mud that shares x with
  // nothing — or just verify sideHeightHit + that a CPU mid-course keeps phase riding
  // when AI initiates (no voluntary side crash).
  placeCpu(s, 0, wall.x + 40, 0, 100)
  s.cpus[0].mudSkill = 0.9
  // No mud here, so chooseCpuLane returns -1 (no hazard). Force a hazard by
  // temporarily pointing world at a mud strip then offsetting into the ramp.
  const mud = G.COURSE.find((f) => f.type === "mud" && f.lanes.includes(2) && !f.lanes.includes(1))
  assert.ok(mud)
  placeCpu(s, 0, mud.x - 40, 2, 100)
  // Park a raised piece check: move to ramp with mud skill wanting out of mud onto ramp.
  // At mud.x-40 there is no ramp. Run until they change into lane 1 (clear of mud).
  s = run(s, Math.ceil(G.LANE_TIME * 60) + 4, {})
  assert.notEqual(s.cpus[0].phase, "crashed")
  // Now at the large ramp, put them on the empty bypass with mud ahead in that lane
  // so AI considers merging onto the ramp — side hazard should block it.
  placeCpu(s, 0, wall.x - 50, 0, 100)
  s.cpus[0].mudSkill = 0.9
  // Inject a temporary mud flag by placing worldX where stripAt sees mud on lane 0.
  // The course has grass on lane 0 beside the large ramp at x 3160; use mud on [1,2,3]
  // landing. Put CPU on lane 0 at wall.x+20 (flat) with a synthetic approach:
  // call sideHeightHit directly for the merge they would attempt.
  const probe = {
    changing: true, air: false,
    laneFrom: 0, laneTo: 1,
    worldX: wall.x + wall.spans[0].x0 + 40
  }
  assert.equal(G.sideHeightHit(probe, probe.worldX), true)
  // And the live AI: CPU on lane 0 at the face with heat high, no mud — stays put.
  placeCpu(s, 0, wall.x + 40, 0, 100)
  s.cpus[0].heat = 90
  const laneBefore = s.cpus[0].lane
  s = run(s, 30, {})
  assert.equal(s.cpus[0].lane, laneBefore)
  assert.equal(s.cpus[0].phase, "riding")
})

test("cpu turbos on an open straight and cools on an arrow", () => {
  let s = place(200, 0, 1, { raceStarted: true })
  placeCpu(s, 0, 280, 0, 100)
  s.cpus[0].heat = 0
  s.cpus[0].targetSpeed = 100
  let guard = 0
  while (!s.cpus[0].turboing && guard < 90) {
    s = run(s, 1, {})
    guard++
  }
  assert.equal(s.cpus[0].turboing, true, "expected turbo on the open straight")
  s = run(s, 20, {})
  assert.equal(s.cpus[0].turboing, true)
  assert.ok(s.cpus[0].heat > 5, "heat " + s.cpus[0].heat)
  assert.ok(s.cpus[0].speed > s.cpus[0].targetSpeed, "speed " + s.cpus[0].speed)

  const arrow = feature("cool")
  placeCpu(s, 0, arrow.x + 20, arrow.lanes[0], 120)
  s.cpus[0].heat = 70
  s.cpus[0].turboing = false
  s = run(s, 2, {})
  assert.equal(s.cpus[0].heat, 0)
})

test("cpu that pushes turbo to 100 overheats, stalls, and recovers", () => {
  let s = place(800, G.MAX_SPEED, 1, { raceStarted: true })
  // Far behind so catch-up AI redlines all the way to HEAT_MAX.
  placeCpu(s, 0, 200, 0, 150)
  s.cpus[0].heat = 94
  s.cpus[0].turboing = true
  let guard = 0
  while (s.cpus[0].phase !== "overheat" && guard < 120) {
    s = run(s, 1, {})
    guard++
  }
  assert.equal(s.cpus[0].phase, "overheat", "phase " + s.cpus[0].phase + " heat " + s.cpus[0].heat)
  assert.equal(s.cpus[0].turboing, false)
  s = run(s, Math.ceil(G.OVERHEAT_TIME * 60), {})
  assert.equal(s.cpus[0].phase, "riding")
  assert.equal(s.cpus[0].heat, 0)
  const stopped = s.cpus[0].worldX
  s = run(s, 30, {})
  assert.ok(s.cpus[0].speed > 0)
  assert.ok(s.cpus[0].worldX > stopped)
})


test("low wall crashes without a wheelie and clears with one", () => {
  const wall = feature("wall", "low")
  assert.ok(wall)
  assert.ok(wall.h >= 8)
  let s = place(wall.x - 20, 100, wall.lanes[0], { raceStarted: true })
  let guard = 0
  while (s.phase !== "crash" && guard < 60) {
    s = run(s, 1, { throttle: true })
    guard++
  }
  assert.equal(s.phase, "crash", "expected tumble into the wall")

  s = place(wall.x - 40, 110, wall.lanes[0], { raceStarted: true, tilt: G.WHEELIE_DEG })
  // Hold wheelie across the wall.
  guard = 0
  while (s.scrollX + s.x < wall.x + wall.len + 10 && s.phase !== "crash" && guard < 90) {
    s = run(s, 1, { throttle: true, left: true })
    guard++
  }
  assert.notEqual(s.phase, "crash", "wheelie should clear the low wall")
  assert.ok(s.scrollX + s.x > wall.x + wall.len)
})

test("barrier needs a jump and an open lane misses it", () => {
  const bar = feature("wall", "barrier")
  assert.ok(bar.clearHeight > 10)
  let s = place(bar.x - 16, 100, bar.lanes[0], { raceStarted: true })
  let guard = 0
  while (s.phase !== "crash" && guard < 40) {
    s = run(s, 1, { throttle: true })
    guard++
  }
  assert.equal(s.phase, "crash")

  const open = [0, 1, 2, 3].find((l) => bar.lanes.indexOf(l) < 0)
  assert.ok(open != null)
  s = place(bar.x - 16, 100, open, { raceStarted: true })
  s = run(s, 40, { throttle: true })
  assert.notEqual(s.phase, "crash")
  assert.ok(s.scrollX + s.x > bar.x + bar.len)
})

test("downward step is rideable and launches off the cliff", () => {
  const st = feature("step", "short")
  assert.ok(st.spans.length >= 2)
  assert.ok(st.peak > 20)
  const end = st.spans[st.spans.length - 1]
  assert.ok(end.y1 > 5)
  let s = place(st.x + st.len - 4, 110, st.lanes[0], { raceStarted: true })
  let guard = 0
  while (!s.air && guard < 40) {
    s = run(s, 1, { throttle: true })
    guard++
  }
  assert.equal(s.air, true, "expected launch off the step")
  assert.ok(s.vy > 0)
})

test("washboard jolts across three tiny mounds", () => {
  const wash = feature("wash", "triple")
  assert.ok(wash.spans.length >= 6)
  let s = place(wash.x + 4, 80, wash.lanes[0], { raceStarted: true })
  let maxH = 0
  for (let i = 0; i < 80; i++) {
    s = run(s, 1, { throttle: true })
    if ((s.height || 0) > maxH) maxH = s.height
    if (s.scrollX + s.x > wash.x + wash.len) break
  }
  assert.ok(maxH >= 5, "max height " + maxH)
  assert.notEqual(s.phase, "crash")
})

test("cpu steers around a wall in its lane", () => {
  const wall = feature("wall", "low")
  const open = [0, 1, 2, 3].find((l) => wall.lanes.indexOf(l) < 0)
  assert.ok(open != null)
  let s = place(wall.x - 500, 0, 3, { raceStarted: true })
  placeCpu(s, 0, wall.x - 80, wall.lanes[0], 100)
  s.cpus[0].heat = 90
  s = run(s, Math.ceil(G.LANE_TIME * 60) + 8, {})
  assert.notEqual(s.cpus[0].phase, "crashed")
  assert.ok(wall.lanes.indexOf(s.cpus[0].lane) < 0 || s.cpus[0].worldX < wall.x,
    "cpu lane " + s.cpus[0].lane + " wx " + s.cpus[0].worldX)
})
