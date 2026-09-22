import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { auth, db } from './firebase'

// The ONLY place that writes scores. Every run is saved; the best only goes up.
// Resolves to { newBest, best } where best is the player's best after this run.
export async function submitScore(score) {
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')

  score = Math.floor(score)

  await addDoc(collection(db, 'scores', user.uid, 'runs'), {
    score,
    playedAt: serverTimestamp(),
  })

  const bestRef = doc(db, 'scores', user.uid)
  const snap = await getDoc(bestRef)
  const stored = snap.exists() ? snap.data().score : undefined

  if (typeof stored === 'number' && score <= stored) {
    return { newBest: false, best: stored }
  }

  await setDoc(bestRef, {
    name: user.displayName || 'Guest',
    score,
    updatedAt: serverTimestamp(),
  })
  return { newBest: true, best: score }
}

// Live top 20 bests, tallest first. Calls onPlayers([{ uid, name, score }]) on every
// change and returns the unsubscribe function.
export function watchTopScores(onPlayers, onError) {
  return onSnapshot(
    topScores(),
    (snap) => onPlayers(snap.docs.map((d) => ({ uid: d.id, name: d.data().name, score: d.data().score }))),
    onError,
  )
}

function topScores() {
  return query(collection(db, 'scores'), orderBy('score', 'desc'), limit(20))
}

// One player's best, their last 10 runs (newest first), and the uids in the City right
// now so their building can be drawn in the same color it has there.
// Resolves to { best, runs: [{ id, score, playedAt: Date | null }], cityUids }.
export async function getProfile(uid) {
  const recent = query(collection(db, 'scores', uid, 'runs'), orderBy('playedAt', 'desc'), limit(10))
  const [bestSnap, runsSnap, topSnap] = await Promise.all([
    getDoc(doc(db, 'scores', uid)),
    getDocs(recent),
    getDocs(topScores()),
  ])
  return {
    best: bestSnap.exists() ? bestSnap.data().score : 0,
    cityUids: topSnap.docs.map((d) => d.id),
    runs: runsSnap.docs.map((d) => ({
      id: d.id,
      score: d.data().score,
      playedAt: d.data().playedAt?.toDate() ?? null,
    })),
  }
}
