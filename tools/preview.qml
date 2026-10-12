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

  function blank() { return { up: false, down: false, left: false, right: false, throttle: false, crash: false } }
  function run(frames, input) {
    var inp = blank()
    for (var k in input) inp[k] = input[k]
    var s = game
    for (var i = 0; i < frames; i++) s = Game.step(Game.setInput(s, inp), 1 / 60)
    game = s
  }
  function scenario(name) {
    game = Game.initialState()
    if (name === "idle") return
    run(90, { throttle: true })
    if (name === "wheelie") run(20, { throttle: true, left: true })
    else if (name === "lane") { run(1, { throttle: true, down: true }); run(7, { throttle: true }) }
    else if (name === "crash") { run(1, { throttle: true, crash: true }); run(30, {}) }
    else if (name === "crashed") { run(1, { throttle: true, crash: true }); run(80, {}) }
  }

  Scene { anchors.fill: parent; game: win.game }
}
