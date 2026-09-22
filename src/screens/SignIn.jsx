import { useState } from 'react'
import {
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../firebase'

export default function SignIn({ returningGuest, onContinue, onProfileSaved }) {
  const [guestName, setGuestName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') setError(err.message)
      setBusy(false)
    }
  }

  function withGoogle() {
    run(() => signInWithPopup(auth, new GoogleAuthProvider()))
  }

  function asGuest(e) {
    e.preventDefault()
    const name = guestName.trim()
    if (!name) return
    run(async () => {
      // signInAnonymously hands back the current guest if one is signed in,
      // so sign them out first to get a brand-new account
      if (returningGuest) await signOut(auth)
      const { user } = await signInAnonymously(auth)
      await updateProfile(user, { displayName: name })
      onProfileSaved(user.uid)
    })
  }

  return (
    <div className="signin">
      <div className="signin-card">
        <h1 className="title">Skyline</h1>
        <p className="tagline">Stack a tower. Build the city.</p>

        {returningGuest && (
          <>
            <button className="btn primary" onClick={() => onContinue(returningGuest.uid)} disabled={busy}>
              Continue as {returningGuest.displayName}
            </button>
            <p className="signin-note">Keeps your building in the city</p>
          </>
        )}

        <button className={returningGuest ? 'btn' : 'btn primary'} onClick={withGoogle} disabled={busy}>
          Continue with Google
        </button>

        <div className="divider">
          <span>or</span>
        </div>

        <form className="guest" onSubmit={asGuest}>
          <input
            type="text"
            placeholder="Your name"
            maxLength={20}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            disabled={busy}
          />
          <button className="btn" type="submit" disabled={busy || !guestName.trim()}>
            {returningGuest ? 'Play as someone else' : 'Play as guest'}
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
