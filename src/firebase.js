import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyAywzqVgqrA0mjN_TQm3Qgsaf9HTK6LLN0',
  authDomain: 'skyline-fb9a0.firebaseapp.com',
  projectId: 'skyline-fb9a0',
  storageBucket: 'skyline-fb9a0.firebasestorage.app',
  messagingSenderId: '763636589916',
  appId: '1:763636589916:web:87a3f36904884e7f56cd99',
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
