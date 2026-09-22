# AI Project Lab 3 — Week 1: Fix the Lock

Last term ended with a hacked leaderboard. Today you will try the same cheat on your own Level 2 project, lock the database, and prove that the cheat now bounces off.

**Big idea:** code in the browser belongs to the user. The client can ask to save a score, but the backend must decide whether that write is allowed.

Skyline is the reference app for this lab. It is a tower-stacking game where every player's best tower appears in a shared class city. Your own Level 2 leaderboard project is the project you will secure.

## Bring before class

- Your Level 2 leaderboard project
- The Google account that owns its Firebase project
- VS Code and Codex, both signed in
- Your GitHub and Vercel logins

If anything is missing, tell your teacher at the start of class.

## Today's plan

| Session | Mission | Time |
| --- | --- | --- |
| 1 | Replay the hack | 15 min |
| 2 | Write and publish the rules | 25 min |
| 3 | Tamper again and get refused | 20 min |

## 1. Replay the hack

First, see the problem for yourself.

1. Open your Level 2 project in VS Code.
2. Ask Codex: `Add a temporary line so I can call my submitScore function from the browser console as app.submitScore(number).`
3. Start the app with `npm run dev`, open it, and sign in.
4. Open the browser console (Mac: <kbd>Cmd</kbd> + <kbd>Option</kbd> + <kbd>J</kbd>).
5. Type `app.submitScore(999999)` and press Enter.
6. Open your leaderboard and Firestore data. Take a screenshot showing the fake score.

A real attacker does not need the temporary console door—they can change or call any browser code. The door just lets us practise the attack quickly.

## 2. Write the lock

Firestore Security Rules run on Google's servers before every read and write. A browser trick cannot skip them.

Create a `firestore.rules` file. Ask Codex:

> Create firestore.rules. Anyone can read scores. A signed-in player may create or update only scores/{their uid} and add runs inside it. Score must be a whole number from 0 to 3000. Nobody deletes. Explain each line.

Change `3000` to the highest honest score your game can actually produce. Read every explanation; only publish rules you understand.

For Skyline, the rules need to cover both paths below. A rule for the first path does **not** automatically protect the second one.

```text
scores/{uid}
scores/{uid}/runs/{runId}
```

The score-writing code is in `src/data.js`: `submitScore(score)` saves each run, then saves a new best score. The rule must allow that honest behaviour while refusing writes for another player or scores outside your allowed range.

In Firebase Console, open **Firestore Database → Rules**, replace the old open rule, paste your rules, and click **Publish**. Then delete the fake `999999` document from the **Data** tab. The Firebase Console is an owner's tool, so Security Rules do not stop you there.

## 3. Tamper again

1. Reload your app.
2. Open the browser console and run `app.submitScore(999999)` again.
3. You should see `Missing or insufficient permissions` / `PERMISSION_DENIED`.
4. Refresh Firestore Data: the fake score should not exist.
5. Play one real round and check that an honest score still saves.
6. Take an after screenshot showing the refused write.

`PERMISSION_DENIED` is good news today: it proves the lock is working. If an honest score is also refused, the rule is stricter than the data your app sends. Give Codex the console error and your rules, then ask which check failed.

## Finish and hand in

- Remove the temporary `app.submitScore` console door.
- Put your before and after screenshots in a `security/` folder in your project.
- Commit `firestore.rules`, the screenshots, and the removal of the temporary line.
- Push to GitHub and deploy your updated project.

## Done checklist

- [ ] `app.submitScore(999999)` appeared on my leaderboard before the fix.
- [ ] My published rules cover both `scores` and `scores/{uid}/runs`.
- [ ] The same fake score now fails with `Missing or insufficient permissions`.
- [ ] An honest game round still saves its score.
- [ ] I saved before and after screenshots.
- [ ] My rules, screenshots, and code changes are committed and pushed.

## Think like a security engineer

The maximum-score rule stops `999999`, but could a player still submit a fake score just below the cap? Yes. A browser client can still lie about what happened in the game. This week is about moving the basic lock to the backend; later in Lab 3, you will build servers that decide the important things themselves.

## Run the Skyline reference app

```bash
npm install
npm run dev
```

Before deployment, check your work with:

```bash
npm run lint
npm run build
```
