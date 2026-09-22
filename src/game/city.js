// Skyline City: every player is a building, drawn with the same look as the game.
// Plain canvas, no images, no React.
//
// World coordinates: x = 0 is the middle of the city, y goes UP from the top of
// the lobbies. Floor n sits with its bottom at y = n * FLOOR_H, and the lobby
// fills the floor below 0, standing on the street. The camera scales the world to
// fit the whole city; if the tallest building still doesn't fit, the view can
// scroll up from the street. Name signs, badges, crown and beacon are drawn in
// screen px so they stay readable at any zoom.

import {
  FLOOR_H,
  ROOF_H,
  ROOF_MAX,
  WIN_SIZE,
  buildingLook,
  centerOut,
  cityColors,
  floorCenter,
  floorLook,
  paintBuilding,
  paintRoof,
} from './building'
import {
  PALETTE,
  drawFloorBody,
  drawMoon,
  drawSky,
  drawStreet,
  makeSkyline,
  makeStars,
  renderSkyline,
  roundedRect,
  skylineHeight,
} from './look'

const GAP = 64 // world px between buildings
const SIDE = 60 // world px of street at each end of the city
const LOT_W = 180 // an empty lot
const LOT_FLOORS = 3 // height of an empty lot's outline
const MIN_SLOTS = 5 // fewer players than this: empty lots fill the rest
const MAX_SCALE = 1.25
const MIN_FLOOR_PX = 14 // never shrink floors below this; scroll instead
const MAX_FLOORS = 999 // drawing cap so a bogus score can't freeze the page
const TOP_PAD = 104 // screen px kept clear for the "Our City" title
const ROOF_ITEM_PX = 44 // screen px for a crown or a beacon above a sign
const DROP_TIME = 0.22 // s for one new floor to drop into place...
const GROW_TOTAL = 3 // ...but a big jump never takes longer than this overall
const FLASH_TIME = 0.35
const CACHE_MAX_PX = 8192 // taller buildings skip the cache and draw floor by floor

const FONT = 'Fredoka, ui-rounded, system-ui, sans-serif'

