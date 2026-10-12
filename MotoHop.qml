import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import "Game.js" as Game

// Overlay entry point. Rules live in Game.js, drawing in Scene.qml.
Item {
  id: root
  readonly property string pluginId: "io.github.tomfaulkner.moto-hop"
  property var shell: null
  property var manifest: null
  property bool opened: false
  property var game: Game.initialState()
  property var held: ({ up: false, down: false, left: false, right: false, throttle: false, crash: false })
  property double lastTick: 0

  function open(payloadJson) {
    opened = true
    game = Game.initialState()
    lastTick = Date.now()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }
  function close() { opened = false; releaseAll() }
  function dismiss() {
    close()
    if (shell && typeof shell.hide === "function") shell.hide(pluginId)
  }
  function toggle() { if (opened) dismiss(); else open("{}") }

  function releaseAll() {
    held = { up: false, down: false, left: false, right: false, throttle: false, crash: false }
  }
  function keyName(key) {
    switch (key) {
    case Qt.Key_Up: case Qt.Key_W: return "up"
    case Qt.Key_Down: case Qt.Key_S: return "down"
    case Qt.Key_Left: case Qt.Key_A: return "left"
    case Qt.Key_Right: case Qt.Key_D: return "right"
    case Qt.Key_Space: case Qt.Key_Z: case Qt.Key_J: return "throttle"
    case Qt.Key_X: case Qt.Key_C: return "crash"
    }
    return ""
  }
  function setKey(event, down) {
    if (event.key === Qt.Key_Escape) { if (down) dismiss(); return true }
    var name = keyName(event.key)
    if (!name) return false
    if (event.isAutoRepeat) return true
    var h = {}
    for (var k in held) h[k] = held[k]
    h[name] = down
    held = h
    return true
  }

  Timer {
    interval: 16
    repeat: true
    running: root.opened
    onTriggered: {
      var now = Date.now()
      var dt = Math.min(0.05, (now - root.lastTick) / 1000)
      root.lastTick = now
      root.game = Game.step(Game.setInput(root.game, root.held), dt)
    }
  }

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; right: true; bottom: true; left: true }
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "moto-hop"
    WlrLayershell.layer: WlrLayer.Overlay
    // OnDemand, not Exclusive, so Omarchy shortcuts keep working (see Crossy Hop).
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

    MouseArea { anchors.fill: parent; acceptedButtons: Qt.AllButtons; onClicked: root.dismiss() }

    Item {
      id: card
      // Largest integer multiple of the logical view that fits with a margin.
      readonly property int k: Math.max(1, Math.floor(Math.min((panel.width - 64) / Game.VIEW_W, (panel.height - 64) / Game.VIEW_H)))
      width: Game.VIEW_W * k
      height: Game.VIEW_H * k
      anchors.centerIn: parent

      MouseArea { anchors.fill: parent; acceptedButtons: Qt.AllButtons; onClicked: keyCatcher.forceActiveFocus() }
      Scene { anchors.fill: parent; game: root.game }

      Item {
        id: keyCatcher
        anchors.fill: parent
        focus: true
        Keys.onPressed: function(event) { if (root.setKey(event, true)) event.accepted = true }
        Keys.onReleased: function(event) { if (root.setKey(event, false)) event.accepted = true }
        onActiveFocusChanged: if (!activeFocus) root.releaseAll()
      }
    }
  }
}
