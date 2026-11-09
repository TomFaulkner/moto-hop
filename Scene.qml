import QtQuick
import "Game.js" as Game

// Pure QtQuick (no Quickshell) so it renders headless for screenshots.
// Draws at NES-like logical res and integer-scales up with nearest filtering.
Item {
  id: scene
  property var game: Game.initialState()
  readonly property int pixelScale: Math.max(1, Math.floor(Math.min(width / Game.VIEW_W, height / Game.VIEW_H)))
  readonly property string assetDir: Qt.resolvedUrl("assets/reactorcore/")
  readonly property var sprites: ["chassis_blue.png", "chassis_red.png", "chassis_green.png",
                                  "chassis_yellow.png", "chassis_purple.png", "wheel.png", "fork.png"].concat(riderSprites())
  function riderSprites() {
    var out = [], poses = ["crouch", "lean", "tuck"], cols = ["blue", "red", "green", "yellow", "purple"]
    for (var i = 0; i < poses.length; i++)
      for (var j = 0; j < cols.length; j++) out.push("../rider/rider_" + poses[i] + "_" + cols[j] + ".png")
    return out
  }
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
    if (g.phase === "finished") return "FINISH"
    if (g.input && g.input.turbo && g.phase !== "crash") return "TURBO"
    return (g.phase || "").toUpperCase()
  }
  function lapOf(g) {
    var n = g && g.lap > 0 ? g.lap : 1
    return Math.min(n, Game.TOTAL_LAPS)
  }
  function ordinal(n) {
    var v = Math.max(1, Math.floor(n || 1))
    if (Math.floor(v / 10) % 10 === 1) return v + "th"
    if (v % 10 === 1) return v + "st"
    if (v % 10 === 2) return v + "nd"
    if (v % 10 === 3) return v + "rd"
    return v + "th"
  }
  function placeText(g) {
    var field = (g && g.cpus ? g.cpus.length : 0) + 1
    return ordinal((g && g.finishPosition) || 1) + " / " + field
  }
  function blink(t) { return Math.floor((t || 0) * 2) % 2 === 0 }

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

    function drawBike(ctx, p, chassisName, cam, riderName) {
      var S = Game.SPRITE
      ctx.save()
      ctx.translate(p.x, p.y + cam)
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
      ctx.drawImage(img(chassisName), S.chassis.x, S.chassis.y)
      ctx.drawImage(img("fork.png"), S.fork.x, S.fork.y)
      if (riderName) ctx.drawImage(img("../rider/" + riderName), Game.RIDER.x, Game.RIDER.y)
      ctx.restore()
    }

    function drawShadow(ctx, rider, p, cam) {
      // Shadows stay on the flat lane in the air and while tumbling. A flat
      // bar is hidden wherever it would cross a raised piece in this lane.
      var shadowW = 66
      if (rider.air) shadowW = Math.max(18, Math.round(66 - (rider.height || 0) * 0.4))
      var shX = Math.round(p.x - 4 + (66 - shadowW) / 2)
      var overRaised = false
      var scroll = Math.floor(p.scrollX)
      for (var k = 0; k <= 4; k++) {
        if (Game.surfaceAt(scroll + shX + shadowW * k / 4, rider.lane)) overRaised = true
      }
      if (!overRaised) {
        ctx.fillStyle = "rgba(0,0,0,0.3)"
        ctx.fillRect(shX, Math.round(rider.laneY - 2 + cam), shadowW, 3)
      }
    }

    function laneHas(f, lane) {
      var ls = f.lanes
      for (var i = 0; i < ls.length; i++) if (ls[i] === lane) return true
      return false
    }

    // Riding-surface pixel. sink > 0 lifts the dirt into the tire so the
    // wheel shares a row with the ground instead of sitting a pixel above it.
    function columnTop(base, h, sink) {
      return Math.round(base - h) - sink
    }

    function drawSpanColumns(ctx, sx0, sp, base, sink, body, crust) {
      if (!sp || sp.gap) return
      var x0 = Math.floor(sx0 + sp.x0)
      var x1 = Math.ceil(sx0 + sp.x1)
      if (x1 < 0 || x0 >= Game.VIEW_W) return
      for (var x = x0; x < x1; x++) {
        if (x < 0 || x >= Game.VIEW_W) continue
        var u = (x + 0.5 - (sx0 + sp.x0)) / sp.len
        if (u < 0) u = 0
        if (u > 1) u = 1
        var h = sp.y0 + (sp.y1 - sp.y0) * u
        var top = columnTop(base, h, sink)
        var heel = Math.round(base) + 3
        if (top >= heel) continue
        ctx.fillStyle = body
        ctx.fillRect(x, top, 1, heel - top)
        var bodyH = heel - top
        if (bodyH > 16) {
          ctx.fillStyle = "#6a3c18"
          ctx.fillRect(x, top + ((bodyH * 5) >> 3), 1, heel - (top + ((bodyH * 5) >> 3)))
        }
        ctx.fillStyle = crust
        ctx.fillRect(x, top, 1, sp.kind === "flat" ? 3 : 2)
        if (sp.kind === "flat" && ((x - x0) & 7) < 4) {
          ctx.fillStyle = "#f4e2b4"
          ctx.fillRect(x, top + 1, 1, 1)
        } else if (((x - x0) % 5) === 0) {
          ctx.fillStyle = "#6a3816"
          var speck = top + 4 + ((x >> 1) & 1)
          if (speck < heel - 2) ctx.fillRect(x, speck, 1, 2)
        }
      }
    }

    function crustOf(kind) {
      if (kind === "down") return "#c08040"
      if (kind === "flat") return "#f0d090"
      return "#e2b060"
    }

    function bodyOf(kind) {
      if (kind === "down") return "#7a4820"
      if (kind === "flat") return "#96602c"
      return "#8d5226"
    }

    // Near-side shade. A band under the crust, same columns as the slope,
    // clipped to the piece heel. It pinches off at the toe instead of a
    // second profile shifted down onto the track ahead of the slope.
    function drawSideBand(ctx, sx0, sp, base) {
      if (!sp || sp.gap) return
      var x0 = Math.floor(sx0 + sp.x0)
      var x1 = Math.ceil(sx0 + sp.x1)
      if (x1 < 0 || x0 >= Game.VIEW_W) return
      var heel = Math.round(base) + 3
      var depth = 6
      var xStart = x0 < 0 ? 0 : x0
      var xEnd = x1 > Game.VIEW_W ? Game.VIEW_W : x1
      for (var x = xStart; x < xEnd; x++) {
        var u = (x + 0.5 - (sx0 + sp.x0)) / sp.len
        if (u < 0) u = 0
        if (u > 1) u = 1
        var h = sp.y0 + (sp.y1 - sp.y0) * u
        if (h < 3) continue
        // Flat tops get no band: it read as a dark slab under the plateau edge.
        if (sp.y0 === sp.y1) continue
        var top = columnTop(base, h, 1)
        var y0 = top + (sp.kind === "flat" ? 3 : 2)
        var y1 = y0 + depth
        if (y1 > heel) y1 = heel
        if (y0 >= y1) continue
        ctx.fillStyle = "#3a2212"
        ctx.fillRect(x, y0, 1, y1 - y0)
        ctx.fillStyle = "#1a100a"
        ctx.fillRect(x, y0, 1, 1)
      }
    }

    // One lane of a raised piece: riding surface, near-side band, cliff face.
    function drawRaisedLane(ctx, f, sx0, lane, cam) {
      var base = Game.LANE_Y[lane] + cam
      var spans = f.spans || []
      var nearOpen = !laneHas(f, lane + 1)
      var i
      for (i = 0; i < spans.length; i++) {
        var sp = spans[i]
        drawSpanColumns(ctx, sx0, sp, base, 1, bodyOf(sp.kind), crustOf(sp.kind))
      }
      if (nearOpen) {
        for (i = 0; i < spans.length; i++) drawSideBand(ctx, sx0, spans[i], base)
      }
      var end = null
      for (i = 0; i < spans.length; i++) if (!spans[i].gap) end = spans[i]
      if (end && end.y1 > 5) {
        var x = Math.round(sx0 + end.x1)
        var top = columnTop(base, end.y1, 1)
        var heel = Math.round(base) + 3
        if (x < Game.VIEW_W && x + 5 > 0 && top < heel) {
          ctx.fillStyle = nearOpen ? "#1c1008" : "#2a160c"
          ctx.fillRect(x, top, 4, heel - top)
          ctx.fillStyle = "#6a3c1c"
          ctx.fillRect(x, top, 1, heel - top)
          if (nearOpen) {
            ctx.fillStyle = "#140c08"
            ctx.fillRect(x, Math.min(heel - 1, top + 6), 4, Math.max(1, heel - (top + 6)))
          }
        }
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

    function drawMud(ctx, sx, len, base) {
      var x0 = Math.floor(sx)
      var span = Math.max(1, Math.round(len))
      // Lane pitch is 22. A 22px band meets the next lane so a full-width strip is solid.
      var top = base - 14
      ctx.fillStyle = "#2a2218"
      ctx.fillRect(x0, top, span, 22)
      ctx.fillStyle = "#4e4034"
      ctx.fillRect(x0, top, span, 4)
      var i
      for (i = 2; i < span - 2; i += 6) {
        ctx.fillStyle = ((i >> 2) & 1) ? "#16110c" : "#6a5844"
        ctx.fillRect(x0 + i, top + 6 + (i & 2), 3, 3)
        ctx.fillStyle = "#3a3028"
        ctx.fillRect(x0 + i + 1, top + 12, 2, 2)
      }
    }

    // Excitebike washboard: a run of tiny teeth. Heights come from the same
    // tooth the rear wheel rides, so the tire sits on the pixel crest.
    function drawRumble(ctx, sx, len, base) {
      var x0 = Math.floor(sx)
      var span = Math.max(1, Math.round(len))
      ctx.fillStyle = "#2a160c"
      ctx.fillRect(x0, base - 2, span, 4)
      for (var i = 0; i < span; i++) {
        var sample = Game.rumbleSample((x0 + i + 0.5) - sx)
        var h = sample.h
        if (h < 1) continue
        var top = Math.round(base - h)
        ctx.fillStyle = sample.rising ? "#8d5226" : "#5a3014"
        ctx.fillRect(x0 + i, top, 1, Math.round(base) + 2 - top)
        ctx.fillStyle = sample.rising ? "#e2b060" : "#c08040"
        ctx.fillRect(x0 + i, top, 1, 1)
        if (h >= Game.RUMBLE_H) {
          ctx.fillStyle = "#f4e2b4"
          ctx.fillRect(x0 + i, top, 1, 1)
        }
      }
    }

    function drawGrass(ctx, sx, len, base) {
      var x0 = Math.floor(sx)
      var span = Math.max(1, Math.round(len))
      var top = base - 14
      ctx.fillStyle = "#1a541c"
      ctx.fillRect(x0, top, span, 22)
      ctx.fillStyle = "#2e8230"
      ctx.fillRect(x0, top + 4, span, 8)
      var i
      for (i = 0; i < span; i += 3) {
        ctx.fillStyle = ((i / 3) & 1) ? "#186018" : "#78d454"
        ctx.fillRect(x0 + i, top + (i & 2), 1, 7)
      }
    }

    // Solid low wall / barrier plank. Not a rideable face — wheelie or jump.
    function drawWall(ctx, f, sx0, lane, cam) {
      var base = Game.LANE_Y[lane] + cam
      var x0 = Math.round(sx0)
      var w = Math.max(4, Math.round(f.len || 14))
      var h = Math.max(8, Math.round(f.h || 12))
      var top = Math.round(base) - h
      var nearOpen = !laneHas(f, lane + 1)
      // Plank body
      ctx.fillStyle = "#3a2414"
      ctx.fillRect(x0, top, w, h)
      ctx.fillStyle = "#6a4020"
      ctx.fillRect(x0, top, w, 2)
      ctx.fillStyle = "#1a1008"
      ctx.fillRect(x0, top + h - 2, w, 2)
      // Vertical posts
      ctx.fillStyle = "#24180c"
      ctx.fillRect(x0, top, 2, h)
      ctx.fillRect(x0 + w - 2, top, 2, h)
      // Checker / stripe so it reads as a barrier, not dirt
      for (var y = top + 3; y < top + h - 3; y += 4) {
        ctx.fillStyle = ((y - top) & 4) ? "#c4a060" : "#2a1c10"
        ctx.fillRect(x0 + 3, y, Math.max(1, w - 6), 2)
      }
      if (nearOpen) {
        ctx.fillStyle = "#140c08"
        ctx.fillRect(x0, top + 2, 1, h - 2)
      }
    }

    // Checkered banner on course x = 0, once per lap, across every lane.
    function drawFinishLine(ctx, scroll, cam) {
      var cycle = Game.COURSE_LEN
      var n0 = Math.floor((scroll - 32) / cycle)
      var n1 = Math.floor((scroll + Game.VIEW_W + 32) / cycle)
      var y0 = Game.LANE_Y[0] - 14 + cam
      var y1 = y0 + Game.LANES * Game.LANE_H
      var cell = 8
      var cols = 2
      for (var n = n0; n <= n1; n++) {
        var x = Math.round(n * cycle - scroll)
        if (x > Game.VIEW_W || x + cols * cell < 0) continue
        for (var col = 0; col < cols; col++) {
          for (var y = y0; y < y1; y += cell) {
            var on = ((col + ((y - y0) / cell)) & 1) === 0
            ctx.fillStyle = on ? "#141414" : "#fcfcfc"
            ctx.fillRect(x + col * cell, y, cell, Math.min(cell, y1 - y))
          }
        }
      }
    }

    function drawCourse(ctx, scroll, cam) {
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
          var order = []
          for (var li = 0; li < f.lanes.length; li++) order.push(f.lanes[li])
          order.sort(function(a, b) { return a - b })
          for (var oi = 0; oi < order.length; oi++) {
            var lane = order[oi]
            if (lane < 0 || lane >= Game.LANES) continue
            var base = Game.LANE_Y[lane] + cam
            if (f.type === "wall") drawWall(ctx, f, sx0, lane, cam)
            else if (f.spans && f.spans.length) drawRaisedLane(ctx, f, sx0, lane, cam)
            else if (f.type === "cool") drawCool(ctx, sx0, f.len, base)
            else if (f.type === "boost") drawBoost(ctx, sx0, f.len, base)
            else if (f.type === "mud") drawMud(ctx, sx0, f.len, base)
            else if (f.type === "grass") drawGrass(ctx, sx0, f.len, base)
            else if (f.type === "rumble") drawRumble(ctx, sx0, f.len, base)
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
      var cam = Game.cameraY(g)

      ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, H)
      // Sky fills the view; the horizon drops when the camera rises for a tall lip.
      ctx.fillStyle = "#5c94fc"; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = "#3a8a3a"
      for (var hx = -((sx >> 2) % 64); hx < W; hx += 64) ctx.fillRect(hx, 56 + cam, 40, 14)
      // Stands + crowd (scroll at half speed)
      ctx.fillStyle = "#7c4a2a"; ctx.fillRect(0, 70 + cam, W, 34)
      var off = (sx >> 1) % 8
      for (var cy = 74; cy < 100; cy += 6)
        for (var cx = -off + ((cy / 6) % 2) * 4; cx < W; cx += 8) {
          ctx.fillStyle = ["#f8d878", "#f83800", "#ffffff", "#0058f8"][((cx + sx / 2 + cy) >> 3) & 3]
          ctx.fillRect(Math.round(cx), cy + cam, 3, 3)
        }
      // Barrier with scrolling ad blocks
      ctx.fillStyle = "#fcfcfc"; ctx.fillRect(0, 104 + cam, W, 14)
      ctx.fillStyle = "#d82800"
      for (var bx = -(sx % 48); bx < W; bx += 48) ctx.fillRect(bx, 106 + cam, 24, 6)
      // Track
      ctx.fillStyle = "#c88c50"; ctx.fillRect(0, Game.TRACK_TOP + cam, W, H - Game.TRACK_TOP)
      ctx.fillStyle = "#a86c38"
      for (var gx = -(sx % 16); gx < W; gx += 16) ctx.fillRect(gx, Game.TRACK_TOP + 2 + cam, 2, H - Game.TRACK_TOP)
      // Lane dividers (dashed, scrolling)
      ctx.fillStyle = "#fcfcfc"
      for (var l = 0; l <= Game.LANES; l++) {
        var ly = Game.LANE_Y[0] - 14 + l * Game.LANE_H + cam
        if (l === 0 || l === Game.LANES) ctx.fillRect(0, ly, W, 2)
        else for (var dx = -(sx % 24); dx < W; dx += 24) ctx.fillRect(dx, ly, 12, 1)
      }
      // Trackside distance markers
      ctx.fillStyle = "#f8f800"
      for (var mx = -(sx % 128) + 100; mx < W; mx += 128) ctx.fillRect(mx, Game.TRACK_TOP - 4 + cam, 3, 8)

      drawCourse(ctx, sx, cam)
      drawFinishLine(ctx, sx, cam)

      // Far lanes draw first; near lanes (larger laneY) overlap them.
      var riders = [{ state: g, pose: p, laneY: g.laneY, chassis: "chassis_blue.png", colour: "blue" }]
      var colours = ["red", "green", "yellow", "purple"]
      var cpus = g.cpus || []
      for (var ci = 0; ci < cpus.length; ci++) {
        var cpu = cpus[ci]
        var cp = Game.cpuPose(g, cpu)
        if (cp.x < -100 || cp.x > W + 100) continue
        riders.push({ state: cpu, pose: cp, laneY: cpu.laneY,
                      chassis: "chassis_" + colours[cpu.palette % colours.length] + ".png",
                      colour: colours[cpu.palette % colours.length] })
      }
      riders.sort(function(a, b) { return a.laneY - b.laneY })
      for (var ri = 0; ri < riders.length; ri++) {
        var rider = riders[ri]
        drawShadow(ctx, rider.state, rider.pose, cam)
        var st = rider.state
        var rp = Game.riderPose(st.tilt || 0, !!st.air, st.phase)
        drawBike(ctx, rider.pose, rider.chassis, cam, "rider_" + rp + "_" + rider.colour + ".png")
      }

      // Pixel smoke, drawn over the bike so puffs read on top of the engine.
      var sm = g.smoke || []
      for (var si = 0; si < sm.length; si++) {
        var puff = sm[si]
        var age = 1 - puff.life / puff.max
        var px = Math.round(puff.x)
        var py = Math.round(puff.y + cam)
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
    text: Game.TITLE.toUpperCase() + "   " + scene.hudPhase(scene.game) + "   LANE " + (scene.game.lane + 1)
          + "   POS " + Game.racePosition(scene.game) + "/" + (scene.game.cpus.length + 1)
          + "   " + Math.round(scene.game.speed) + " KM/H"
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
    Text {
      id: lapHud
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      font.family: "monospace"
      font.bold: true
      font.pixelSize: 8 * scene.pixelScale
      color: "#fcfcfc"
      text: "LAP " + scene.lapOf(scene.game) + "/" + Game.TOTAL_LAPS
            + "  " + Game.formatRaceTime(scene.game.lapTime)
            + "  LAST " + Game.formatRaceTime(scene.game.lastLap)
             + "  BEST " + Game.formatRaceTime(scene.game.bestTime)
    }
    Rectangle {
      id: tempTrack
      x: 30 * scene.pixelScale
      anchors.verticalCenter: parent.verticalCenter
      width: Math.max(48 * scene.pixelScale, parent.width - x - lapHud.width - 8 * scene.pixelScale)
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

  // Control hint along the bottom edge of the view.
  Rectangle {
    id: hintBar
    x: scene.viewLeft
    y: scene.viewTop + (Game.VIEW_H - 10) * scene.pixelScale
    width: Game.VIEW_W * scene.pixelScale
    height: 10 * scene.pixelScale
    color: "#000000"
    opacity: 0.6
    Text {
      anchors.centerIn: parent
      text: "SPACE throttle  SHIFT turbo  \u2191\u2193 lane  \u2190\u2192 lean  R restart  ESC close"
      font.family: "monospace"
      font.bold: true
      font.pixelSize: 7 * scene.pixelScale
      color: "#fcfcfc"
    }
  }

  // Results overlay: a frozen race, so everything here reads one snapshot.
  Item {
    id: results
    visible: scene.game.phase === "finished"
    x: scene.viewLeft
    y: scene.viewTop
    width: Game.VIEW_W * scene.pixelScale
    height: Game.VIEW_H * scene.pixelScale

    Rectangle { anchors.fill: parent; color: "#000000"; opacity: 0.72 }

    Rectangle {
      anchors.centerIn: parent
      width: resultsColumn.childrenRect.width + 24 * scene.pixelScale
      height: resultsColumn.childrenRect.height + 16 * scene.pixelScale
      color: "#000000"
      border.color: "#fcfcfc"
      border.width: scene.pixelScale
    }
    Column {
      id: resultsColumn
      anchors.centerIn: parent
      spacing: 7 * scene.pixelScale
      Text {
        anchors.horizontalCenter: parent.horizontalCenter
        text: "FINISH"
        font.family: "monospace"
        font.bold: true
        font.pixelSize: 18 * scene.pixelScale
        color: "#fcfcfc"
      }
      Text {
        anchors.horizontalCenter: parent.horizontalCenter
        text: scene.placeText(scene.game)
        font.family: "monospace"
        font.bold: true
        font.pixelSize: 12 * scene.pixelScale
        color: "#f8f800"
      }
      Text {
        anchors.horizontalCenter: parent.horizontalCenter
        text: "TIME  " + Game.formatRaceTime(scene.game.finishTime)
        font.family: "monospace"
        font.bold: true
        font.pixelSize: 10 * scene.pixelScale
        color: "#fcfcfc"
      }
      Text {
        anchors.horizontalCenter: parent.horizontalCenter
        text: "BEST  " + Game.formatRaceTime(scene.game.bestTime)
        font.family: "monospace"
        font.bold: true
        font.pixelSize: 10 * scene.pixelScale
        color: "#58d854"
      }
      Text {
        anchors.horizontalCenter: parent.horizontalCenter
        visible: !!scene.game.newBest
        text: "NEW BEST"
        font.family: "monospace"
        font.bold: true
        font.pixelSize: 10 * scene.pixelScale
        color: scene.blink(scene.game.t) ? "#f8f800" : "#fcfcfc"
      }
      Text {
        anchors.horizontalCenter: parent.horizontalCenter
        text: "R TO RESTART"
        font.family: "monospace"
        font.bold: true
        font.pixelSize: 10 * scene.pixelScale
        color: scene.blink(scene.game.t) ? "#f83800" : "#fcfcfc"
      }
    }
  }
}