export function createCity(canvas, { youUid, onView } = {}) {
  const ctx = canvas.getContext('2d')
  const container = canvas.parentElement
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  let W = 0 // canvas size in CSS px
  let H = 0
  let dpr = 1
  let ground = 0 // screen px of street below the lobbies
  let nameFont = 22 // px; sized for reading from the back of a room
  let signH = 40
  let badgeFont = 12

  let loaded = false // true after the first snapshot
  let buildings = [] // in rank order, tallest first
  let lots = [] // empty lots filling the city up to MIN_SLOTS
  let slots = [] // buildings and lots, left to right
  let scale = 0 // world → screen px; 0 until the first layout
  let targetScale = 1
  let scroll = 0 // screen px the view is lifted above the street
  let maxScroll = 0
  let extent = 0 // screen px from the street up to the highest sign, crown or beacon
  let lifted = 0 // screen px the signs had to climb above their roofs to stay apart
  let view = { canScroll: false, atGround: true }

  const stars = makeStars()
  const skyline = makeSkyline()
  let skylineCanvas = null

  // Ambient life
  let cars = []
  let plane = null // { x, y, dir, speed }
  let planeTimer = 4 + Math.random() * 4
  let flickerTimer = 2

  let drag = null // { y, scroll } while a pointer is dragging the view
  let rafId = 0
  let lastTime = 0

  // ---------- setup ----------

  function resize() {
    const rect = container.getBoundingClientRect()
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = Math.max(1, rect.width)
    H = Math.max(1, rect.height)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    // Draw in CSS px; the backing store is dpr times bigger so it stays sharp
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ground = Math.round(H * 0.14)
    nameFont = Math.round(Math.min(32, Math.max(20, Math.min(W / 55, H * 0.032))))
    signH = Math.round(nameFont * 1.75)
    badgeFont = Math.max(12, Math.round(nameFont * 0.52))
    skylineCanvas = renderSkyline(skyline, W, H)
    makeCars()
    for (const b of buildings) b.cache = null
    fitCamera(true)
    // Resizing clears the canvas, so repaint now instead of waiting a frame
    updateScrollLimit()
    draw(performance.now())
  }

  function makeCars() {
    const n = Math.min(9, Math.max(3, Math.round(W / 260)))
    cars = Array.from({ length: n }, (_, i) => {
      const lane = i % 2
      return {
        lane,
        dir: lane === 0 ? 1 : -1,
        x: Math.random() * W,
        speed: reduceMotion ? 0 : 28 + Math.random() * 28,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      }
    })
  }

  function makeBuilding(p) {
    return {
      ...buildingLook(p.uid),
      uid: p.uid,
      colorIndex: -1,
      name: p.name,
      score: p.score,
      shown: 0, // floors standing
      drop: 0, // 0..1 progress of the next floor falling into place
      flash: 0,
      x: 0,
      tx: 0,
      cache: null,
    }
  }

  function setColor(b, i) {
    if (b.colorIndex === i) return
    b.colorIndex = i
    b.color = PALETTE[i]
    for (const look of b.floorLooks) look.color = b.color
    b.cache = null
  }

  function setPlayers(players) {
    const first = !loaded
    loaded = true
    const old = new Map(buildings.map((b) => [b.uid, b]))

    buildings = players.map((p) => {
      const score = Math.max(0, Math.floor(Number(p.score) || 0))
      const b = old.get(p.uid) || makeBuilding(p)
      b.name = String(p.name || 'Guest')
      b.score = score
      // The first load stands up at full height; later changes grow floor by floor
      if (first || reduceMotion || target(b) < b.shown) {
        b.shown = target(b)
        b.drop = 0
      }
      return b
    })

    // Empty lots take the spots nobody has built on yet
    const need = Math.max(0, MIN_SLOTS - buildings.length)
    while (lots.length < need) lots.push({ lot: true, w: LOT_W, x: 0, tx: 0, placed: false })
    lots.length = need
    lots.forEach((l, i) => (l.first = buildings.length === 0 && i === 0))

    // Tallest in the middle, the rest alternating right and left of it
    const order = centerOut([...buildings, ...lots])
    const total = order.reduce((sum, s) => sum + s.w, 0) + GAP * Math.max(0, order.length - 1)
    let x = -total / 2
    for (const s of order) {
      s.tx = x + s.w / 2
      const isNew = s.lot ? !s.placed : !old.has(s.uid)
      if (isNew || first) s.x = s.tx
      s.placed = true
      x += s.w + GAP
    }
    slots = order

    // Neighbors never share a color
    const colors = cityColors(buildings.map((b) => b.uid))
    for (const b of buildings) setColor(b, colors.get(b.uid))

    fitCamera(first)
    updateScrollLimit()
  }

  // ---------- camera ----------

  function cityWidth() {
    const inner = slots.reduce((sum, s) => sum + s.w, 0) + GAP * Math.max(0, slots.length - 1)
    return (inner || LOT_W) + SIDE * 2
  }

  // World px from the street to the top of the tallest roof
  function cityHeight() {
    let floors = LOT_FLOORS - 1
    for (const b of buildings) floors = Math.max(floors, b.shown + (b.shown < target(b) ? 1 : 0))
    return (floors + 1) * FLOOR_H + ROOF_MAX
  }

  function target(b) {
    return Math.min(b.score, MAX_FLOORS)
  }

  function roofZone() {
    return signH + badgeFont + ROOF_ITEM_PX + 16
  }

  function fitCamera(snap) {
    if (!W || !H) return
    const room = H - ground - TOP_PAD - roofZone() - lifted
    const fitW = W / cityWidth()
    const fitH = Math.max(1, room) / cityHeight()
    let s = Math.min(fitW, fitH, MAX_SCALE)
    // Too tall to fit with readable floors: keep the floors readable and let it scroll
    if (s * FLOOR_H < MIN_FLOOR_PX) s = Math.min(fitW, MIN_FLOOR_PX / FLOOR_H)
    targetScale = s
    if (snap || !scale) scale = s
  }

  function updateScrollLimit() {
    const needed = Math.max(extent, cityHeight() * scale + roofZone())
    maxScroll = Math.max(0, needed + TOP_PAD - (H - ground))
    scroll = Math.min(Math.max(0, scroll), maxScroll)

    const next = { canScroll: maxScroll > 1, atGround: scroll < 8 }
    if (next.canScroll !== view.canScroll || next.atGround !== view.atGround) {
      view = next
      onView?.(view)
    }
  }

  function scrollBy(dy) {
    scroll = Math.min(Math.max(0, scroll + dy), maxScroll)
  }

  function streetY() {
    return H - ground + scroll
  }

  function toScreenX(x) {
    return W / 2 + x * scale
  }

  function roofY(b, street) {
    return street - (b.shown + 1) * FLOOR_H * scale
  }

  // ---------- update ----------

  function update(dt) {
    for (const s of slots) s.x += (s.tx - s.x) * (1 - Math.exp(-dt * 6))

    for (const b of buildings) {
      b.flash = Math.max(0, b.flash - dt / FLASH_TIME)
      const left = target(b) - b.shown
      if (left <= 0) {
        b.drop = 0
        continue
      }
      // Big jumps speed up so the whole climb stays short
      const per = Math.min(DROP_TIME, Math.max(0.05, GROW_TOTAL / left))
      b.drop += dt / per
      if (b.drop >= 1) {
        b.drop = 0
        b.shown++
        b.flash = 1
      }
    }

    updateCars(dt)
    updatePlane(dt)
    updateFlicker(dt)

    fitCamera(false)
    scale += (targetScale - scale) * (1 - Math.exp(-dt * 5))
    updateScrollLimit()
  }

  function carLength() {
    return Math.min(64, Math.max(30, ground * 0.42))
  }

  function updateCars(dt) {
    const len = carLength()
    for (const c of cars) {
      c.x += c.dir * c.speed * dt
      if (c.dir > 0 && c.x > W + len * 2) c.x = -len * 2
      if (c.dir < 0 && c.x < -len * 2) c.x = W + len * 2
    }
  }

  // Now and then a plane blinks its way across the sky
  function updatePlane(dt) {
    if (reduceMotion) return
    if (plane) {
      plane.x += plane.dir * plane.speed * dt
      if (plane.x < -60 || plane.x > W + 60) {
        plane = null
        planeTimer = 10 + Math.random() * 12
      }
      return
    }
    planeTimer -= dt
    if (planeTimer > 0) return
    const dir = Math.random() < 0.5 ? 1 : -1
    plane = { dir, x: dir > 0 ? -50 : W + 50, y: TOP_PAD + 10 + Math.random() * H * 0.18, speed: 55 + Math.random() * 25 }
  }

  // Every few seconds someone somewhere turns a light on or off
  function updateFlicker(dt) {
    flickerTimer -= dt
    if (flickerTimer > 0) return
    flickerTimer = 1.5 + Math.random() * 2.5
    const lit = buildings.filter((b) => b.shown > 0)
    if (!lit.length) return
    const b = lit[Math.floor(Math.random() * lit.length)]
    const look = floorLook(b, Math.floor(Math.random() * b.shown))
    const win = look.windows[Math.floor(Math.random() * look.windows.length)]
    win.kind = win.kind === 'dark' ? 'lit' : 'dark'
    if (b.cache) b.cache.floors = -1 // repaint this building
  }

  // ---------- drawing ----------

  function draw(time) {
    drawSky(ctx, W, H, stars, scroll * 0.15, time)
    drawMoon(ctx, W, H, 18)
    if (plane) drawPlane(time)

    const street = streetY()
    if (skylineCanvas) {
      // Far-off buildings move at half speed and sit on the street
      const h = skylineHeight(H)
      const base = street - scroll * 0.5
      if (base - h < H) {
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(skylineCanvas, 0, base - h, W, h)
      }
    }
    drawHaze(street)
    drawStreet(ctx, street, W, H)
    if (!loaded) {
      drawCars(street)
      return
    }

    const you = buildings.find((b) => b.uid === youUid)
    if (you) drawSpotlight(you, street, time)

    for (const l of lots) drawLot(l, street)
    for (const b of buildings) {
      drawBuilding(b, street)
      drawRoofShape(b, street, time)
    }
    drawCars(street)

    const signs = layoutSigns(street)
    for (const s of signs) drawPosts(s)
    for (const s of signs) drawSign(s, time)
    for (const l of lots) drawLotSign(l, street)
  }

  // A warm pink glow along the horizon, behind the city
  function drawHaze(street) {
    const top = street - H * 0.45
    const g = ctx.createLinearGradient(0, top, 0, street)
    g.addColorStop(0, 'rgba(255, 158, 170, 0)')
    g.addColorStop(1, 'rgba(255, 170, 190, 0.22)')
    ctx.fillStyle = g
    ctx.fillRect(0, top, W, street - top)
  }

  function drawBuilding(b, street) {
    const cx = toScreenX(b.x)
    const half = (b.w / 2) * scale
    if (cx + half < -20 || cx - half > W + 20) return

    if (!paintFromCache(b, cx, street)) {
      // Too tall to cache: draw only the floors on screen
      const fh = FLOOR_H * scale
      const from = Math.max(0, Math.floor((street - H) / fh) - 2)
      const to = Math.min(b.shown, Math.ceil(street / fh) + 1)
      ctx.save()
      ctx.translate(cx, street)
      ctx.scale(scale, scale)
      paintBuilding(ctx, b, from, to)
      ctx.restore()
    }

    ctx.save()
    ctx.translate(cx, street)
    ctx.scale(scale, scale)
    // The newest floor flashes white as it lands
    if (b.flash > 0 && b.shown > 0) {
      ctx.save()
      ctx.translate(0, -floorCenter(b.shown - 1))
      drawFloorBody(ctx, floorLook(b, b.shown - 1), FLOOR_H, WIN_SIZE, b.flash)
      ctx.restore()
    }
    // The next floor drops in from above, speeding up like it's falling
    if (b.drop > 0) {
      const land = floorCenter(b.shown)
      const y = land + FLOOR_H * 2.5 * (1 - b.drop * b.drop)
      ctx.save()
      ctx.globalAlpha = Math.min(1, b.drop * 3)
      ctx.translate(0, -y)
      drawFloorBody(ctx, floorLook(b, b.shown), FLOOR_H, WIN_SIZE, 0)
      ctx.restore()
    }
    ctx.restore()
  }

  // Standing floors are drawn once into their own canvas (their soft shadows are the
  // slow part) and redrawn only when a floor lands or the zoom settles somewhere new
  function paintFromCache(b, cx, street) {
    const pad = 24 // world px around the building for shadows and glow
    const settled = Math.abs(scale - targetScale) < targetScale * 0.002
    let c = b.cache
    const ratio = c ? scale / c.scale : 1
    const stale =
      !c ||
      c.floors !== b.shown ||
      (settled && Math.abs(ratio - 1) > 0.01) ||
      Math.abs(ratio - 1) > 0.3

    if (stale) {
      const cw = Math.ceil((b.w + pad * 2) * scale * dpr)
      const ch = Math.ceil(((b.shown + 1) * FLOOR_H + pad * 2) * scale * dpr)
      if (ch > CACHE_MAX_PX) {
        b.cache = null
        return false
      }
      const canvasEl = c?.canvas || document.createElement('canvas')
      canvasEl.width = cw
      canvasEl.height = ch
      const g = canvasEl.getContext('2d')
      const k = scale * dpr
      g.setTransform(k, 0, 0, k, (b.w / 2 + pad) * k, ch - pad * k)
      paintBuilding(g, b, 0, b.shown)
      c = b.cache = { canvas: canvasEl, scale, floors: b.shown, pad }
    }

    const r = scale / c.scale
    const dw = (c.canvas.width / dpr) * r
    const dh = (c.canvas.height / dpr) * r
    ctx.drawImage(c.canvas, cx - (b.w / 2 + c.pad) * scale, street + c.pad * scale - dh, dw, dh)
    return true
  }

  // ---------- roofs ----------

  // The building's own roof: a water tank, a pointed top, an antenna or a garden
  function drawRoofShape(b, street, time) {
    const cx = toScreenX(b.x)
    const top = roofY(b, street)
    if (top - ROOF_MAX * scale > H || top < -10) return

    ctx.save()
    ctx.translate(cx, top)
    ctx.scale(scale, scale)
    paintRoof(ctx, b, time, reduceMotion)
    ctx.restore()
  }

  // ---------- name signs ----------

  // Place every sign above its roof. One that would cover a neighbor's first slides
  // sideways (staying over its own roof), and only climbs if that isn't enough.
  // Tallest first, so the lower-ranked sign is the one that moves.
  function layoutSigns(street) {
    const placed = []
    let high = 0
    let natural = 0
    buildings.forEach((b, rank) => {
      const cx = toScreenX(b.x)
      const roof = roofY(b, street)
      const bw = b.w * scale
      const slot = (b.w + GAP) * scale
      const padX = Math.round(nameFont * 0.6)

      ctx.font = `700 ${nameFont}px ${FONT}`
      const maxW = Math.max(slot * 1.7, nameFont * 4)
      const text = fitText(b.name, maxW - padX * 2)
      const w = Math.max(ctx.measureText(text).width + padX * 2, Math.min(bw, nameFont * 3))

      const crowned = rank === 0 && b.score > 0
      const you = b.uid === youUid
      const above = crowned || you ? ROOF_ITEM_PX : 4
      const below = badgeFont * 0.9 + 4
      let bottom = roof - ROOF_H[b.roof] * scale - 8
      const onScreen = (x) => Math.min(Math.max(x, w / 2 + 8), W - w / 2 - 8)
      let sx = onScreen(cx) // sign center
      const box = () => ({ l: sx - w / 2 - 6, r: sx + w / 2 + 6, t: bottom - signH - above, b: bottom + below })
      natural = Math.max(natural, street - box().t)

      // Ways out of a clash, in order: slide out over the gap, drop onto the top of
      // its own facade, and only then climb above the other sign
      const reach = slot * 0.5
      const lowest = roof + signH * 1.2
      let climbed = false
      for (let tries = 0; tries < 40; tries++) {
        const me = box()
        const hit = placed.find((p) => me.l < p.box.r && me.r > p.box.l && me.t < p.box.b && me.b > p.box.t)
        if (!hit) break
        const dx = sx >= (hit.box.l + hit.box.r) / 2 ? hit.box.r - me.l : hit.box.l - me.r
        const down = hit.box.b + signH + above + 2
        if (Math.abs(sx + dx - cx) <= reach && onScreen(sx + dx) === sx + dx) sx += dx
        else if (!climbed && down <= lowest) bottom = down
        else {
          bottom = hit.box.t - below - 2
          climbed = true
        }
      }

      const s = { b, cx, sx, roof, bw, w, text, bottom, crowned, you, box: box() }
      placed.push(s)
      high = Math.max(high, street - s.box.t)
    })
    extent = high
    lifted = Math.max(0, high - Math.max(natural, 0))
    return placed
  }

  // Two slim posts from a sign down to its roof, kept where sign and roof overlap
  function drawPosts(s) {
    const l = Math.max(s.sx - s.w / 2, s.cx - s.bw / 2)
    const r = Math.min(s.sx + s.w / 2, s.cx + s.bw / 2)
    ctx.fillStyle = '#3d3151'
    for (const x of [l + (r - l) * 0.2, l + (r - l) * 0.8]) ctx.fillRect(x - 2, s.bottom - 4, 4, s.roof - s.bottom + 2)
  }

  function drawSign(s, time) {
    const { b, sx: cx, w, bottom, text } = s
    const top = bottom - signH
    if (bottom < -ROOF_ITEM_PX || top > H) return
    const c = b.color

    // Dark panel with a neon edge in the building's color
    ctx.save()
    ctx.shadowColor = c.base
    ctx.shadowBlur = 22
    ctx.fillStyle = 'rgba(36, 16, 74, 0.94)'
    roundedRect(ctx, cx - w / 2, top, w, signH, signH * 0.3)
    ctx.fill()
    ctx.restore()
    ctx.lineWidth = 3
    ctx.strokeStyle = c.ledge
    roundedRect(ctx, cx - w / 2, top, w, signH, signH * 0.3)
    ctx.stroke()

    // The name, glowing
    ctx.save()
    ctx.font = `700 ${nameFont}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = s.you ? 'rgba(255, 208, 70, 0.95)' : c.base
    ctx.shadowBlur = 14
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, cx, top + signH * 0.5 + 1)
    ctx.restore()

    // Small floor-count badge hanging under the sign
    const count = `${b.shown} ${b.shown === 1 ? 'floor' : 'floors'}`
    ctx.font = `700 ${badgeFont}px ${FONT}`
    const bw = ctx.measureText(count).width + badgeFont * 1.2
    const bh = badgeFont * 1.5
    const by = bottom - bh * 0.4
    ctx.fillStyle = '#ffd046'
    roundedRect(ctx, cx - bw / 2, by, bw, bh, bh / 2)
    ctx.fill()
    ctx.fillStyle = '#4a1a78'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(count, cx, by + bh / 2 + 0.5)

    if (s.crowned) drawCrown(s.you ? cx + Math.min(18, w * 0.15) : cx, top, Math.min(46, Math.max(28, signH * 0.95)), time)
    if (s.you) drawBeacon(s.crowned ? cx - w / 2 + Math.max(14, w * 0.12) : cx, top, time)
  }

  function fitText(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text
    let t = text
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
    return `${t.trimEnd()}…`
  }

  // A golden crown sitting at (cx, y), s px wide
  function drawCrown(cx, y, s, time) {
    const h = s * 0.8
    const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time / 500)

    const glow = ctx.createRadialGradient(cx, y - h * 0.5, s * 0.1, cx, y - h * 0.5, s * 1.1)
    glow.addColorStop(0, `rgba(255, 214, 90, ${(0.45 + pulse * 0.2).toFixed(2)})`)
    glow.addColorStop(1, 'rgba(255, 214, 90, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(cx - s * 1.2, y - h * 0.5 - s * 1.2, s * 2.4, s * 2.4)

    const l = cx - s / 2
    const r = cx + s / 2
    const base = y - 2
    ctx.beginPath()
    ctx.moveTo(l, base)
    ctx.lineTo(l, base - h * 0.78)
    ctx.lineTo(cx - s * 0.25, base - h * 0.42)
    ctx.lineTo(cx, base - h)
    ctx.lineTo(cx + s * 0.25, base - h * 0.42)
    ctx.lineTo(r, base - h * 0.78)
    ctx.lineTo(r, base)
    ctx.closePath()
    const gold = ctx.createLinearGradient(0, base - h, 0, base)
    gold.addColorStop(0, '#fff0a0')
    gold.addColorStop(0.5, '#ffd046')
    gold.addColorStop(1, '#e0a51f')
    ctx.fillStyle = gold
    ctx.fill()
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2
    ctx.strokeStyle = '#b87a10'
    ctx.stroke()

    // Band with gems, and pearls on the tips
    ctx.fillStyle = 'rgba(184, 122, 16, 0.35)'
    ctx.fillRect(l + 1, base - h * 0.28, s - 2, h * 0.14)
    const gems = ['#8ec3e6', '#d9695a', '#9fc39b']
    gems.forEach((color, i) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(cx + (i - 1) * s * 0.28, base - h * 0.21, Math.max(2, s * 0.07), 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.fillStyle = '#fff8d6'
    for (const [px, py] of [[l, base - h * 0.78], [cx, base - h], [r, base - h * 0.78]]) {
      ctx.beginPath()
      ctx.arc(px, py, Math.max(2, s * 0.07), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // A little mast with a blinking light and a YOU sign, standing at (x, y)
  function drawBeacon(x, y, time) {
    const mastTop = y - 34
    ctx.fillStyle = '#3d3151'
    ctx.fillRect(x - 1.5, mastTop, 3, 34)

    // YOU sign on the mast
    ctx.font = `700 11px ${FONT}`
    const tw = ctx.measureText('YOU').width
    const pw = tw + 12
    const ph = 16
    const py = y - 22
    ctx.fillStyle = '#ffd046'
    roundedRect(ctx, x - pw / 2, py, pw, ph, 8)
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#4a1a78'
    ctx.stroke()
    ctx.fillStyle = '#4a1a78'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('YOU', x, py + ph / 2 + 0.5)

    // Blinks on and off; with reduced motion it glows gently instead
    const on = reduceMotion ? 0.75 + 0.25 * Math.sin(time / 900) : (time % 1000) < 600 ? 1 : 0.15
    const glow = ctx.createRadialGradient(x, mastTop, 1, x, mastTop, 16)
    glow.addColorStop(0, `rgba(255, 90, 120, ${(0.85 * on).toFixed(2)})`)
    glow.addColorStop(1, 'rgba(255, 90, 120, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(x - 16, mastTop - 16, 32, 32)
    ctx.fillStyle = on > 0.5 ? '#ff5a78' : '#7a2c45'
    ctx.beginPath()
    ctx.arc(x, mastTop, 4.5, 0, Math.PI * 2)
    ctx.fill()
    if (on > 0.5) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.beginPath()
      ctx.arc(x - 1.3, mastTop - 1.3, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ---------- ambient ----------

  // Two soft beams from lamps on the street, crossing gently over the YOU building
  function drawSpotlight(b, street, time) {
    const cx = toScreenX(b.x)
    const half = (b.w / 2) * scale
    const reach = Math.max(street - roofY(b, street) + 160, 260)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const pool = ctx.createRadialGradient(cx, street, 4, cx, street, half * 1.8)
    pool.addColorStop(0, 'rgba(255, 236, 190, 0.28)')
    pool.addColorStop(1, 'rgba(255, 236, 190, 0)')
    ctx.fillStyle = pool
    ctx.fillRect(cx - half * 2, street - half * 1.8, half * 4, half * 2.2)

    for (const side of [-1, 1]) {
      const sway = reduceMotion ? 0 : Math.sin(time / 1900 + side * 1.3) * 0.06
      const bx = cx + side * (half + 14)
      const tx = bx - side * reach * 0.16 + sway * reach
      const spread = reach * 0.1
      const g = ctx.createLinearGradient(0, street, 0, street - reach)
      g.addColorStop(0, 'rgba(255, 240, 205, 0.26)')
      g.addColorStop(1, 'rgba(255, 240, 205, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(bx - 4, street)
      ctx.lineTo(tx - spread, street - reach)
      ctx.lineTo(tx + spread, street - reach)
      ctx.lineTo(bx + 4, street)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()

    // The lamps themselves
    for (const side of [-1, 1]) {
      const bx = cx + side * (half + 14)
      ctx.fillStyle = '#3d3151'
      roundedRect(ctx, bx - 6, street - 7, 12, 8, 2)
      ctx.fill()
      ctx.fillStyle = '#fff6d0'
      ctx.beginPath()
      ctx.arc(bx, street - 7, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawCars(street) {
    const len = carLength()
    const lanes = [street + ground * 0.5, street + ground * 0.84]
    for (const c of cars) drawCar(c, lanes[c.lane], len)
  }

  // A small rounded car facing its direction of travel, headlights on
  function drawCar(c, y, L) {
    if (y - L > H) return
    const h = L * 0.3
    ctx.save()
    ctx.translate(c.x, y)
    ctx.scale(c.dir, 1)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const beam = ctx.createLinearGradient(L / 2, 0, L / 2 + L * 1.5, 0)
    beam.addColorStop(0, 'rgba(255, 236, 170, 0.4)')
    beam.addColorStop(1, 'rgba(255, 236, 170, 0)')
    ctx.fillStyle = beam
    ctx.beginPath()
    ctx.moveTo(L / 2 - 2, -h * 0.66)
    ctx.lineTo(L / 2 + L * 1.5, -h * 1.15)
    ctx.lineTo(L / 2 + L * 1.5, h * 0.25)
    ctx.lineTo(L / 2 - 2, -h * 0.5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = c.color.trim
    ctx.beginPath()
    ctx.moveTo(-L * 0.3, -h)
    ctx.lineTo(-L * 0.18, -h * 1.6)
    ctx.lineTo(L * 0.14, -h * 1.6)
    ctx.lineTo(L * 0.28, -h)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 214, 140, 0.6)'
    ctx.beginPath()
    ctx.moveTo(-L * 0.22, -h * 1.05)
    ctx.lineTo(-L * 0.14, -h * 1.48)
    ctx.lineTo(L * 0.11, -h * 1.48)
    ctx.lineTo(L * 0.2, -h * 1.05)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.color.base
    roundedRect(ctx, -L / 2, -h * 1.05, L, h * 0.78, h * 0.3)
    ctx.fill()
    ctx.fillStyle = c.color.ledge
    ctx.fillRect(-L / 2 + 4, -h * 1.02, L - 8, 2)

    ctx.fillStyle = '#1f1b24'
    for (const wx of [-L * 0.28, L * 0.28]) {
      ctx.beginPath()
      ctx.arc(wx, -h * 0.26, h * 0.26, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#8a7fa0'
    for (const wx of [-L * 0.28, L * 0.28]) {
      ctx.beginPath()
      ctx.arc(wx, -h * 0.26, h * 0.1, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#fff6d0'
    ctx.beginPath()
    ctx.arc(L / 2 - 2.5, -h * 0.66, 2.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff4d6d'
    ctx.fillRect(-L / 2, -h * 0.78, 3, 4)
    ctx.restore()
  }

  function drawPlane(time) {
    const { x, dir } = plane
    const y = plane.y + scroll * 0.3
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(dir, 1)
    ctx.fillStyle = 'rgba(30, 14, 60, 0.75)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 13, 2.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-2, 0)
    ctx.lineTo(-7, -8)
    ctx.lineTo(-4, -8)
    ctx.lineTo(4, 0)
    ctx.moveTo(-10, 0)
    ctx.lineTo(-13, -5)
    ctx.lineTo(-11, -5)
    ctx.lineTo(-7, 0)
    ctx.fill()
    ctx.restore()

    // Red and green wing lights, and a white strobe
    const lights = [
      [x - 5 * dir, y - 7, '#ff5a78'],
      [x + 2 * dir, y + 2, '#7dffa8'],
    ]
    for (const [lx, ly, color] of lights) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(lx, ly, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    if (time % 1200 < 120) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9)
      g.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
      g.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = g
      ctx.fillRect(x - 9, y - 9, 18, 18)
    }
  }

  // ---------- empty lots ----------

  // A soft, faded outline of the building that could stand here
  function drawLot(l, street) {
    const cx = toScreenX(l.x)
    const w = l.w * scale
    const h = FLOOR_H * LOT_FLOORS * scale
    ctx.save()
    ctx.fillStyle = 'rgba(138, 85, 132, 0.5)'
    roundedRect(ctx, cx - w / 2 - 6, street - 5, w + 12, 8, 4)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
    roundedRect(ctx, cx - w / 2, street - h, w, h, 10)
    ctx.fill()
    ctx.setLineDash([7, 7])
    ctx.lineWidth = 2
    ctx.strokeStyle = l.first ? 'rgba(255, 224, 138, 0.55)' : 'rgba(255, 235, 250, 0.3)'
    ctx.stroke()
    ctx.restore()
  }

  // A small sign on a post in the lot
  function drawLotSign(l, street) {
    const cx = toScreenX(l.x)
    const w = l.w * scale
    const h = FLOOR_H * LOT_FLOORS * scale
    const text = l.first ? 'Be the first to build!' : 'Your building here?'
    const size = l.first ? nameFont : Math.max(12, Math.round(nameFont * 0.55))
    ctx.font = `700 ${size}px ${FONT}`

    // Two lines when one would spill far past the lot
    const room = Math.max(w + GAP * scale * 0.8, size * 5)
    let lines = [text]
    if (ctx.measureText(text).width + size > room) {
      const words = text.split(' ')
      const mid = Math.ceil(words.length / 2)
      lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
    }
    const tw = Math.max(...lines.map((t) => ctx.measureText(t).width))
    const pad = size * 0.6
    const sw = tw + pad * 2
    const sh = lines.length * size * 1.2 + pad * 0.9
    const bottom = street - Math.max(h * 0.45, 26)
    const top = bottom - sh

    ctx.fillStyle = 'rgba(123, 90, 142, 0.8)'
    ctx.fillRect(cx - 2, bottom - 2, 4, street - bottom + 2)
    ctx.save()
    if (l.first) {
      ctx.shadowColor = 'rgba(255, 208, 70, 0.7)'
      ctx.shadowBlur = 22
    }
    ctx.fillStyle = l.first ? '#ffd046' : 'rgba(255, 245, 230, 0.78)'
    roundedRect(ctx, cx - sw / 2, top, sw, sh, Math.min(12, sh * 0.3))
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#4a1a78'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((t, i) => ctx.fillText(t, cx, top + pad * 0.45 + size * 1.2 * (i + 0.5)))
  }

  // ---------- input ----------

  function onWheel(e) {
    if (!maxScroll) return
    e.preventDefault()
    scrollBy(-e.deltaY)
  }

  function onPointerDown(e) {
    if (!maxScroll) return
    drag = { y: e.clientY, scroll }
    canvas.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!drag) return
    scroll = Math.min(Math.max(0, drag.scroll + (e.clientY - drag.y)), maxScroll)
  }

  function onPointerUp() {
    drag = null
  }

  function onKeyDown(e) {
    const steps = { ArrowUp: 60, ArrowDown: -60, PageUp: H * 0.8, PageDown: -H * 0.8 }
    if (e.key === 'Home') scroll = maxScroll
    else if (e.key === 'End') scroll = 0
    else if (steps[e.key]) scrollBy(steps[e.key])
    else return
    e.preventDefault()
  }

  // ---------- loop ----------

  function frame(time) {
    const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0
    lastTime = time
    update(dt)
    draw(time)
    rafId = requestAnimationFrame(frame)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()
  // Also catches devicePixelRatio changes (zoom, moving to another screen) that don't resize the box
  window.addEventListener('resize', resize)

  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('keydown', onKeyDown)
  rafId = requestAnimationFrame(frame)

  return {
    setPlayers,
    // Back down to the street
    toGround() {
      scroll = 0
    },
    destroy() {
      cancelAnimationFrame(rafId)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('keydown', onKeyDown)
    },
  }
}
