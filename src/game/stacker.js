// Skyline tower stacker. Plain canvas, no images, no React.
//
// A crane at the top of the screen swings each new floor on a rope. Cutting the
// rope drops the floor onto the tower. Whatever hangs past the edge of the floor
// below is sliced off, and the rest sets the width for every floor after it.
// Off-center landings make the tower sway; a complete miss ends the run.
//
// World coordinates: x = 0 is the middle of the canvas, y goes UP from the
// street. Floor n sits with its bottom at y = n * blockH. The lobby (floor -1)
// is the foundation every run starts on. The crane lives in screen coordinates
// so it always stays at the top.

import { submitScore } from '../data'
import {
  LOBBY,
  PALETTE,
  drawFloorBody,
  drawLobby,
  drawMoon,
  drawSky,
  drawStreet,
  layoutWindows,
  makeSkyline,
  makeStars,
  renderSkyline,
  roundedRect,
  skylineHeight,
  windowMetrics,
} from './look'

const GRAVITY = 1800 // px/s², for falling floors and the pendulum
const PERFECT_TOLERANCE = 6 // px from lined up that counts as PERFECT
const PERFECT_STREAK = 3 // this many PERFECTs in a row...
const GROW_BACK = 0.1 // ...grows the next floor by this share of the starting width

// Pendulum
const SWING_DAMPING = 0.15 // 1/s: natural energy loss
const SWING_PUMP = 12 // how hard the crane nudges the swing back to its target width
const SWING_AMP = 0.6 // rad: starting swing width
const SWING_AMP_STEP = 0.06 // wider every 5 floors...
const SWING_AMP_MAX = 1.0
const SWING_SPEED_STEP = 0.12 // ...and faster (more effective gravity) every 5 floors
const SWING_SPEED_MAX = 2.2
const RELEASE_CARRY = 0.15 // share of the swing's sideways speed the floor keeps when cut
const HOOK_DROP = 16 // px of sling between the hook and the floor's roof

// Tower sway: a damped spring on how far the tower leans
const SWAY_FREQ = 5.5 // rad/s
const SWAY_DAMPING = 1.1 // 1/s
const SWAY_KICK = 3.4 // how hard an off-center landing pushes the tower
const PERFECT_CALM = 0.35 // a PERFECT keeps only this much of the current sway

// Juice: purely visual, never affects the rules
const SHAKE_LAND = 3 // px of camera shake on a normal landing...
const SHAKE_LAND_MAX = 6 // ...up to this for a very off-center one
const SHAKE_DECAY = 9 // 1/s
const ROPE_WOBBLE = 16 // px: how far the cut rope whips sideways
const ROPE_WOBBLE_FREQ = 26 // rad/s

