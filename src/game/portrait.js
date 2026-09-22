// One player's building on a little night-sky card, drawn exactly like it is in
// the City. Pass the colorIndex the City gives it (cityColors) so it matches there.
// Plain canvas, no images, no React.

import { FLOOR_H, ROOF_MAX, buildingLook, paintBuilding, paintRoof } from './building'
import { drawMoon, drawSky, drawStreet, makeStars } from './look'

const MAX_SCALE = 1.1
const MIN_FLOOR_PX = 16 // a very tall building shows its top floors and roof instead
const MAX_FLOORS = 999 // same drawing cap as the City
const TOP_PAD = 16

export function createPortrait(canvas, { uid, colorIndex }) {
  const ctx = canvas.getContext('2d')
  const container = canvas.parentElement
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const b = buildingLook(uid, colorIndex)
  const stars = makeStars()
  let floors = 0
  let W = 0
  let H = 0
  let dpr = 1
  let ground = 0
  let scale = 1
  let street = 0 // screen y of the street; below the canvas when only the top fits
  let cache = null // the standing building, drawn once per size
  let rafId = 0

  function resize() {
    const rect = container.getBoundingClientRect()
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = Math.max(1, rect.width)
    H = Math.max(1, rect.height)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ground = Math.round(H * 0.12)
    layout()
    draw(performance.now())
  }

  // Fit the whole building if the floors stay readable; otherwise frame its top
  function layout() {
    const tall = (floors + 1) * FLOOR_H + ROOF_MAX
    const fitH = (H - ground - TOP_PAD) / tall
    const fitW = (W * 0.6) / b.w
    scale = Math.min(fitH, fitW, MAX_SCALE)
    street = H - ground
    if (scale * FLOOR_H < MIN_FLOOR_PX) {
      scale = Math.min(fitW, MIN_FLOOR_PX / FLOOR_H)
      street = TOP_PAD + tall * scale
    }
    cache = null
  }

  function roofY() {
    return street - (floors + 1) * FLOOR_H * scale
  }

  // Only the floors that land on the canvas, drawn once into an offscreen canvas
  function paintCache() {
    const c = document.createElement('canvas')
    c.width = Math.ceil(W * dpr)
    c.height = Math.ceil(H * dpr)
    const g = c.getContext('2d')
    g.setTransform(dpr * scale, 0, 0, dpr * scale, (W / 2) * dpr, street * dpr)
    const fh = FLOOR_H * scale
    const from = Math.max(0, Math.floor((street - H) / fh) - 2)
    paintBuilding(g, b, from, floors)
    return c
  }

  function draw(time) {
    drawSky(ctx, W, H, stars, 0, time)
    drawMoon(ctx, W, H, 10)
    drawStreet(ctx, street, W, H)

    if (!cache) cache = paintCache()
    ctx.drawImage(cache, 0, 0, W, H)

    ctx.save()
    ctx.translate(W / 2, roofY())
    ctx.scale(scale, scale)
    paintRoof(ctx, b, time, reduceMotion)
    ctx.restore()
  }

  function frame(time) {
    draw(time)
    rafId = requestAnimationFrame(frame)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()
  window.addEventListener('resize', resize)
  rafId = requestAnimationFrame(frame)

  return {
    setFloors(n) {
      floors = Math.min(MAX_FLOORS, Math.max(0, Math.floor(Number(n) || 0)))
      layout()
    },
    destroy() {
      cancelAnimationFrame(rafId)
      observer.disconnect()
      window.removeEventListener('resize', resize)
    },
  }
}
