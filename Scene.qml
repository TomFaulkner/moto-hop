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
  // Canvas is center-anchored and scaled about its middle; this is the visual top-left.
  readonly property real viewLeft: canvas.x - (canvas.width * (pixelScale - 1)) / 2
  readonly property real viewTop: canvas.y - (canvas.height * (pixelScale - 1)) / 2

  function heatColor(heat, t) {
    var band = Game.heatBand(heat || 0)
    if (band === "flash" && (Math.floor((t || 0) * 8) % 2) === 0) return "#fcfcfc"
    if (band === "flash" || band === "red") return "#f83800"
    if (band === "yellow") return "#f8f800"
    return "#58d854"
  }
  function hudPhase(g) {
    if (!g) return ""
    if (g.phase === "overheat") return "OVERHEAT"
    if (g.input && g.input.turbo && g.phase !== "crash") return "TURBO"
    return (g.phase || "").toUpperCase()
  }

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

    // Pixel-art swingarm + shock in bike-local sprite space (fork greys, integer rects).
    function drawRearSuspension(ctx) {
      var blk = "#1a191b", dk = "#302f31", mid = "#4b4a4c", lit = "#656466"
      function r(c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }
      // Rear axle (11.5, 31.5) → pivot just behind/below the engine (28, 28)
      var arm = [[11, 30, 6], [16, 29, 7], [22, 28, 7]]
      for (var i = 0; i < arm.length; i++) {
        var a = arm[i]
        r(blk, a[0], a[1], a[2], 3)
        r(lit, a[0], a[1], a[2], 1)
        r(mid, a[0], a[1] + 1, a[2], 1)
        r(dk,  a[0], a[1] + 2, a[2], 1)
      }
      r(blk, 10, 30, 3, 4); r(lit, 11, 31, 1, 2)
      r(blk, 27, 27, 4, 5); r(mid, 28, 28, 2, 3); r(lit, 29, 29, 1, 1)
      // Shock from swingarm midpoint up to the frame under the seat
      var sh = [[22, 26, 3, 4], [20, 22, 3, 5], [18, 18, 3, 5], [16, 15, 3, 4]]
      for (var j = 0; j < sh.length; j++) {
        var t = sh[j]
        r(blk, t[0], t[1], t[2], t[3])
        r(mid, t[0] + 1, t[1], 1, t[3])
      }
      r(lit, 17, 17, 5, 1); r(lit, 17, 19, 5, 1); r(lit, 18, 21, 5, 1)
      r(dk, 15, 14, 5, 2); r(lit, 16, 14, 3, 1)
    }

    // Dirt wedge on one lane. base is the wheel-contact y; the lip rises by `height`.
    function drawRamp(ctx, sx, len, base, height) {
      var x0 = Math.floor(sx)
      var span = Math.max(2, Math.round(len))
      var hMax = Math.max(1, Math.round(height))
      var step = 2
      for (var i = 0; i < span; i += step) {
        var colH = Math.round(hMax * (i + step) / span)
        if (colH < 1) colH = 1
        var x = x0 + i
        if (x >= Game.VIEW_W || x + step <= 0) continue
        ctx.fillStyle = "#7a3e18"
        ctx.fillRect(x, base - colH, step, colH + 3)
        ctx.fillStyle = "#c47a38"
        ctx.fillRect(x, base - colH + 2, step, Math.max(0, colH - 2))
        ctx.fillStyle = "#f0c080"
        ctx.fillRect(x, base - colH, step, 2)
        if ((i / step) % 3 === 0) {
          ctx.fillStyle = "#a06028"
          ctx.fillRect(x, base - Math.max(2, Math.round(colH * 0.45)), step, 2)
        }
      }
      var lip = x0 + span
      if (lip < Game.VIEW_W + 4 && lip + 4 > 0) {
        ctx.fillStyle = "#3c1c0c"
        ctx.fillRect(lip, base - hMax, 3, hMax + 3)
        ctx.fillStyle = "#241006"
        ctx.fillRect(lip + 3, base - hMax + 2, 1, Math.max(1, hMax - 1))
      }
    }

    function drawChevron(ctx, x, y) {
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(x,     y,     2, 2)
      ctx.fillRect(x + 2, y + 2, 2, 2)
      ctx.fillRect(x + 4, y + 4, 2, 2)
      ctx.fillRect(x + 2, y + 6, 2, 2)
      ctx.fillRect(x,     y + 8, 2, 2)
    }

    // Cooling strip: blue pad and white chevrons on the dirt.
    function drawCool(ctx, sx, len, base) {
      var x0 = Math.floor(sx)
      var span = Math.max(1, Math.round(len))
      var top = base - 16
      ctx.fillStyle = "#104878"
      ctx.fillRect(x0, top, span, 14)
      ctx.fillStyle = "#48c0fc"
      ctx.fillRect(x0 + 1, top + 1, Math.max(0, span - 2), 12)
      for (var ax = 4; ax < span - 8; ax += 12) drawChevron(ctx, x0 + ax, top + 2)
    }

    // Optional boost strip. Hazard stripes plus a bolt, not the cool chevron.
    function drawBoost(ctx, sx, len, base) {
      if (!Game.ENABLE_BOOST_STRIPS) return
      var x0 = Math.floor(sx)
      var span = Math.max(1, Math.round(len))
      var top = base - 16
      var h = 14
      for (var i = 0; i < span; i += 4) {
        ctx.fillStyle = ((i / 4) % 2 === 0) ? "#ffe040" : "#f83800"
        ctx.fillRect(x0 + i, top, Math.min(4, span - i), h)
      }
      ctx.fillStyle = "#1a1004"
      ctx.fillRect(x0, top, span, 1)
      ctx.fillRect(x0, top + h - 1, span, 1)
      ctx.fillStyle = "#141414"
      for (var bx = 8; bx < span - 8; bx += 18) {
        var x = x0 + bx
        ctx.fillRect(x + 4, top + 1, 2, 4)
        ctx.fillRect(x + 1, top + 5, 5, 2)
        ctx.fillRect(x + 2, top + 7, 2, 5)
      }
    }

    function drawCourse(ctx, scroll) {
      var course = Game.COURSE
      var cycle = Game.COURSE_LEN
      var n0 = Math.floor((scroll - 200) / cycle) - 1
      var n1 = Math.floor((scroll + Game.VIEW_W + 200) / cycle) + 1
      for (var n = n0; n <= n1; n++) {
        var origin = n * cycle
        for (var i = 0; i < course.length; i++) {
          var f = course[i]
          var sx0 = origin + f.x - scroll
          if (sx0 > Game.VIEW_W || sx0 + f.len < 0) continue
          for (var li = 0; li < f.lanes.length; li++) {
            var lane = f.lanes[li]
            if (lane < 0 || lane >= Game.LANES) continue
            var base = Game.LANE_Y[lane]
            if (f.type === "ramp") drawRamp(ctx, sx0, f.len, base, Game.rampHeight(f.size))
            else if (f.type === "cool") drawCool(ctx, sx0, f.len, base)
            else if (f.type === "boost") drawBoost(ctx, sx0, f.len, base)
          }
        }
      }
    }

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

      drawCourse(ctx, sx)

      // Shadow stays on the flat lane in the air and while tumbling.
      // On a ramp it sits under the raised contact point.
      var shadowY = g.laneY
      var shadowW = 66
      if (g.air) {
        var lift = g.height || 0
        shadowW = Math.max(18, Math.round(66 - lift * 0.4))
      } else if (g.phase !== "crash" && (g.height || 0) > 0.5) {
        shadowY = p.y
      }
      ctx.fillStyle = "rgba(0,0,0,0.3)"
      ctx.fillRect(Math.round(g.x - 4 + (66 - shadowW) / 2), Math.round(shadowY - 2), shadowW, 3)

      // Bike, rotated about the rear-wheel contact point
      var S = Game.SPRITE
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angleDeg * Math.PI / 180)
      if (p.pivot === "center") ctx.translate(-Math.round(S.w / 2), -Math.round(S.h / 2))
      else ctx.translate(-Math.round(S.rearHub.x), -S.h)
      drawRearSuspension(ctx)
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

      // Pixel smoke, drawn over the bike so puffs read on top of the engine.
      var sm = g.smoke || []
      for (var si = 0; si < sm.length; si++) {
        var puff = sm[si]
        var age = 1 - puff.life / puff.max
        var px = Math.round(puff.x)
        var py = Math.round(puff.y)
        var blobs = [[0, 0, 2], [2, 1, 2], [-1, 2, 2]]
        var bi
        ctx.fillStyle = "#1a1a1a"
        for (bi = 0; bi < blobs.length; bi++) {
          var b = blobs[bi]
          ctx.fillRect(px + b[0] - 1, py + b[1] - 1, b[2] + 2, b[2] + 2)
        }
        ctx.fillStyle = age < 0.8 ? "#f4f4f4" : "#a8a8a8"
        for (bi = 0; bi < blobs.length; bi++) {
          var f = blobs[bi]
          ctx.fillRect(px + f[0], py + f[1], f[2], f[2])
        }
      }

      // HUD band. Status text and the TEMP meter sit on top of this in screen space.
      ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, 24)
    }
  }

  Text {
    // HUD lives outside the low-res canvas so text stays legible.
    id: hudText
    x: scene.viewLeft + 4 * scene.pixelScale
    y: scene.viewTop + 1 * scene.pixelScale
    font.family: "monospace"
    font.bold: true
    font.pixelSize: 9 * scene.pixelScale
    color: scene.game.phase === "overheat" ? scene.heatColor(Game.HEAT_FLASH, scene.game.t) : "#fcfcfc"
    text: Game.TITLE.toUpperCase() + "   " + scene.hudPhase(scene.game) + "   LANE " + (scene.game.lane + 1) + "   " + Math.round(scene.game.speed) + " KM/H"
  }

  Item {
    id: tempHud
    x: scene.viewLeft + 4 * scene.pixelScale
    y: scene.viewTop + 13 * scene.pixelScale
    width: (Game.VIEW_W - 8) * scene.pixelScale
    height: 8 * scene.pixelScale

    Text {
      text: "TEMP"
      font.family: "monospace"
      font.bold: true
      font.pixelSize: 8 * scene.pixelScale
      color: "#fcfcfc"
      anchors.verticalCenter: parent.verticalCenter
    }
    Rectangle {
      id: tempTrack
      x: 30 * scene.pixelScale
      anchors.verticalCenter: parent.verticalCenter
      width: parent.width - x
      height: 7 * scene.pixelScale
      color: "#000000"
      border.color: "#fcfcfc"
      border.width: scene.pixelScale

      Rectangle {
        x: parent.border.width
        y: parent.border.width
        height: parent.height - parent.border.width * 2
        width: Math.max(0, (parent.width - parent.border.width * 2) * Math.max(0, Math.min(1, (scene.game.heat || 0) / Game.HEAT_MAX)))
        color: scene.heatColor(scene.game.heat, scene.game.t)
      }
    }
  }

  Rectangle {
    visible: scene.game.phase === "overheat"
    x: overheatText.x - 6 * scene.pixelScale
    y: overheatText.y - 2 * scene.pixelScale
    width: overheatText.width + 12 * scene.pixelScale
    height: overheatText.height + 4 * scene.pixelScale
    color: "#000000"
  }
  Text {
    id: overheatText
    visible: scene.game.phase === "overheat"
    text: "OVERHEAT"
    font.family: "monospace"
    font.bold: true
    font.pixelSize: 16 * scene.pixelScale
    color: (Math.floor((scene.game.t || 0) * 8) % 2 === 0) ? "#f83800" : "#fcfcfc"
    x: scene.viewLeft + (Game.VIEW_W * scene.pixelScale - width) / 2
    y: scene.viewTop + 32 * scene.pixelScale
  }
}
