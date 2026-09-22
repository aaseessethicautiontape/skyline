// One player's building: its look comes only from their uid, so it's the same
// everywhere it's drawn (the City and the Profile). World units, y flipped: the
// origin is where the building meets the street (or its roof), and up is negative.

import { PALETTE, drawFloorBody, drawLobby, hash, layoutWindows, roundedRect, windowMetrics } from './look'

export const FLOOR_H = 56 // world px, about the game's floor height
const MIN_W = 170 // building widths come from the uid, in 10 px steps up to MIN_W + 40

// Roof shapes, picked from the uid, and how tall each stands in world px
const ROOFS = ['tank', 'spire', 'antenna', 'garden']
export const ROOF_H = { tank: 64, spire: 68, antenna: 84, garden: 44 }
export const ROOF_MAX = 84

export const { winSize: WIN_SIZE, winGap: WIN_GAP } = windowMetrics(FLOOR_H)

// Everything about a building that comes from the uid. pref is its favorite color;
// the City may nudge it along the palette (see cityColors), so pass that color in
// when drawing the building somewhere else.
export function buildingLook(uid, colorIndex) {
  const seed = seedFrom(uid)
  const pref = seed % PALETTE.length
  return {
    seed,
    w: MIN_W + (hash(seed, 1) % 5) * 10,
    pref,
    color: PALETTE[colorIndex ?? pref],
    roof: ROOFS[hash(seed, 2) % ROOFS.length],
    floorLooks: [],
  }
}

// Left to right: the first in rank stands in the middle, the rest alternate right and left
export function centerOut(ranked) {
  const order = []
  ranked.forEach((s, i) => (i % 2 ? order.push(s) : order.unshift(s)))
  return order
}

// The palette index each building gets in the City, by uid, for the top players in
// rank order. Each starts from its favorite and steps along the palette until it
// differs from its left neighbor (and, in a small city, from everyone).
export function cityColors(rankedUids) {
  const allDifferent = rankedUids.length <= PALETTE.length
  const used = new Set()
  const colors = new Map()
  let prev = -1
  for (const uid of centerOut(rankedUids)) {
    const pref = seedFrom(uid) % PALETTE.length
    let pick = pref
    for (let k = 0; k < PALETTE.length; k++) {
      const c = (pref + k) % PALETTE.length
      if (c === prev || (allDifferent && used.has(c))) continue
      pick = c
      break
    }
    colors.set(uid, pick)
    used.add(pick)
    prev = pick
  }
  return colors
}

// Floor i's windows, made once from the seed so they're the same on every visit
export function floorLook(b, i) {
  while (b.floorLooks.length <= i) {
    const n = b.floorLooks.length
    const rand = mulberry32(hash(b.seed, n + 7))
    b.floorLooks.push({ w: b.w, color: b.color, windows: layoutWindows(b.w, WIN_SIZE, WIN_GAP, rand) })
  }
  return b.floorLooks[i]
}

// World y (up) of floor i's center, measured from the street
export function floorCenter(i) {
  return FLOOR_H + i * FLOOR_H + FLOOR_H / 2
}

// Lobby plus floors [from, to), with the origin at street level, building center
export function paintBuilding(g, b, from, to) {
  if (from === 0) drawLobby(g, -b.w / 2, -FLOOR_H, b.w, FLOOR_H, b.color)
  for (let i = from; i < to; i++) {
    g.save()
    g.translate(0, -floorCenter(i))
    drawFloorBody(g, floorLook(b, i), FLOOR_H, WIN_SIZE, 0)
    g.restore()
  }
}

