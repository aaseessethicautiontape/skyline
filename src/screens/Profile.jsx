import { useEffect, useRef, useState } from 'react'
import { getProfile } from '../data'
import { cityColors } from '../game/building'
import { createPortrait } from '../game/portrait'

const when = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function floorsText(n) {
  return `${n} ${n === 1 ? 'floor' : 'floors'}`
}

export default function Profile({ user }) {
  const [profile, setProfile] = useState(null) // null = still loading
  const [failed, setFailed] = useState(false)
  const name = user.displayName || 'Guest'

  useEffect(() => {
    let live = true
    getProfile(user.uid)
      .then((p) => live && setProfile(p))
      .catch((err) => {
        console.error('Could not load profile', err)
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [user.uid])

  if (failed) {
    return (
      <section className="profile profile-center">
        <p className="profile-empty">Couldn't load your profile. Check your connection.</p>
      </section>
    )
  }

  if (!profile) {
    return (
      <section className="profile profile-center" aria-busy="true">
        <div className="spinner" role="status" aria-label="Loading your profile" />
      </section>
    )
  }

  const { best, runs, cityUids } = profile
  // Same color as in the City; players outside the top 20 keep their favorite
  const colorIndex = cityColors(cityUids).get(user.uid)

  return (
    <section className="profile">
      <Building uid={user.uid} colorIndex={colorIndex} floors={best} name={name} />

      <div className="profile-info">
        <h2 className="profile-name">{name}</h2>
        <div className="profile-best">
          <span className="profile-best-num">{best}</span>
          <span className="profile-best-label">{best === 1 ? 'floor' : 'floors'} · your best</span>
        </div>

        <h3 className="profile-runs-title">Last runs</h3>
        {runs.length === 0 ? (
          <div className="profile-empty">
            <p>No runs yet. Go build!</p>
            <a className="btn primary" href="#/play">
              Play
            </a>
          </div>
        ) : (
          <ol className="profile-runs">
            {runs.map((run) => (
              <li key={run.id} className={run.score === best && best > 0 ? 'is-best' : ''}>
                <span className="run-score">{floorsText(run.score)}</span>
                <span className="run-when">{run.playedAt ? when.format(run.playedAt) : 'Just now'}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function Building({ uid, colorIndex, floors, name }) {
  const canvasRef = useRef(null)
  const portraitRef = useRef(null)

  useEffect(() => {
    const portrait = createPortrait(canvasRef.current, { uid, colorIndex })
    portraitRef.current = portrait
    return () => {
      portrait.destroy()
      portraitRef.current = null
    }
  }, [uid, colorIndex])

  // Also after a rebuild above, which starts from an empty lot
  useEffect(() => {
    portraitRef.current?.setFloors(floors)
  }, [floors, uid, colorIndex])

  return (
    <div className="profile-building">
      <canvas ref={canvasRef} role="img" aria-label={`${name}'s building, ${floorsText(floors)} tall`} />
    </div>
  )
}
