import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

export default function TopBar({ user, screen }) {
  const name = user.displayName || 'Guest'

  return (
    <header className="topbar">
      <div className="brand">Skyline</div>
      <nav className="nav">
        <a href="#/play" className={screen === 'play' ? 'active' : ''}>
          Play
        </a>
        <a href="#/city" className={screen === 'city' ? 'active' : ''}>
          City
        </a>
        <a href="#/profile" className={screen === 'profile' ? 'active' : ''}>
          Profile
        </a>
      </nav>
      <div className="who">
        <span className="name" title={name}>
          {name}
        </span>
        <button className="btn ghost" onClick={() => signOut(auth)}>
          Sign out
        </button>
      </div>
    </header>
  )
}
