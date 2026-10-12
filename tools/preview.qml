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
  function scenario(name) {
    var s = Game.initialState()
    var guard = 0
    if (name === "turbo") {
      // Meter partly up, in the yellow band, turbo still held.
      while (s.heat < Game.HEAT_YELLOW + 12 && guard < 900) { s = play(s, 1, { turbo: true }); guard++ }
    } else if (name === "overheat") {
      while (s.phase !== "overheat" && guard < 2000) { s = play(s, 1, { turbo: true }); guard++ }
      s = play(s, 27, {})
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
