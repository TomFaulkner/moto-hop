import QtQuick
import QtQuick.Window
import "../Game.js" as Game
import ".."

// Headless preview harness: tools/shoot.py drives scenario() then grabs the window.
Window {
  id: win
  width: Game.VIEW_W * 3
  height: Game.VIEW_H * 3
  visible: true
  color: "black"
  property var game: Game.initialState()

  function blank() { return { up: false, down: false, left: false, right: false, throttle: false, turbo: false, crash: false } }
  function play(state, frames, input) {
    var inp = blank()
    for (var k in input) inp[k] = input[k]
    for (var i = 0; i < frames; i++) state = Game.step(Game.setInput(state, inp), 1 / 60)
    return state
  }
  function course(type, size) { return Game.courseFeature(type, size) }
  function place(s, lane, worldX, speed) {
    s.lane = lane
    s.laneFrom = lane
    s.laneTo = lane
    s.laneT = 0
    s.laneY = Game.LANE_Y[lane]
    s.speed = speed
    s.scrollX = worldX - s.x
    return s
  }
  function placeCpu(s, id, worldX, lane, speed) {
    var cpu = s.cpus[id]
    cpu.worldX = worldX
    cpu.lane = lane
    cpu.laneFrom = lane
    cpu.laneTo = lane
    cpu.laneT = 0
    cpu.laneY = Game.LANE_Y[lane]
    cpu.changing = false
    cpu.speed = speed
    cpu.height = 0
    cpu.vy = 0
    cpu.air = false
    cpu.tilt = 0
    cpu.phase = "riding"
    cpu.crashT = 0
    cpu.contactT = 0
    cpu.onPiece = null
    cpu.onRumble = false
    return cpu
  }
  function hideOtherCpus(s, keep) {
    var playerX = s.scrollX + s.x
    for (var i = 0; i < s.cpus.length; i++) {
      if (i !== keep) placeCpu(s, i, playerX - 1000 - i * 100, s.cpus[i].lane, 0)
    }
  }
  function scenario(name) {
    var s = Game.initialState()
    var guard = 0
    if (name === "turbo") {
      // Meter partly up, in the yellow band, turbo still held.
      while (s.heat < Game.HEAT_YELLOW + 12 && guard < 900) { s = play(s, 1, { turbo: true }); guard++ }
    } else if (name === "overheat") {
      while (s.phase !== "overheat" && guard < 2000) { s = play(s, 1, { turbo: true }); guard++ }
      s = play(s, 27, {})
    } else if (name === "ramp-up") {
      // Climbing the steep lower-lane ramp, rear on the face and the lip ahead.
      var ramp = course("ramp", "large")
      s = place(s, ramp.lanes[0], ramp.x + ramp.len * 0.48, 80)
      s = play(s, 1, { throttle: true })
    } else if (name === "airborne") {
      // Just off the lip, nose pulled up, the wedge still under the bike.
      var jump = course("ramp", "large")
      s = place(s, jump.lanes[0], jump.x + jump.len - 2, 120)
      guard = 0
      while (!s.air && guard < 20) { s = play(s, 1, {}); guard++ }
      s = play(s, 4, { left: true })
    } else if (name === "cool-arrow") {
      var arrow = course("cool")
      s = place(s, 1, arrow.x + 28, 70)
      s.heat = 70
      s = play(s, 2, { throttle: true })
    } else if (name === "boost") {
      var strip = course("boost")
      s = place(s, 1, strip.x + 18, Game.MAX_SPEED)
      s = play(s, 14, { throttle: true })
    } else if (name === "big-ramp") {
      var big = course("ramp", "large")
      s = place(s, big.lanes[0], big.x + big.len * 0.55, 90)
      s = play(s, 1, { throttle: true })
    } else if (name === "airborne-big") {
      var lip = course("ramp", "large")
      s = place(s, lip.lanes[0], lip.x + lip.len - 2, 150)
      guard = 0
      while (!s.air && guard < 30) { s = play(s, 1, {}); guard++ }
      s = play(s, 10, { left: true })
    } else if (name === "side-crash") {
      var wall = course("ramp", "large")
      var off = 0
      while (wall.lanes.indexOf(off) >= 0) off++
      var onLane = wall.lanes[0]
      var mid = wall.spans[0].x1 * 0.55
      s = place(s, off, wall.x + mid, 70)
      var toward = onLane > off ? { down: true } : { up: true }
      s = play(s, 1, toward)
      s = play(s, 20, {})
    } else if (name === "pieces-overview") {
      var table = course("table", "long")
      s = place(s, 1, table.x + 150, 70)
      s = play(s, 1, { throttle: true })
    } else if (name === "mud") {
      var mud = course("mud")
      s = place(s, 1, mud.x + 30, 110)
      s = play(s, 8, { throttle: true })
    } else if (name === "giant") {
      var giant = course("table", "giant")
      s = place(s, 1, giant.x + giant.peakAt - 20, 70)
      s = play(s, 1, { throttle: true })
    } else if (name === "wide-partial") {
      // Wider 384px view: steep on lanes 0–1, bump on 1–2 ahead, bike in an open lane.
      var steep = course("ramp", "steep")
      s = place(s, 3, steep.x + 40, 80)
      s = play(s, 1, { throttle: true })
    } else if (name === "hazards") {
      // Lip of the big ramp, the landing mud it clears, a partial boost, and rumble teeth.
      var big = course("ramp", "large")
      // Rear wheel on the short top, lip just ahead, mud / boost / rumble in view.
      s = place(s, 2, big.x + big.len - 18, 70)
      s = play(s, 1, { throttle: true })
    } else if (name === "pieces-closeup") {
      // Front toe of the small bump, the tiny bump, and the wide hump's rise.
      // Lane 0 is open so the bike sits above the mounds.
      var tiny = course("bump", "tiny")
      s = place(s, 0, tiny.x - 70, 36)
      s = play(s, 1, {})
    } else if (name === "finish") {
      // Just past the loop line: checkers across the lanes, lap clock running.
      s = place(s, 1, Game.COURSE_LEN + 24, 88)
      s.lap = 2
      s.lapTime = 0.42
      s.lastLap = 61.08
      s.raceTime = 61.5
      s.bestTime = 60.2
      s = play(s, 4, { throttle: true })
    } else if (name === "results") {
      // Crossing the line on the last lap ends the race: results + a new best.
      var line = Game.COURSE_LEN * Game.TOTAL_LAPS
      s = place(s, 1, line - 26, Game.MAX_SPEED)
      s.lap = Game.TOTAL_LAPS
      s.raceStarted = true
      s.raceTime = 214.3
      s.lapTime = 71.9
      s.bestTime = 219.04
      placeCpu(s, 0, line + 40, 0, Game.MAX_SPEED)
      placeCpu(s, 1, line - 900, 2, 100)
      placeCpu(s, 2, line - 1400, 3, 100)
      guard = 0
      while (s.phase !== "finished" && guard < 60) { s = play(s, 1, { throttle: true }); guard++ }
    } else if (name === "ramp-climb") {
      // Tom's bug view: climbing the big ramp with the bypass lane beside it.
      var climb = course("ramp", "large")
      s = place(s, 2, climb.x + 60, 90)
      s = play(s, 1, { throttle: true })
    } else if (name === "ramp-top") {
      // Tom's view: stopped at the slope/plateau join of the giant table, lane 2.
      var gt = course("table", "giant")
      s = place(s, 2, gt.x + gt.spans[0].x1 - 20, 0)
      s = play(s, 1, {})
    } else if (name === "rumble") {
      var teeth = null
      for (var ri = 0; ri < Game.COURSE.length; ri++) {
        var piece = Game.COURSE[ri]
        if (piece.type === "rumble" && piece.lanes.indexOf(2) >= 0) teeth = piece
      }
      s = place(s, teeth.lanes[0], teeth.x + 16, 48)
      s = play(s, 4, { throttle: true })
    } else if (name === "nose") {
      s = play(s, 40, { throttle: true, right: true })
    } else if (name === "downhill") {
      var table = course("table", "long")
      var face = table.spans[table.spans.length - 1]
      s = place(s, table.lanes[0], table.x + face.x0 + 36, Game.MAX_SPEED)
      s = play(s, 18, { throttle: true })
    } else if (name === "bump") {
      var bump = course("bump", "small")
      s = place(s, bump.lanes[0], bump.x + 36, 40)
      s = play(s, 1, {})
    } else if (name === "cpu-pack") {
      // Mid-pack: two riders ahead and one behind, each in a different lane.
      s = place(s, 1, 600, 100)
      placeCpu(s, 0, 700, 0, 90)
      placeCpu(s, 1, 545, 2, 95)
      placeCpu(s, 2, 640, 3, 100)
      s = play(s, 4, { throttle: true })
    } else if (name === "cpu-pass") {
      // Side by side in adjacent lanes, with the player drawing ahead.
      s = place(s, 1, 600, Game.MAX_SPEED)
      placeCpu(s, 0, 615, 2, 80)
      hideOtherCpus(s, 0)
      s = play(s, 4, { throttle: true })
    } else if (name === "cpu-ramp") {
      // The green rider jumps the small two-lane ramp; the player bypasses on the flat.
      var cpuJump = course("ramp", "small")
      var jumpX = cpuJump.x + cpuJump.len - 8
      s = place(s, 3, jumpX - 70, 100)
      placeCpu(s, 1, jumpX - 30, cpuJump.lanes[1], 100)
      hideOtherCpus(s, 1)
      guard = 0
      while (!s.cpus[1].air && guard < 20) { s = play(s, 1, { throttle: true }); guard++ }
      s = play(s, 3, { throttle: true })
    } else if (name === "cpu-clip") {
      // The player's front wheel clips the red rider's rear wheel.
      var front = Game.SPRITE.frontHub.x - Game.SPRITE.rearHub.x
      s = place(s, 1, 500, Game.MAX_SPEED)
      placeCpu(s, 0, 500 + front + 5, 1, 40)
      hideOtherCpus(s, 0)
      s = play(s, 1, { throttle: true })
      s = play(s, 8, {})
    } else if (name === "cpu-mud") {
      // The low-mud-skill green rider ploughs through beside the player.
      var cpuMud = null
      for (var cmi = 0; cmi < Game.COURSE.length; cmi++) {
        if (Game.COURSE[cmi].type === "mud") cpuMud = Game.COURSE[cmi]
      }
      s = place(s, 1, cpuMud.x + 4, 40)
      placeCpu(s, 1, cpuMud.x + 18, cpuMud.lanes[0], Game.MAX_SPEED)
      hideOtherCpus(s, 1)
      s = play(s, 8, { throttle: true })
    } else if (name === "wall-hit") {
      var low = course("wall", "low")
      s = place(s, low.lanes[0], low.x - 30, 90)
      s = play(s, 1, { throttle: true })
      guard = 0
      while (s.phase !== "crash" && guard < 40) { s = play(s, 1, { throttle: true }); guard++ }
      if (s.phase === "crash") s = play(s, 10, {})
    } else if (name === "wall-wheelie") {
      var lowW = course("wall", "low")
      s = place(s, lowW.lanes[0], lowW.x - 50, 100)
      s = play(s, 12, { throttle: true, left: true })
      guard = 0
      while (s.scrollX + s.x < lowW.x + lowW.len + 20 && s.phase !== "crash" && guard < 60) {
        s = play(s, 1, { throttle: true, left: true }); guard++
      }
    } else if (name === "barrier") {
      var bar = course("wall", "barrier")
      s = place(s, bar.lanes[0], bar.x - 80, 110)
      s = play(s, 1, { throttle: true })
    } else if (name === "step") {
      var st = course("step", "short")
      s = place(s, st.lanes[0], st.x + 40, 90)
      s = play(s, 1, { throttle: true })
    } else if (name === "wash") {
      var wash = course("wash", "triple")
      s = place(s, wash.lanes[0], wash.x + 20, 70)
      s = play(s, 4, { throttle: true })
    } else if (name === "cpu-side-crash") {
      // Red rider mid lane-change into the large ramp's side face.
      var sideWall = course("ramp", "large")
      var sideMid = sideWall.spans[0].x1 * 0.55
      s = place(s, 3, sideWall.x + sideMid - 40, 40)
      placeCpu(s, 0, sideWall.x + sideMid, 0, 70)
      s.cpus[0].laneFrom = 0
      s.cpus[0].laneTo = 1
      s.cpus[0].laneT = Game.LANE_TIME * 0.45
      s.cpus[0].changing = true
      hideOtherCpus(s, 0)
      s = play(s, 1, {})
      s = play(s, 18, {})
    } else if (name === "cpu-turbo") {
      // Green rider on the opening straight with turbo lit and heat climbing.
      s = place(s, 2, 520, 100)
      placeCpu(s, 1, 600, 0, Game.TURBO_SPEED)
      s.cpus[1].heat = 48
      s.cpus[1].turboing = true
      hideOtherCpus(s, 1)
      s = play(s, 8, { throttle: true })
    } else if (name === "land-crash") {
      // Nose-down into the gentle ramp's flat and tumble while the wedge is still visible.
      var lip = course("ramp", "large")
      s = place(s, lip.lanes[0], lip.x + lip.len - 1, 55)
      guard = 0
      while (!s.air && guard < 30) { s = play(s, 1, {}); guard++ }
      guard = 0
      while (s.air && guard < 400) { s = play(s, 1, { right: true }); guard++ }
      if (s.phase === "crash") s = play(s, 8, {})
    } else if (name !== "idle") {
      s = play(s, 90, { throttle: true })
      if (name === "wheelie") s = play(s, 20, { throttle: true, left: true })
      else if (name === "lane") { s = play(s, 1, { throttle: true, down: true }); s = play(s, 7, { throttle: true }) }
      else if (name === "crash") { s = play(s, 1, { throttle: true, crash: true }); s = play(s, 30, {}) }
      else if (name === "crashed") { s = play(s, 1, { throttle: true, crash: true }); s = play(s, 80, {}) }
    }
    game = s
  }

  Scene { anchors.fill: parent; game: win.game; commitHash: Game.BUILD_COMMIT || "" }
}
