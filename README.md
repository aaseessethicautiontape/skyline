# Skyline — Lab 3, Week 1

Welcome to Lab 3! In Lab 2, you made your own project. Bring that project with you today: you will use it as the starting point for this lab.

This repository is a working example called **Skyline**. It is a one-button tower-stacking game where every player's best tower can appear in a shared class city. Use it to see one possible way to organise a React project with Firebase, then make the ideas your own in your Lab 2 project.

## What you are learning

By the end of the lab, you should be able to:

- add sign-in to a React app;
- save information for a signed-in user in Firestore;
- read updates from Firestore as they happen; and
- deploy a web app so other people can try it.

## The Skyline example

Skyline includes:

- Google sign-in and guest-name sign-in;
- a game controlled with a click, tap, or the Space key;
- a personal best score for each player; and
- a live city screen that shows the class's best towers.

The code is split into small pieces so it is easier to explore:

| Place | What it does |
| --- | --- |
| `src/screens/` | The Sign In, Play, City, and Profile screens |
| `src/game/` | The tower game and its drawing code |
| `src/data.js` | Reading and saving player scores |
| `src/firebase.js` | Connecting the app to Firebase |
| `BUILD-NOTES.md` | Extra notes about how the example is built |

## Your Lab 3 task

Work in **your own Lab 2 project**. Do not try to copy Skyline exactly. Choose a small feature that makes sense for your project, such as a high-score board, saved drawings, favourite recipes, completed challenges, or shared messages.

1. Make sure your Lab 2 project still runs.
2. Add Firebase Authentication or anonymous sign-in.
3. Decide what one piece of information each player will save.
4. Save that information in Firestore.
5. Show the saved information in your app.
6. Test with a classmate and deploy when it is ready.

Keep it small. A working version with one good feature is better than lots of half-finished features.

## Running this example

You need [Node.js](https://nodejs.org/) installed on your computer.

```bash
npm install
npm run dev
```

Open the local address shown in the terminal, usually `http://localhost:5173`.

To check the project before deployment:

```bash
npm run lint
npm run build
```

## Firebase reminder

Firebase lets an app recognise players and save shared data. Before using Firebase in your own project, create or use a Firebase project and add your app's configuration in `src/firebase.js` (or use environment variables if your instructor asks you to).

Never share passwords, private keys, or secret tokens in your code or in a public GitHub repository. The Firebase web configuration used by a browser app is not a password, but your Firestore rules decide who can read and change your data.

For this first week, focus on getting data to save and load. You will learn how to make Firestore rules safer in a later lab.

## Getting unstuck

- Read error messages slowly — they often name the file and line that need attention.
- Change one thing at a time, then refresh and test it.
- Ask a classmate to explain what they see before asking them to fix it for you.
- Ask your instructor for help if you are stuck for more than a few minutes.

Have fun building something that feels like yours!
