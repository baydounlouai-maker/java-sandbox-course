# Java Island

A hands-on Java course where the classes you write come to life in a 3D world.
Write a `Zombie` class with a `color` and a `height`, add it to the world, and it
walks onto the island looking exactly like your fields say.

Everything runs in the browser. There's no server and no build step: it's plain
HTML, CSS and JavaScript that GitHub Pages can host as-is.

## What's inside

- **20 lessons, from Hello World to a final project.** Variables, math, strings, if/else, loops,
  methods, arrays, classes, constructors, object methods, encapsulation,
  static/final, inheritance, overriding and polymorphism, abstract classes,
  interfaces, composition (monsters holding weapons), `ArrayList`, a capstone
  project, plus a free-play island.
- **Students write all the code.** No multiple choice and no fill-in-the-blank. Each lesson has
  steps that are checked against what the program actually did, plus hints and
  a reference solution.
- **A Java engine written for the browser** (`js/java/`). It parses, type-checks
  and runs the subset of Java the course needs: classes, inheritance, abstract
  classes, interfaces, overloading, overriding, static, final, exceptions,
  arrays, `ArrayList`, `String`, `Math`, `printf` and more. Compile errors are
  explained in plain English with a hint, the way a teacher would say it.
  Programs run in a Web Worker, so an endless loop can't freeze the page.
- **A 3D world built with three.js** (`js/world/`). `World.add(obj)` draws any object by reading
  its fields (`name`, `color`, `height`, `size`, `x`, `z`, `health`, `angry`,
  `hat`, `weapon`, `shield` and more) and its class name (Zombie, Skeleton,
  Slime, Ghost, Bat, Robot; anything else becomes a friendly blob). Anything
  with a `getAltitude()` method flies. `World.pause(seconds)` turns field
  changes into smooth animation. Clicking a creature shows its fields and calls
  its `speak()` method.
- **Progress is saved in the browser** (localStorage): code per lesson,
  finished steps and lessons.
- **A one-hour final exam** (`exam.html`, linked from the top bar). 34 questions worth
  100 points: multiple choice, true or false, fill in the blanks, find and fix the
  compile errors, and write-the-code questions (those only use topics from before
  classes). Interfaces and generics aren't in it. The timer keeps running if the tab
  is closed and the exam is handed in at 0:00. Code answers are marked by running
  hidden tests in a worker. The results page explains every answer and links to the
  lessons worth revisiting. Answers and past results live in localStorage.
- **Live tutoring rooms.** Press *Invite someone* and share the link. Everyone
  in the room edits the same files with live cursors, follows the same
  lesson, sees each other's pointer in the 3D world, and when anyone presses
  Run it runs for everybody.

## How the live rooms work without a server

The shared code is a [Yjs](https://yjs.dev) document, so edits from several
people merge cleanly. The document is synced directly between browsers
over WebRTC. Browsers still need a way to find each other first ("signaling").
[Trystero](https://github.com/dmotz/trystero) handles that through public
Nostr relays, so nothing has to be hosted. Only connection setup goes through
the relays. The code itself travels directly between the browsers, encrypted
by WebRTC.

Limits worth knowing:

- Very strict networks (some school or office firewalls) can block direct
  WebRTC connections. Fixing that takes a TURN relay server, which you can add
  through `turnConfig` in `js/collab.js` if you ever need it.
- The room lives in the open tabs. Each browser also keeps a copy of the
  room's code, so rejoining with the same link brings it back.

## Run it locally

Any static file server works, for example:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` straight from disk won't work, because browsers block
module workers on `file://`.

## Deploy on GitHub Pages

Settings → Pages → *Deploy from a branch* → `main` / root. The `.nojekyll`
file makes Pages serve the files exactly as they are.

## Project layout

```
index.html            page shell
css/style.css         the Toybox look
js/app.js             UI: lessons, editor, output, rooms
js/lessons.js         every lesson: text, steps (checks), hints, starter + solution code
js/checks.js          what lesson checks can look at after a run
js/runner-worker.js   compiles and runs code off the main thread
js/session.js         where code lives: localStorage or a shared room document
js/collab.js          Yjs over WebRTC (Trystero)
js/editor.js          CodeMirror 6 setup
exam.html, css/exam.css, js/exam/
                      the final exam: questions.js (questions + answer key),
                      grade.js (marking), exam-worker.js, exam.js (UI)
js/java/              the Java engine: lexer, parser, compiler, runtime, built-in classes
js/world/             three.js world, creature models, animation timeline
vendor/               pre-built bundles of three.js, CodeMirror, Yjs and Trystero
tools/                scripts that rebuild vendor/
tests/                engine, lesson and browser tests
```

## Development

Node is only needed for tests and for rebuilding the vendor bundles. The site
itself doesn't use it.

```sh
npm install
npm test                  # error-message tests, every lesson's solution, and the exam's answer key
node tests/exam-browser.mjs   # takes the whole exam in headless Chrome (local server on :8765)
npm run build:vendor      # rebuild vendor/ after updating a library
node tests/smoke.mjs      # headless browser run (needs a local server on :8765 and Chrome)
node tests/collab.mjs     # two browsers in one live room
```

### Adding a lesson

Add an object to `LESSONS` in `js/lessons.js`. Each step's `check(r)`
receives the result of running the student's code. `r.out` holds the printed
lines, `r.entities` the objects in the world, and `r.cls('Zombie')` shows a
class's fields, methods and parent. `r.call(obj, 'grow')` calls a method on a
live object, and `r.has('for')` asks whether a language feature was used. A
check returns `true` when the step is done, or a short string telling the
student what's still missing. `npm test` makes sure your solution passes.

### Changing the exam

Questions live in `js/exam/questions.js`. `npm test` (via `tests/exam.mjs`)
proves the answer key with the real engine. Every "what does this print"
question with `run` set must print exactly its correct option. Every accepted
blank must compile and print `expect`. Every broken program must fail to compile
while its `solution` gets full marks. Every write-the-code solution must pass
all its tests, and its starter must pass none. Points must add up to 100.
