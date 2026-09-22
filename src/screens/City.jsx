import { useEffect, useRef, useState } from 'react'
import { watchTopScores } from '../data'
import { createCity } from '../game/city'

export default function City({ user }) {
  const canvasRef = useRef(null)
  const cityRef = useRef(null)
  const [players, setPlayers] = useState(null) // null = still loading
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState({ canScroll: false, atGround: true })

  useEffect(() => {
    const city = createCity(canvasRef.current, { youUid: user.uid, onView: setView })
    cityRef.current = city
    const unsubscribe = watchTopScores(
      (list) => {
        city.setPlayers(list)
        setPlayers(list)
        setFailed(false)
      },
      (err) => {
        console.error('Could not load the city', err)
        setFailed(true)
      },
    )
    return () => {
      unsubscribe()
      city.destroy()
      cityRef.current = null
    }
  }, [user.uid])

  const label = !players
    ? 'The city is loading'
    : players.length
      ? `City skyline with ${players.length} ${players.length === 1 ? 'building' : 'buildings'}`
      : 'Empty lots waiting for builders. Be the first to build!'

  return (
    <section className="city">
      <canvas ref={canvasRef} className="city-canvas" role="img" aria-label={label} tabIndex={0} />

      <header className="city-title">
        <h2>Our City</h2>
        {players && (
          <p>
            {players.length} {players.length === 1 ? 'builder' : 'builders'}
          </p>
        )}
      </header>

      {players && players.length > 0 && (
        <ol className="sr-only" aria-label="Top builders">
          {players.map((p) => (
            <li key={p.uid}>
              {p.name || 'Guest'}: {p.score} {p.score === 1 ? 'floor' : 'floors'}
              {p.uid === user.uid ? ' (you)' : ''}
            </li>
          ))}
        </ol>
      )}

      {!players && !failed && <p className="city-status">Turning on the lights…</p>}
      {failed && <p className="city-status">Couldn't reach the city. Check your connection.</p>}

      {view.canScroll && view.atGround && (
        <p className="city-hint" aria-hidden="true">
          ↑ Scroll up to see the top
        </p>
      )}
      {view.canScroll && !view.atGround && (
        <button className="btn city-ground" onClick={() => cityRef.current?.toGround()}>
          ↓ Back to street
        </button>
      )}
    </section>
  )
}