export function createStacker(canvas, { onChange, onPerfect } = {}) {
  const ctx = canvas.getContext('2d')
  const container = canvas.parentElement
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  let W = 0 // canvas size in CSS px
  let H = 0
  let blockH = 30
  let ground = 0 // px of street below the lobby
  let startW = 0 // width of the first floor in a run
  let floorW = 0 // width of the next floor the crane picks up
  let perfectStreak = 0
  let ropeLen = 0
  let pivotY = 0 // screen y of the crane trolley

  let phase = 'ready' // ready → playing → falling → over
  let result = null // game over save: null while saving, then { newBest, best } or { error }
  let runId = 0 // bumps on every reset so a slow save can't land on the next run
  let tower = [] // { x, w, color, windows, flash }
  let hang = null // { theta, omega, len, floor } floor swinging on the rope
  let spawnTimer = 0 // delay before the next floor is lowered
  let drops = [] // { cx, cy, vx, vy, tilt, spin, floor, contact } falling floors and cut pieces
  let loser = null // the drop that ended the run; game over waits for it to leave the screen
  let sparkles = [] // { x, y, vx, vy, life, max, size }
  let dust = [] // { x, y, vx, vy, r, life, max }
  let floaters = [] // { text, x, y, life, max } screen-space words that drift up
  let shake = 0 // px, decays over time
  let snap = null // { len, theta, t } the cut rope recoiling up to the trolley
  let lean = 0 // tower sway: sideways px per px of height
  let leanVel = 0
  let camY = 0
  let stars = []
  let skyline = []
  let skylineCanvas = null // pre-rendered at low resolution so it looks soft and blurry
  let winSize = 20 // window square size, scales with floor height
  let winGap = 34 // px between window columns

  let rafId = 0
  let lastTime = 0

  // ---------- setup ----------

  function resize() {
    const rect = container.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = Math.max(1, rect.width)
    H = Math.max(1, rect.height)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ground = Math.round(H * 0.16)
    pivotY = 44
    ropeLen = Math.round(Math.min(200, Math.max(120, H * 0.24)))
    if (!tower.length) reset()
    else skylineCanvas = renderSkyline(skyline, W, H)
  }

  function reset() {
    blockH = Math.round(Math.min(68, Math.max(44, H / 11)))
    const metrics = windowMetrics(blockH)
    winSize = metrics.winSize
    winGap = metrics.winGap
    startW = Math.round(Math.min(W * 0.42, 190))
    floorW = startW
    perfectStreak = 0
    tower = [{ x: -startW / 2, w: startW, color: LOBBY, windows: [], flash: 0 }]
    hang = null
    drops = []
    loser = null
    sparkles = []
    dust = []
    floaters = []
    shake = 0
    snap = null
    lean = 0
    leanVel = 0
    camY = 0
    stars = makeStars()
    skyline = makeSkyline()
    skylineCanvas = renderSkyline(skyline, W, H)
    runId++
    result = null
    setPhase('ready')
    spawnFloor()
  }

  function floors() {
    return tower.length - 1
  }

  function emit() {
    onChange?.({ phase, floors: floors(), result })
  }

  function setPhase(next) {
    phase = next
    emit()
  }

  function saveRun() {
    const id = runId
    submitScore(floors())
      .then((r) => {
        if (id !== runId) return
        result = r
        emit()
      })
      .catch((err) => {
        console.error('Could not save score', err)
        if (id !== runId) return
        result = { error: true }
        emit()
      })
  }

  // A floor's look is decided once, here, and never changes afterwards
  function makeFloor(n) {
    const windows = layoutWindows(floorW, winSize, winGap, Math.random)
    return { w: floorW, color: PALETTE[n % PALETTE.length], windows }
  }

  function level() {
    return Math.floor(floors() / 5)
  }

  function swingAmp() {
    return Math.min(SWING_AMP_MAX, SWING_AMP + SWING_AMP_STEP * level())
  }

  function swingGravity() {
    return GRAVITY * Math.min(SWING_SPEED_MAX, 1 + SWING_SPEED_STEP * level())
  }

  // Lower a new floor from the crane, starting out at one side of its swing
  function spawnFloor() {
    const side = floors() % 2 === 0 ? -1 : 1
    hang = { theta: side * swingAmp(), omega: 0, len: ropeLen * 0.35, floor: makeFloor(floors()) }
    snap = null
  }

  // ---------- positions ----------

  function toScreenX(x) {
    return W / 2 + x
  }

  function toScreenY(y) {
    return H - ground - (y - camY)
  }

  function toWorldY(sy) {
    return H - ground + camY - sy
  }

  // How far the swaying tower is pushed sideways at a given height
  function swayAt(y) {
    return lean * Math.max(0, y)
  }

  function topY() {
    return floors() * blockH
  }

  // Center x of the top of the tower as it's drawn right now, sway included
  function topCenterX() {
    const top = tower[tower.length - 1]
    return top.x + top.w / 2 + swayAt(topY() - blockH / 2)
  }

  // Screen position of the hook at the end of the rope
  function hookPos() {
    return {
      x: W / 2 + hang.len * Math.sin(hang.theta),
      y: pivotY + hang.len * Math.cos(hang.theta),
    }
  }

  // ---------- input ----------

  function cutRope() {
    if (phase === 'falling' || phase === 'over' || !hang) return
    if (phase === 'ready') setPhase('playing')

    const hook = hookPos()
    const speed = hang.len * hang.omega
    drops.push({
      cx: hook.x - W / 2,
      cy: toWorldY(hook.y + HOOK_DROP + blockH / 2),
      vx: speed * Math.cos(hang.theta) * RELEASE_CARRY,
      vy: speed * Math.sin(hang.theta),
      tilt: 0,
      spin: 0,
      floor: hang.floor,
      contact: true, // still able to land on the tower
    })
    snap = { len: hang.len, theta: hang.theta, t: 0 }
    hang = null
    // Wait for this floor to land (land() restarts the timer), so the next floor gets the new width
    spawnTimer = Infinity
  }

  function onKeyDown(e) {
    if (e.code !== 'Space' && e.key !== ' ') return
    const tag = e.target?.tagName
    // Let focused buttons and text boxes handle Space themselves
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    e.preventDefault()
    if (e.repeat) return
    cutRope()
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    cutRope()
  }

  // ---------- landing ----------

  function land(d) {
    const top = tower[tower.length - 1]
    const y = topY()
    const sway = swayAt(y + blockH / 2) // the new floor's own sway, so it's stored where it landed
    const topLeft = topCenterX() - top.w / 2
    const topRight = topLeft + top.w
    const w = d.floor.w
    const left = d.cx - w / 2
    const right = left + w
    const dx = d.cx - topCenterX()

    // Not touching the tower at all: keep falling past it
    if (Math.min(right, topRight) - Math.max(left, topLeft) <= 0) {
      d.contact = false
      endRun(d)
      return
    }

    drops = drops.filter((o) => o !== d)
    const perfect = Math.abs(dx) <= PERFECT_TOLERANCE
    let placed

    if (perfect) {
      // Snap onto the floor below and keep the full width
      const center = top.x + top.w / 2
      placed = { ...d.floor, x: center - w / 2, flash: 1 }
    } else {
      // Slice off whatever hangs past either edge of the floor below
      const keepLeft = Math.max(left, topLeft)
      const keepRight = Math.min(right, topRight)
      if (left < keepLeft) sliceOff(d, left, keepLeft, -1)
      if (right > keepRight) sliceOff(d, keepRight, right, 1)
      placed = { ...cutFloor(d.floor, keepLeft - left, keepRight - keepLeft), x: keepLeft - sway, flash: 0 }
    }
    tower.push(placed)

    // The next floor on the crane matches this one, and a PERFECT streak grows it back a little
    perfectStreak = perfect ? perfectStreak + 1 : 0
    floorW = placed.w
    if (perfect && perfectStreak % PERFECT_STREAK === 0) {
      floorW = Math.min(startW, floorW + Math.round(startW * GROW_BACK))
    }

    // The further off-center, the harder the tower gets pushed
    leanVel += (SWAY_KICK * dx) / Math.max(y, blockH * 4)

    // Dust kicks out from both bottom corners, and the camera gives a little bump
    const cx = placed.x + placed.w / 2 + sway
    puffDust(cx - placed.w / 2, y, 7, -1)
    puffDust(cx + placed.w / 2, y, 7, 1)
    shake = Math.max(shake, Math.min(SHAKE_LAND_MAX, SHAKE_LAND + Math.abs(dx) * 0.04))

    if (perfect) {
      lean *= PERFECT_CALM
      leanVel *= PERFECT_CALM
      burstSparkles(cx, y + blockH / 2)
      floaters.push({ text: 'PERFECT!', x: toScreenX(cx), y: toScreenY(y + blockH) - 18, life: 1.1, max: 1.1 })
      onPerfect?.()
    }

    emit()
    spawnTimer = 0.3
  }

  // The part of a floor from `from` to `from + w` (px from its left edge). Windows keep
  // their exact spots; ones on the cut-away part are dropped, and one straddling the cut
  // is clipped when drawn.
  function cutFloor(floor, from, w) {
    const winW = Math.round(winSize * 0.9) + 4 // window plus its frame
    const windows = floor.windows
      .map((win) => ({ ...win, x: win.x - from }))
      .filter((win) => win.x - 2 < w && win.x - 2 + winW > 0)
    return { ...floor, w, windows }
  }

  // Send a sliced-off piece (world x from a to b) tumbling away with gravity and a little spin
  function sliceOff(d, a, b, side) {
    drops.push({
      cx: (a + b) / 2,
      cy: d.cy,
      vx: side * (50 + Math.random() * 50),
      vy: 60 + Math.random() * 40,
      tilt: 0,
      spin: side * (2 + Math.random() * 2),
      floor: cutFloor(d.floor, a - (d.cx - d.floor.w / 2), b - a),
      contact: false,
    })
    puffDust(side < 0 ? b : a, topY(), 5, side)
  }

  function endRun(d) {
    loser = d
    phase = 'falling'
  }

  function burstSparkles(x, y) {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 120 + Math.random() * 260
      const max = 0.6 + Math.random() * 0.5
      sparkles.push({
        x: x + (Math.random() - 0.5) * startW,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.7 + 120,
        life: max,
        max,
        size: 4 + Math.random() * 6,
      })
    }
  }

  function puffDust(x, y, count, side) {
    for (let i = 0; i < count; i++) {
      const max = 0.45 + Math.random() * 0.35
      dust.push({
        x: x + side * Math.random() * 6,
        y: y + Math.random() * 4,
        vx: side * (40 + Math.random() * 90),
        vy: 10 + Math.random() * 50,
        r: 4 + Math.random() * 5,
        life: max,
        max,
      })
    }
  }

  // ---------- loop ----------

  function update(dt) {
    updateSwing(dt)
    updateDrops(dt)

    // Tower sway: damped spring pulling the lean back to straight
    leanVel += (-SWAY_FREQ * SWAY_FREQ * lean - 2 * SWAY_DAMPING * leanVel) * dt
    lean += leanVel * dt
    const maxLean = (startW * 0.6) / Math.max(topY(), blockH * 4)
    if (Math.abs(lean) > maxLean) {
      lean = Math.sign(lean) * maxLean
      leanVel *= 0.5
    }

    for (const t of tower) {
      if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 3)
    }

    for (const s of sparkles) {
      s.vy -= 400 * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.life -= dt
    }
    sparkles = sparkles.filter((s) => s.life > 0)

    for (const p of dust) {
      p.vx *= Math.exp(-dt * 4)
      p.vy *= Math.exp(-dt * 4)
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.r += 16 * dt
      p.life -= dt
    }
    dust = dust.filter((p) => p.life > 0)

    for (const f of floaters) {
      f.y -= 55 * dt
      f.life -= dt
    }
    floaters = floaters.filter((f) => f.life > 0)

    shake *= Math.exp(-dt * SHAKE_DECAY)
    if (shake < 0.1) shake = 0

    // The cut rope springs back up toward the trolley and settles
    if (snap) {
      snap.t += dt
      snap.len += (ropeLen * 0.25 - snap.len) * (1 - Math.exp(-dt * 5))
      snap.theta *= Math.exp(-dt * 4)
    }

    // Keep the top of the tower a little below the hanging floor; the crane stays put on screen
    const hangBottom = pivotY + ropeLen + HOOK_DROP + blockH
    const want = hangBottom + blockH * 1.3
    const target = Math.max(0, want - (H - ground) + topY())
    camY += (target - camY) * (1 - Math.exp(-dt * 4))

    if (phase === 'falling' && loser && isOffScreen(loser)) {
      loser = null
      setPhase('over')
      saveRun()
    }
  }

  function updateSwing(dt) {
    if (!hang) {
      if (phase === 'ready' || phase === 'playing') {
        spawnTimer -= dt
        if (spawnTimer <= 0) spawnFloor()
      }
      return
    }

    // Reel the rope out to full length
    hang.len += (ropeLen - hang.len) * (1 - Math.exp(-dt * 6))

    // Pendulum: gravity + damping, plus a gentle push toward the target width
    // so the swing never dies out
    const w2 = swingGravity() / hang.len
    const cosAmp = Math.cos(hang.theta) - (hang.omega * hang.omega) / (2 * w2)
    const amp = Math.acos(Math.min(1, Math.max(-1, cosAmp)))
    const dir = Math.sign(hang.omega) || -Math.sign(hang.theta) || 1
    const pump = SWING_PUMP * (swingAmp() - amp) * dir
    const accel = -w2 * Math.sin(hang.theta) - SWING_DAMPING * hang.omega + pump
    hang.omega += accel * dt
    hang.theta += hang.omega * dt
  }

  function updateDrops(dt) {
    for (const d of drops) {
      d.vy -= GRAVITY * dt
      d.cx += d.vx * dt
      d.cy += d.vy * dt
      d.tilt += d.spin * dt

      if (d.contact && d.cy - blockH / 2 <= topY()) {
        d.cy = topY() + blockH / 2
        land(d)
      }
    }
    drops = drops.filter((d) => d === loser || !isOffScreen(d))
  }

  function isOffScreen(d) {
    return toScreenY(d.cy) - (d.floor.w + blockH) / 2 > H
  }

  // ---------- drawing ----------

  function draw(time) {
    drawBackdrop(time)

    // Everything in the world shakes; the sky and the crane stay steady
    ctx.save()
    if (shake && !reduceMotion) ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake)
    drawSkyline()
    drawStreet(ctx, toScreenY(-blockH), W, H)

    tower.forEach((t, i) => {
      if (i === 0) {
        drawLobby(ctx, toScreenX(t.x), toScreenY(0), t.w, blockH, t.color)
        return
      }
      const cy = (i - 1) * blockH + blockH / 2
      drawFloor(toScreenX(t.x + t.w / 2 + swayAt(cy)), toScreenY(cy), 0, t, t.flash)
    })

    for (const d of drops) drawFloor(toScreenX(d.cx), toScreenY(d.cy), d.tilt, d.floor, 0)

    drawDust()
    drawSparkles()
    ctx.restore()

    drawCrane()
    drawFloaters()
  }

  function drawDust() {
    for (const p of dust) {
      const a = (p.life / p.max) * 0.55
      ctx.fillStyle = `rgba(245, 232, 255, ${a.toFixed(2)})`
      ctx.beginPath()
      ctx.arc(toScreenX(p.x), toScreenY(p.y), p.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawFloaters() {
    for (const f of floaters) {
      const age = f.max - f.life
      const a = Math.min(1, f.life / 0.35)
      const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.55 : Math.max(1, 1.15 - (age - 0.15) * 1.5)
      ctx.save()
      ctx.globalAlpha = a
      ctx.translate(f.x, f.y)
      ctx.scale(pop, pop)
      ctx.font = `700 ${Math.round(Math.min(44, W * 0.1))}px Fredoka, ui-rounded, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.shadowColor = 'rgba(255, 208, 70, 0.9)'
      ctx.shadowBlur = 18
      ctx.lineWidth = 6
      ctx.strokeStyle = '#d9695a'
      ctx.strokeText(f.text, 0, 0)
      ctx.shadowBlur = 0
      ctx.fillStyle = '#ffffff'
      ctx.fillText(f.text, 0, 0)
      ctx.restore()
    }
  }

  function drawBackdrop(time) {
    // Stars drift down slowly as the camera climbs
    drawSky(ctx, W, H, stars, camY * 0.15, time)
    drawMoon(ctx, W, H, 58) // below the crane arm
  }

  function drawSkyline() {
    if (!skylineCanvas) return
    // Moves at half the camera speed; sits on the street
    const base = toScreenY(-blockH) - camY * 0.5
    const h = skylineHeight(H)
    if (base - h > H) return
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(skylineCanvas, 0, base - h, W, h)
  }

  // Draws a floor centered on (cx, cy) in screen px, turned by tilt (clockwise)
  function drawFloor(cx, cy, tilt, floor, flash) {
    const diag = floor.w / 2 + blockH
    if (cy - diag > H || cy + diag < 0) return
    ctx.save()
    ctx.translate(cx, cy)
    if (tilt) ctx.rotate(tilt)
    drawFloorBody(ctx, floor, blockH, winSize, flash)
    ctx.restore()
  }

  function drawSparkles() {
    for (const s of sparkles) {
      const a = s.life / s.max
      const x = toScreenX(s.x)
      const y = toScreenY(s.y)
      const r = s.size * (0.5 + a * 0.5)
      ctx.fillStyle = `rgba(255, 245, 190, ${a.toFixed(2)})`
      ctx.beginPath()
      // Four-point star
      ctx.moveTo(x, y - r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.quadraticCurveTo(x, y, x, y + r)
      ctx.quadraticCurveTo(x, y, x - r, y)
      ctx.quadraticCurveTo(x, y, x, y - r)
      ctx.fill()
    }
  }

  function drawCrane() {
    // Yellow lattice arm with black chords across the top of the screen
    const top = 8
    const bottom = 30
    ctx.fillStyle = '#1f1b24'
    ctx.fillRect(0, top, W, 4)
    ctx.fillRect(0, bottom - 4, W, 4)
    ctx.strokeStyle = '#ffc21a'
    ctx.lineWidth = 3.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let x = -12, up = true; x < W + 24; x += 22, up = !up) {
      if (x === -12) ctx.moveTo(x, up ? top + 3 : bottom - 3)
      else ctx.lineTo(x, up ? top + 3 : bottom - 3)
    }
    ctx.stroke()
    ctx.fillStyle = '#ffc21a'
    ctx.fillRect(0, top + 1, W, 2)
    ctx.fillRect(0, bottom - 3, W, 2)

    // Trolley: black box with yellow hazard stripes
    const tx = W / 2
    const th = pivotY - bottom + 4
    ctx.save()
    roundedRect(ctx, tx - 20, bottom - 2, 40, th, 4)
    ctx.fillStyle = '#ffc21a'
    ctx.fill()
    ctx.clip()
    ctx.fillStyle = '#1f1b24'
    for (let i = -3; i < 6; i++) {
      ctx.beginPath()
      ctx.moveTo(tx - 20 + i * 10, bottom - 2 + th)
      ctx.lineTo(tx - 20 + i * 10 + 5, bottom - 2 + th)
      ctx.lineTo(tx - 20 + i * 10 + 5 + th, bottom - 2)
      ctx.lineTo(tx - 20 + i * 10 + th, bottom - 2)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
    ctx.fillStyle = '#1f1b24'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(tx + side * 11, bottom - 2, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    if (snap) {
      // Creak: the freed rope whips side to side as it springs back up
      const wobble = ROPE_WOBBLE * Math.exp(-snap.t * 3.5) * Math.sin(snap.t * ROPE_WOBBLE_FREQ)
      const hx = tx + snap.len * Math.sin(snap.theta)
      const hy = pivotY + snap.len * Math.cos(snap.theta)
      drawRopeAndHook(tx, hx, hy, wobble)
    }

    if (!hang) return

    const hook = hookPos()
    drawRopeAndHook(tx, hook.x, hook.y, 0)

    // Slings from the hook down to the floor's roof corners
    const roof = hook.y + HOOK_DROP
    const half = Math.max(1, hang.floor.w / 2 - 10) // narrow slivers still get two slings, not crossed ones
    ctx.strokeStyle = '#c9ced8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(hook.x - half, roof + 2)
    ctx.lineTo(hook.x - 2, hook.y + 5)
    ctx.lineTo(hook.x + half, roof + 2)
    ctx.stroke()

    drawFloor(hook.x, roof + blockH / 2, 0, hang.floor, 0)
  }

  // Steel rope from the trolley to the hook; bend bows the rope sideways at its middle
  function drawRopeAndHook(tx, hx, hy, bend) {
    const blockTop = hy - 14

    ctx.strokeStyle = '#c9ced8'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(tx, pivotY)
    ctx.quadraticCurveTo((tx + hx) / 2 + bend, (pivotY + blockTop) / 2, hx, blockTop)
    ctx.stroke()

    // Hook block, striped yellow and black
    ctx.save()
    roundedRect(ctx, hx - 8, blockTop, 16, 10, 3)
    ctx.fillStyle = '#ffc21a'
    ctx.fill()
    ctx.clip()
    ctx.fillStyle = '#1f1b24'
    for (let i = -2; i < 4; i++) ctx.fillRect(hx - 8 + i * 6, blockTop, 3, 10)
    ctx.restore()

    // Steel hook
    ctx.strokeStyle = '#8f96a3'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(hx, hy - 4)
    ctx.lineTo(hx, hy + 2)
    ctx.arc(hx - 4, hy + 2, 4, 0, Math.PI * 0.9)
    ctx.stroke()
  }

  function frame(time) {
    const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0
    lastTime = time
    update(dt)
    draw(time)
    rafId = requestAnimationFrame(frame)
  }

  // ---------- start / stop ----------

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  window.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('pointerdown', onPointerDown)
  rafId = requestAnimationFrame(frame)

  return {
    restart() {
      reset()
    },
    destroy() {
      cancelAnimationFrame(rafId)
      observer.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('pointerdown', onPointerDown)
    },
  }
}