// The building's own roof, with the origin at the roof's center: a water tank, a
// pointed top, an antenna or a garden
export function paintRoof(ctx, b, time, reduceMotion) {
  const w = b.w
  const c = b.color

  // Parapet along the edge of the roof
  ctx.fillStyle = c.trim
  roundedRect(ctx, -w / 2 - 3, -7, w + 6, 8, 3)
  ctx.fill()
  ctx.fillStyle = c.ledge
  ctx.fillRect(-w / 2 - 1, -7, w + 2, 2.5)

  if (b.roof === 'tank') {
    const tx = w * 0.2
    ctx.fillStyle = '#5b4a6e'
    for (const lx of [-15, -5, 5, 15]) ctx.fillRect(tx + lx - 1.5, -26, 3, 20)
    ctx.fillRect(tx - 18, -26, 36, 3)
    ctx.fillStyle = '#a86f55'
    roundedRect(ctx, tx - 20, -56, 40, 31, 5)
    ctx.fill()
    ctx.fillStyle = '#7d4d3b'
    for (const by of [-50, -41, -32]) ctx.fillRect(tx - 20, by, 40, 2.5)
    ctx.beginPath()
    ctx.moveTo(tx - 23, -55)
    ctx.lineTo(tx, -66)
    ctx.lineTo(tx + 23, -55)
    ctx.closePath()
    ctx.fill()
    // A little vent box on the other side
    ctx.fillStyle = '#6b5a80'
    roundedRect(ctx, -w * 0.32, -20, 24, 14, 3)
    ctx.fill()
  } else if (b.roof === 'spire') {
    ctx.fillStyle = c.base
    ctx.beginPath()
    ctx.moveTo(-w * 0.34, -6)
    ctx.lineTo(-w * 0.2, -26)
    ctx.lineTo(w * 0.2, -26)
    ctx.lineTo(w * 0.34, -6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.trim
    ctx.fillRect(-w * 0.2, -28, w * 0.4, 4)
    ctx.fillStyle = c.ledge
    ctx.beginPath()
    ctx.moveTo(-w * 0.16, -27)
    ctx.lineTo(0, -66)
    ctx.lineTo(w * 0.16, -27)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = c.trim
    ctx.lineWidth = 2
    ctx.stroke()
    const glow = 0.6 + 0.4 * Math.sin(time / 800)
    ctx.fillStyle = `rgba(255, 214, 90, ${(0.35 * glow).toFixed(2)})`
    ctx.beginPath()
    ctx.arc(0, -66, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffe08a'
    ctx.beginPath()
    ctx.arc(0, -66, 3.5, 0, Math.PI * 2)
    ctx.fill()
  } else if (b.roof === 'antenna') {
    const ax = -w * 0.18
    ctx.fillStyle = '#5b4a6e'
    roundedRect(ctx, ax - 15, -20, 30, 14, 3)
    ctx.fill()
    ctx.fillStyle = '#c9ced8'
    ctx.fillRect(ax - 1.5, -80, 3, 62)
    ctx.fillRect(ax - 11, -44, 22, 2.5)
    ctx.fillRect(ax - 7, -62, 14, 2.5)
    // Satellite dish on the other side
    ctx.strokeStyle = '#c9ced8'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(w * 0.22, -20, 12, Math.PI * 1.05, Math.PI * 1.95)
    ctx.stroke()
    ctx.fillRect(w * 0.22 - 1.5, -20, 3, 14)
    // Slow red warning light
    const on = reduceMotion || time % 2000 < 1000
    if (on) {
      ctx.fillStyle = 'rgba(255, 90, 120, 0.35)'
      ctx.beginPath()
      ctx.arc(ax, -82, 11, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = on ? '#ff5a78' : '#7a2c45'
    ctx.beginPath()
    ctx.arc(ax, -82, 4, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // Rooftop garden: planters, bushes, a little tree and string lights
    ctx.fillStyle = '#8a5a3c'
    roundedRect(ctx, -w / 2 + 8, -17, w - 16, 11, 3)
    ctx.fill()
    const greens = ['#72986f', '#9fc39b']
    let i = 0
    for (let x = -w / 2 + 18; x < w / 2 - 34; x += 20, i++) {
      ctx.fillStyle = greens[i % 2]
      ctx.beginPath()
      ctx.arc(x, -19, 10 + (i % 3), 0, Math.PI * 2)
      ctx.fill()
      if (i % 2 === 0) {
        ctx.fillStyle = i % 4 ? '#ffd978' : '#ff9eaa'
        ctx.beginPath()
        ctx.arc(x + 3, -24, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    const tx = w / 2 - 24
    ctx.fillStyle = '#7d4d3b'
    ctx.fillRect(tx - 2, -30, 4, 24)
    ctx.fillStyle = '#72986f'
    ctx.beginPath()
    ctx.arc(tx, -34, 15, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#9fc39b'
    ctx.beginPath()
    ctx.arc(tx - 4, -38, 8, 0, Math.PI * 2)
    ctx.fill()
    // String lights sagging between two poles
    const l = -w / 2 + 10
    const r = w / 2 - 44
    ctx.fillStyle = '#5b4a6e'
    ctx.fillRect(l - 1, -42, 2.5, 36)
    ctx.fillRect(r - 1, -42, 2.5, 36)
    for (let k = 0; k <= 8; k++) {
      const t = k / 8
      const x = l + (r - l) * t
      const y = -41 + Math.sin(t * Math.PI) * 9
      ctx.fillStyle = 'rgba(255, 220, 130, 0.35)'
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff0b8'
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// FNV-1a: the same uid always gives the same number
function seedFrom(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Small seeded random generator, so a building's windows are the same on every visit
function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
