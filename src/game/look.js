// The Skyline look, shared by the game and the City: building colors, windows,
// floors, lobby, sky, moon, far-off skyline and street. Plain canvas, no images.
// Every function draws with the ctx it's given and keeps no state of its own.

// Soft, friendly building colors: brick red, cream, sage green, sky blue, sand.
// Each has a lighter top ledge and a darker bottom trim.
export const PALETTE = [
  { base: '#d9695a', ledge: '#ec8e7f', trim: '#a8483e' },
  { base: '#f2e2c4', ledge: '#fff5e3', trim: '#c9b28c' },
  { base: '#9fc39b', ledge: '#c0ddbb', trim: '#72986f' },
  { base: '#8ec3e6', ledge: '#b5dbf4', trim: '#5f96bf' },
  { base: '#e5c592', ledge: '#f4ddb6', trim: '#b7956a' },
]
export const LOBBY = { base: '#efe2cc', ledge: '#fff6e8', trim: '#7b5a8e' }
export const CURTAINS = ['#ff9eaa', '#9fd3f0', '#c7b0ff', '#a6e3b8']

// Window square size and column spacing for a given floor height
export function windowMetrics(blockH) {
  const winSize = Math.round(blockH * 0.34)
  return { winSize, winGap: Math.round(winSize * 1.75) }
}

// Window columns for a floor of width w. rand() is Math.random or a seeded generator.
// Mostly lit, a few dark, some with curtains drawn.
export function layoutWindows(w, winSize, winGap, rand) {
  const margin = 7
  const cols = Math.max(1, Math.floor((w - 2 * margin - winSize) / winGap) + 1)
  const span = (cols - 1) * winGap + winSize
  const start = (w - span) / 2
  return Array.from({ length: cols }, (_, i) => {
    const roll = rand()
    return {
      x: start + i * winGap,
      kind: roll < 0.15 ? 'dark' : roll < 0.35 ? 'curtain' : 'lit',
      curtain: CURTAINS[Math.floor(rand() * CURTAINS.length)],
    }
  })
}

// Small integer hash so patterns stay the same every frame
export function hash(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

export function roundedRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ---------- sky ----------

export function makeStars() {
  return Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.3 + 0.3,
    twinkle: Math.random() * Math.PI * 2,
  }))
}

