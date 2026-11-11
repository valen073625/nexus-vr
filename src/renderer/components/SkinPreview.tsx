import React, { useEffect, useRef } from 'react'

/**
 * Dibuja una vista frontal simple del jugador a partir de una skin PNG 64x64 (o 64x32).
 */
export default function SkinPreview({
  dataUrl,
  username,
  size = 160,
}: {
  dataUrl: string | null
  username?: string
  size?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Fondo sutil
    ctx.fillStyle = '#121218'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (!dataUrl) {
      // Silueta placeholder
      ctx.fillStyle = '#2a2a35'
      const s = size / 32
      // head
      ctx.fillRect(12 * s, 2 * s, 8 * s, 8 * s)
      // body
      ctx.fillRect(12 * s, 10 * s, 8 * s, 12 * s)
      // arms
      ctx.fillRect(8 * s, 10 * s, 4 * s, 12 * s)
      ctx.fillRect(20 * s, 10 * s, 4 * s, 12 * s)
      // legs
      ctx.fillRect(12 * s, 22 * s, 4 * s, 12 * s)
      ctx.fillRect(16 * s, 22 * s, 4 * s, 12 * s)
      ctx.fillStyle = '#6a6a78'
      ctx.font = `${Math.max(10, size / 14)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('Sin skin', size / 2, size - 8)
      return
    }

    const img = new Image()
    img.onload = () => {
      const s = size / 32
      ctx.imageSmoothingEnabled = false

      const draw = (
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number
      ) => {
        ctx.drawImage(img, sx, sy, sw, sh, dx * s, dy * s, dw * s, dh * s)
      }

      // Orden de capas (cuerpo base + overlay)
      // Left arm (player right)
      draw(44, 20, 4, 12, 8, 10, 4, 12)
      draw(44, 36, 4, 12, 8, 10, 4, 12)
      // Right arm
      draw(36, 52, 4, 12, 20, 10, 4, 12)
      // fallback classic right arm
      draw(52, 20, 4, 12, 20, 10, 4, 12)
      draw(52, 36, 4, 12, 20, 10, 4, 12)

      // Body
      draw(20, 20, 8, 12, 12, 10, 8, 12)
      draw(20, 36, 8, 12, 12, 10, 8, 12)

      // Legs
      draw(4, 20, 4, 12, 12, 22, 4, 12)
      draw(4, 36, 4, 12, 12, 22, 4, 12)
      draw(20, 52, 4, 12, 16, 22, 4, 12)
      draw(4, 52, 4, 12, 16, 22, 4, 12)

      // Head + hat
      draw(8, 8, 8, 8, 12, 2, 8, 8)
      draw(40, 8, 8, 8, 12, 2, 8, 8)
    }
    img.onerror = () => {
      ctx.fillStyle = '#ff6b6b'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Error skin', size / 2, size / 2)
    }
    img.src = dataUrl
  }, [dataUrl, size])

  return (
    <div className="skin-preview-wrap">
      <canvas ref={canvasRef} width={size} height={size} className="skin-canvas" />
      {username ? <div className="skin-username">{username}</div> : null}
    </div>
  )
}
