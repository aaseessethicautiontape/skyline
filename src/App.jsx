import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import SignIn from './screens/SignIn.jsx'
import Play from './screens/Play.jsx'
import City from './screens/City.jsx'
import Profile from './screens/Profile.jsx'
import TopBar from './components/TopBar.jsx'
import './App.css'

const SCREENS = { play: Play, city: City, profile: Profile }

// The guest this tab already chose to continue as. Kept per tab, so the next person to
// open the site on a shared computer gets asked again, but a reload doesn't.
const CONTINUED_KEY = 'skyline.continuedAs'

function readContinued() {
  try {
    return sessionStorage.getItem(CONTINUED_KEY)
  } catch {
    return null
  }
}

function saveContinued(uid) {
  try {
    if (uid) sessionStorage.setItem(CONTINUED_KEY, uid)
    else sessionStorage.removeItem(CONTINUED_KEY)
  } catch {
    // Storage blocked: they'll just be asked again next time
  }
}

function screenFromHash() {
  const name = window.location.hash.replace('#/', '')
  return SCREENS[name] ? name : 'play'
}

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = still checking
  const [screen, setScreen] = useState(screenFromHash)
  // updateProfile edits the user in place, so bump this to re-render with the new name
  const [, setProfileVersion] = useState(0)
  const [continuedUid, setContinuedUid] = useState(readContinued)

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u)
        // Signed out: forget the choice so the next guest starts fresh
        if (!u) {
          saveContinued(null)
          setContinuedUid(null)
        }
      }),
    [],
  )

  function continueAs(uid) {
    saveContinued(uid)
    setContinuedUid(uid)
  }

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (user === undefined) {
    return <div className="loading">Turning on the lights…</div>
  }

  // A guest isn't ready until their name is saved, and a guest already signed in on
  // this browser picks "Continue as <name>" or "Play as someone else" first
  const needsName = user?.isAnonymous && !user.displayName
  const returningGuest = user?.isAnonymous && user.displayName && continuedUid !== user.uid
  if (!user || needsName || returningGuest) {
    return (
      <SignIn
        returningGuest={returningGuest ? user : null}
        onContinue={continueAs}
        onProfileSaved={(uid) => {
          continueAs(uid)
          setProfileVersion((v) => v + 1)
        }}
      />
    )
  }

  const Screen = SCREENS[screen]

  return (
    <div className="app">
      <TopBar user={user} screen={screen} />
      <main className={`screen screen-${screen}`}>
        <Screen user={user} />
      </main>
    </div>
  )
}