// Deep purple up top, warm pink near the horizon, with twinkling stars.
// drift moves the stars down as the camera climbs.
export function drawSky(ctx, W, H, stars, drift, time) {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#2a0f5c')
  g.addColorStop(0.45, '#5b2a8c')
  g.addColorStop(0.8, '#c4589e')
  g.addColorStop(1, '#ff9eaa')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Stars fade out toward the pink horizon
  for (const s of stars) {
    const y = (((s.y * H + drift) % H) + H) % H
    const fade = Math.max(0, 1 - y / (H * 0.75))
    const a = (0.5 + 0.35 * Math.sin(time / 700 + s.twinkle)) * fade
    if (a <= 0.02) continue
    ctx.fillStyle = `rgba(255, 250, 235, ${a.toFixed(2)})`
    ctx.beginPath()
    ctx.arc(s.x * W, y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
}

// The friendly sleepy moon in the top right corner; top is the px kept clear above it
export function drawMoon(ctx, W, H, top) {
  const r = Math.min(52, Math.max(30, Math.min(W, H) * 0.1))
  const mx = W - r - 22
  const my = r + top

  const glow = ctx.createRadialGradient(mx, my, r * 0.8, mx, my, r * 2.8)
  glow.addColorStop(0, 'rgba(255, 240, 200, 0.45)')
  glow.addColorStop(1, 'rgba(255, 240, 200, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(mx - r * 3, my - r * 3, r * 6, r * 6)

  const disc = ctx.createRadialGradient(mx - r * 0.3, my - r * 0.3, r * 0.1, mx, my, r)
  disc.addColorStop(0, '#fffdf0')
  disc.addColorStop(1, '#ffe7a3')
  ctx.fillStyle = disc
  ctx.beginPath()
  ctx.arc(mx, my, r, 0, Math.PI * 2)
  ctx.fill()

  // Soft craters
  ctx.fillStyle = 'rgba(230, 196, 120, 0.3)'
  for (const [cx, cy, cr] of [[0.42, -0.5, 0.16], [-0.55, 0.45, 0.12], [0.55, 0.42, 0.09]]) {
    ctx.beginPath()
    ctx.arc(mx + cx * r, my + cy * r, cr * r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Friendly sleepy face
  ctx.strokeStyle = '#8a5a3c'
  ctx.lineWidth = Math.max(2, r * 0.07)
  ctx.lineCap = 'round'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(mx + side * r * 0.32, my - r * 0.08, r * 0.13, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(mx, my + r * 0.12, r * 0.28, Math.PI * 0.2, Math.PI * 0.8)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 140, 160, 0.45)'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(mx + side * r * 0.55, my + r * 0.2, r * 0.13, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ---------- far-off skyline ----------

export function makeSkyline() {
  const out = []
  let x = -0.1
  while (x < 1.1) {
    const w = 0.05 + Math.random() * 0.08
    out.push({ x, w, h: 0.08 + Math.random() * 0.22, seed: Math.floor(Math.random() * 1e6) })
    x += w + 0.005
  }
  return out
}

export function skylineHeight(H) {
  return Math.ceil(H * 0.36)
}

// Far-off buildings drawn once at quarter resolution, to be scaled up so they look soft
export function renderSkyline(skyline, W, H) {
  if (typeof document === 'undefined' || !W || !H) return null
  const scale = 0.25
  const h = skylineHeight(H)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(W * scale))
  c.height = Math.max(1, Math.ceil(h * scale))
  const g = c.getContext('2d')
  g.scale(scale, scale)
  for (const b of skyline) {
    const x = b.x * W
    const w = b.w * W
    const bh = b.h * H
    g.fillStyle = 'rgba(96, 44, 128, 0.55)'
    g.fillRect(x, h - bh, w, bh)
    g.fillStyle = 'rgba(255, 214, 140, 0.45)'
    for (let wy = h - bh + 10; wy < h - 8; wy += 14) {
      for (let wx = x + 6; wx < x + w - 8; wx += 12) {
        if (hash(b.seed, Math.round(wx * 7 + wy)) % 100 < 30) g.fillRect(wx, wy, 5, 6)
      }
    }
  }
  return c
}

// ---------- street ----------

// The street from screen y down to the bottom, with glowing lamps along the curb
export function drawStreet(ctx, y, W, H) {
  if (y > H) return
  ctx.fillStyle = '#3b1a5e'
  ctx.fillRect(0, y, W, H - y + 1)
  ctx.fillStyle = '#5a2f82'
  ctx.fillRect(0, y, W, 6)
  for (let x = 24; x < W; x += 70) {
    ctx.fillStyle = 'rgba(255, 214, 120, 0.25)'
    ctx.beginPath()
    ctx.arc(x, y + 18, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffe08a'
    ctx.beginPath()
    ctx.arc(x, y + 18, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ---------- buildings ----------

// A framed window with a sill; its look comes from the floor's fixed pattern
export function drawWindow(ctx, x, y, size, win, frame) {
  const w = Math.round(size * 0.9)
  const h = Math.round(size * 1.1)
  const r = 3

  if (win.kind !== 'dark') {
    ctx.fillStyle = 'rgba(255, 210, 110, 0.35)' // warm glow spilling onto the facade
    roundedRect(ctx, x - 3, y - 3, w + 6, h + 6, r + 3)
    ctx.fill()
  }

  ctx.fillStyle = frame
  roundedRect(ctx, x - 2, y - 2, w + 4, h + 4, r + 1)
  ctx.fill()

  ctx.fillStyle = win.kind === 'dark' ? '#3a3155' : '#ffd978'
  roundedRect(ctx, x, y, w, h, r)
  ctx.fill()

  if (win.kind === 'curtain') {
    ctx.fillStyle = win.curtain
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w * 0.42, y)
    ctx.quadraticCurveTo(x + w * 0.12, y + h * 0.5, x + w * 0.3, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    ctx.moveTo(x + w, y)
    ctx.lineTo(x + w * 0.58, y)
    ctx.quadraticCurveTo(x + w * 0.88, y + h * 0.5, x + w * 0.7, y + h)
    ctx.lineTo(x + w, y + h)
    ctx.closePath()
    ctx.fill()
  }

  // Cross bars and a sill
  ctx.fillStyle = frame
  ctx.fillRect(x + w / 2 - 1, y, 2, h)
  ctx.fillRect(x, y + h * 0.45 - 1, w, 2)
  ctx.fillRect(x - 3, y + h + 1, w + 6, 3)

  if (win.kind === 'lit') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.fillRect(x + 2, y + 2, Math.max(2, w * 0.2), Math.max(2, h * 0.2))
  }
}

// One floor centered on the current origin: { w, color, windows }, flash 0..1 whitens it
export function drawFloorBody(ctx, floor, blockH, winSize, flash) {
  const c = floor.color
  const w = floor.w
  const x = -w / 2
  const inset = 2 // small gap between floors so each reads as its own block
  const y = -blockH / 2 + inset / 2
  const h = blockH - inset
  const r = Math.min(10, blockH * 0.2)

  // Facade with a soft shadow underneath
  ctx.save()
  ctx.shadowColor = 'rgba(40, 10, 70, 0.35)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 5
  ctx.fillStyle = c.base
  roundedRect(ctx, x, y, w, h, r)
  ctx.fill()
  ctx.restore()

  // Lighter top ledge, darker bottom trim, and windows, kept inside the rounded corners
  ctx.save()
  roundedRect(ctx, x, y, w, h, r)
  ctx.clip()
  ctx.fillStyle = c.ledge
  ctx.fillRect(x, y, w, 6)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
  ctx.fillRect(x, y + 6, w, 2)
  ctx.fillStyle = c.trim
  ctx.fillRect(x, y + h - 5, w, 5)

  // Windows are clipped to the facade, so one cut in half by a slice stays cut
  const winH = Math.round(winSize * 1.1)
  const winY = y + 6 + Math.round((h - 11 - winH) / 2)
  for (const win of floor.windows) drawWindow(ctx, x + win.x, winY, winSize, win, c.trim)
  ctx.restore()

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(flash * 0.9).toFixed(2)})`
    roundedRect(ctx, x, y, w, h, r)
    ctx.fill()
  }
}

// The ground-floor lobby with its top-left corner at (x, y)
export function drawLobby(ctx, x, y, w, blockH, c) {
  const r = Math.min(14, blockH * 0.25)

  // Facade: rounded roof corners, square where it meets the street
  ctx.save()
  ctx.shadowColor = 'rgba(40, 10, 70, 0.35)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 5
  ctx.fillStyle = c.base
  roundedRect(ctx, x, y, w, blockH, r)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = c.base
  ctx.fillRect(x, y + blockH / 2, w, blockH / 2)
  ctx.fillStyle = c.ledge
  roundedRect(ctx, x, y, w, 7, Math.min(r, 3.5))
  ctx.fill()
  ctx.fillStyle = c.trim
  ctx.fillRect(x, y + blockH - 7, w, 7)

  // Glass double doors with a warm glow behind them
  const cx = x + w / 2
  const dw = Math.min(blockH * 0.7, w * 0.34)
  const dh = blockH * 0.56
  const dy = y + blockH - 7 - dh
  const halo = ctx.createRadialGradient(cx, dy + dh * 0.6, dw * 0.2, cx, dy + dh * 0.6, dw * 1.3)
  halo.addColorStop(0, 'rgba(255, 210, 110, 0.55)')
  halo.addColorStop(1, 'rgba(255, 210, 110, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(cx - dw * 1.3, dy - dw * 0.8, dw * 2.6, dh + dw * 1.3)

  ctx.fillStyle = '#5b4a6e'
  roundedRect(ctx, cx - dw / 2 - 3, dy - 3, dw + 6, dh + 3, 4)
  ctx.fill()
  for (const side of [-1, 1]) {
    const px = side < 0 ? cx - dw / 2 : cx + 1
    const glass = ctx.createLinearGradient(px, dy, px + dw / 2, dy + dh)
    glass.addColorStop(0, '#fff1c2')
    glass.addColorStop(1, '#ffc862')
    ctx.fillStyle = glass
    ctx.fillRect(px, dy, dw / 2 - 1, dh)
    // Reflection streak and a door handle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.beginPath()
    ctx.moveTo(px + dw * 0.08, dy + dh)
    ctx.lineTo(px + dw * 0.2, dy + dh)
    ctx.lineTo(px + dw * 0.36, dy)
    ctx.lineTo(px + dw * 0.24, dy)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#5b4a6e'
    ctx.fillRect(side < 0 ? cx - 5 : cx + 3, dy + dh * 0.45, 2, dh * 0.2)
  }

  // Striped awning with a scalloped edge
  const aw = dw * 1.45
  const ah = blockH * 0.13
  const ax = cx - aw / 2
  const ay = dy - ah - 5
  const stripes = 7
  const sw = aw / stripes
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#d9695a'
    ctx.fillRect(ax + i * sw, ay, sw + 0.5, ah)
    ctx.beginPath()
    ctx.arc(ax + i * sw + sw / 2, ay + ah, sw / 2, 0, Math.PI)
    ctx.fill()
  }

  // Two little wall lamps beside the doors
  for (const side of [-1, 1]) {
    const lx = cx + side * (dw / 2 + Math.min(18, w * 0.08))
    const ly = dy + dh * 0.25
    const glow = ctx.createRadialGradient(lx, ly, 1, lx, ly, 16)
    glow.addColorStop(0, 'rgba(255, 220, 130, 0.8)')
    glow.addColorStop(1, 'rgba(255, 220, 130, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(lx - 16, ly - 16, 32, 32)
    ctx.fillStyle = '#3d3151'
    ctx.fillRect(lx - 1, ly + 4, 2, 6)
    ctx.fillStyle = '#fff0b8'
    roundedRect(ctx, lx - 4, ly - 5, 8, 10, 3)
    ctx.fill()
  }
}
