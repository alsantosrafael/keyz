import { useEffect, useRef } from 'react'
import { TRAIL_LIFETIME_MS, type TrailBlock } from '../application'

const PX_PER_SECOND = 120
const LOW = 36
const HIGH = 96

/**
 * Trilha de notas (rolo de piano): cada nota vira um bloco na altura da sua nota, nasce na
 * borda direita e anda para a esquerda a ≈ 120 px/s; o comprimento acompanha o tempo de tecla
 * pressionada. Desenhada em canvas por rAF, sem re-render do React. Só decorativa: o
 * `NoteReadout` anuncia a nota.
 */
export function NoteTrail({ getBlocks, height = 96 }: { getBlocks: () => readonly TrailBlock[]; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let width = 0
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const css = getComputedStyle(document.documentElement)
    const track = () => css.getPropertyValue('--track').trim() || '#2dd4c4'
    const line = () => css.getPropertyValue('--line').trim() || 'rgba(255,255,255,.08)'
    const draw = () => {
      const now = performance.now()
      ctx.clearRect(0, 0, width, height)
      ctx.strokeStyle = line()
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        ctx.beginPath()
        ctx.moveTo(0, (height / 4) * i + 0.5)
        ctx.lineTo(width, (height / 4) * i + 0.5)
        ctx.stroke()
      }
      const rowH = Math.max(3, height / (HIGH - LOW))
      ctx.fillStyle = track()
      for (const b of getBlocks()) {
        const age = now - (b.end ?? now)
        const xEnd = width - (age / 1000) * PX_PER_SECOND
        const xStart = width - ((now - b.start) / 1000) * PX_PER_SECOND
        const alpha = Math.max(0, 1 - Math.max(0, now - b.start - TRAIL_LIFETIME_MS * 0.4) / (TRAIL_LIFETIME_MS * 0.6))
        if (xEnd < -20) continue
        const y = height - ((Math.min(HIGH, Math.max(LOW, b.midi)) - LOW) / (HIGH - LOW)) * (height - rowH) - rowH
        ctx.globalAlpha = (b.soft ? 0.55 : 1) * (reduce.matches ? 1 : Math.max(0.2, alpha))
        const w = Math.max(6, xEnd - xStart)
        ctx.beginPath()
        ctx.roundRect(Math.max(-20, xStart), y, w, rowH, Math.min(3, rowH / 2))
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [getBlocks, height])
  return <canvas ref={ref} aria-hidden className="block w-full rounded-card bg-inset" style={{ height }} />
}
