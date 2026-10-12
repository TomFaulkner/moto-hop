import QtQuick
import "Game.js" as Game

// Pure QtQuick (no Quickshell) so it renders headless for screenshots.
// Draws at NES-like logical res and integer-scales up with nearest filtering.
Item {
  id: scene
  property var game: Game.initialState()
  readonly property int pixelScale: Math.max(1, Math.floor(Math.min(width / Game.VIEW_W, height / Game.VIEW_H)))
  readonly property string assetDir: Qt.resolvedUrl("assets/reactorcore/")
  readonly property var sprites: ["chassis_blue.png", "wheel.png", "fork.png"]

  onGameChanged: canvas.requestPaint()

  Canvas {
    id: canvas
    width: Game.VIEW_W
    height: Game.VIEW_H
    anchors.centerIn: parent
    scale: scene.pixelScale
    smooth: false
    antialiasing: false
    renderTarget: Canvas.Image
    renderStrategy: Canvas.Immediate

    Component.onCompleted: { for (var i = 0; i < scene.sprites.length; i++) loadImage(scene.assetDir + scene.sprites[i]) }
    onImageLoaded: requestPaint()

    function img(name) { return scene.assetDir + name }

    onPaint: {
      var ctx = getContext("2d")
      var g = scene.game
      var p = Game.pose(g)
      var W = Game.VIEW_W, H = Game.VIEW_H
      var sx = Math.floor(p.scrollX)

      ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, H)
      // Sky + far hills
      ctx.fillStyle = "#5c94fc"; ctx.fillRect(0, 0, W, 70)
      ctx.fillStyle = "#3a8a3a"
      for (var hx = -((sx >> 2) % 64); hx < W; hx += 64) ctx.fillRect(hx, 56, 40, 14)
      // Stands + crowd (scroll at half speed)
      ctx.fillStyle = "#7c4a2a"; ctx.fillRect(0, 70, W, 34)
      var off = (sx >> 1) % 8
      for (var cy = 74; cy < 100; cy += 6)
        for (var cx = -off + ((cy / 6) % 2) * 4; cx < W; cx += 8) {
          ctx.fillStyle = ["#f8d878", "#f83800", "#ffffff", "#0058f8"][((cx + sx / 2 + cy) >> 3) & 3]
          ctx.fillRect(Math.round(cx), cy, 3, 3)
        }
      // Barrier with scrolling ad blocks
      ctx.fillStyle = "#fcfcfc"; ctx.fillRect(0, 104, W, 14)
      ctx.fillStyle = "#d82800"
      for (var bx = -(sx % 48); bx < W; bx += 48) ctx.fillRect(bx, 106, 24, 6)
      // Track
      ctx.fillStyle = "#c88c50"; ctx.fillRect(0, Game.TRACK_TOP, W, H - Game.TRACK_TOP)
      ctx.fillStyle = "#a86c38"
      for (var gx = -(sx % 16); gx < W; gx += 16) ctx.fillRect(gx, Game.TRACK_TOP + 2, 2, H - Game.TRACK_TOP)
      // Lane dividers (dashed, scrolling)
      ctx.fillStyle = "#fcfcfc"
      for (var l = 0; l <= Game.LANES; l++) {
        var ly = Game.LANE_Y[0] - 14 + l * Game.LANE_H - (l === 0 ? 0 : 0)
        if (l === 0 || l === Game.LANES) ctx.fillRect(0, ly, W, 2)
        else for (var dx = -(sx % 24); dx < W; dx += 24) ctx.fillRect(dx, ly, 12, 1)
      }
      // Trackside distance markers
      ctx.fillStyle = "#f8f800"
      for (var mx = -(sx % 128) + 100; mx < W; mx += 128) ctx.fillRect(mx, Game.TRACK_TOP - 4, 3, 8)

      // Shadow (stays on the lane even while tumbling)
      ctx.fillStyle = "rgba(0,0,0,0.3)"
      ctx.fillRect(Math.round(g.x - 4), Math.round(g.laneY - 2), 66, 3)

      // Bike, rotated about the rear-wheel contact point
      var S = Game.SPRITE
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angleDeg * Math.PI / 180)
      if (p.pivot === "center") ctx.translate(-Math.round(S.w / 2), -Math.round(S.h / 2))
      else ctx.translate(-Math.round(S.rearHub.x), -S.h)
      var hubs = [S.rearHub, S.frontHub]
      for (var w = 0; w < 2; w++) {
        ctx.save()
        ctx.translate(hubs[w].x, hubs[w].y)
        ctx.rotate(p.wheelAngle)
        ctx.drawImage(img("wheel.png"), -S.wheelSize / 2, -S.wheelSize / 2)
        ctx.restore()
      }
      ctx.drawImage(img("chassis_blue.png"), S.chassis.x, S.chassis.y)
      ctx.drawImage(img("fork.png"), S.fork.x, S.fork.y)
      ctx.restore()

      // HUD
      ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, 13)
    }
  }

  Text {
    // HUD lives outside the low-res canvas so text stays legible.
    x: canvas.x - (canvas.width * (scene.pixelScale - 1)) / 2 + 4 * scene.pixelScale
    y: canvas.y - (canvas.height * (scene.pixelScale - 1)) / 2 + 1 * scene.pixelScale
    font.family: "monospace"
    font.bold: true
    font.pixelSize: 9 * scene.pixelScale
    color: "#fcfcfc"
    text: Game.TITLE.toUpperCase() + "   " + scene.game.phase.toUpperCase() + "   LANE " + (scene.game.lane + 1) + "   " + Math.round(scene.game.speed) + " KM/H"
  }
}
