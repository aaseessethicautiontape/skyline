# Build notes for Skyline

Stack: Vite + React, Firebase Auth (Google + Anonymous), Firestore, deployed on Vercel.

Data:
- scores/{uid}: name, score (whole number), updatedAt (serverTimestamp). This is the player's best. It only goes up.
- scores/{uid}/runs/{auto-id}: score, playedAt (serverTimestamp). One document for every run, even bad ones.

One doorway:
- submitScore(score) in src/data.js is the ONLY function that writes scores. The game calls it at game over. It saves the run with addDoc, and updates scores/{uid} only if the new score beats the best.

Game:
- Drawn on a canvas with code only. No image files.
- A block slides left and right. Space, click, or tap drops it.
- The overhang gets sliced off and falls. The next block is the new smaller width.
- Missing the tower completely is game over.
- Speed goes up a little every 5 floors.
- The camera moves up as the tower grows.

City screen:
- Reads the top 20 scores with onSnapshot, and calls unsubscribe when the screen closes.
- Each player is a building. Height matches their score. Name glows on the roof.
- The signed-in player's building has a YOU beacon, matched by uid, never by name.
- The tallest building gets a crown.
- Night sky with lit windows.

Firestore rules for now: wide open on purpose (allow read, write: if true). Lab 3 Week 1 locks them.