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
    } else if (name === "bump") {
      var bump = course("bump", "small")
      s = place(s, bump.lanes[0], bump.x + 36, 40)
      s = play(s, 1, {})
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

  Scene { anchors.fill: parent; game: win.game }
}
