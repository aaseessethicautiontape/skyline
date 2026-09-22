import { useEffect, useRef, useState } from 'react'
import { createStacker } from '../game/stacker'

export default function Play() {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const [hud, setHud] = useState({ phase: 'ready', floors: 0, result: null })

  useEffect(() => {
    const game = createStacker(canvasRef.current, { onChange: setHud })
    gameRef.current = game
    return () => {
      game.destroy()
      gameRef.current = null
    }
  }, [])

  const { phase, floors, result } = hud

  function playAgain() {
    gameRef.current?.restart()
  }

  return (
    <section className="play">
      <canvas
        ref={canvasRef}
        className="play-canvas"
        role="img"
        aria-label={`Tower with ${floors} floors`}
      />

      <div className="play-floors" aria-live="polite">
        {/* key remounts the number so the pop animation replays on every new floor */}
        <span key={floors} className={floors > 0 ? 'play-floors-num pop' : 'play-floors-num'}>
          {floors}
        </span>
        <span className="play-floors-label">{floors === 1 ? 'floor' : 'floors'}</span>
      </div>

      {phase === 'ready' && <p className="play-prompt">Tap or press Space to build</p>}

      {phase === 'over' && (
        <div className="play-over">
          <p className="play-over-label">Tower complete</p>
          <p className="play-over-score">
            {floors} {floors === 1 ? 'floor' : 'floors'} stacked
          </p>
          <p className="play-over-best" aria-live="polite">
            {!result
              ? 'Saving…'
              : result.error
                ? "Couldn't save this run"
                : result.newBest
                  ? 'New best! Your building grew'
                  : `Your best is still ${result.best}`}
          </p>
          <button className="btn primary" autoFocus onClick={playAgain}>
            Play again
          </button>
        </div>
      )}
    </section>
  )
}
