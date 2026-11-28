# Understory

Browser 3D adventure game (three.js), three playable animals, solo or up to 3 players online.
Live at https://unrivaled-speculoos-314f1b.netlify.app (Netlify project `unrivaled-speculoos-314f1b`).

## Layout
- `public/index.html` — the original game (Hollow Creek, three chapters): CSS, HTML and one large script.
  Some lines are very long; edit with targeted replacements, never by rewriting the file wholesale.
- `public/stories.html` — "Field Notes", the anthology levels, on their own engine. `?lv=pond|rig|links`
  picks the level; only that level's script is loaded.
  - `public/stories/engine.js` — renderer (shadows, bloom/grade pass, caustics, depth-aware water), movement
    (land / float / dive), dialogue, journal, NPCs, tag-along partners, stations, saves, netcode.
  - `public/stories/pond.js`, `rig.js`, `links.js`, `city.js`, `peak.js`, `dam.js` — one level each: terrain,
    props, cast, story, puzzles. A level is one `U.level({...})` call; pond.js is the reference for the shape.
    `lab.js` is not a story: it is a test yard for engine features (`?lv=lab`, not listed on the title screen).
  - `tools/LEVELS.md` — the level-building reference: every engine call a level can make. Read it before
    writing or changing a level.
  - `public/stories/critters.js` — the character kit (`Critter.*`): smooth, big-eyed, springy rigs.
    Loaded by BOTH pages; index.html's cast is built from it too. Keep it dependency-free (THREE only).
  - `public/stories/ui.css` — a copy of index.html's inline CSS, shared look for stories.html.
- `public/three.min.js` (r160), `public/peerjs.min.js` — vendored libraries, don't edit.
- `netlify/server/index.mjs` — WebSocket relay for "Play together" at `/ws` (Netlify server, `ws` package).
- `netlify.toml` — publish `public/`, route only `/ws` to the server.

## Multiplayer
Host-authoritative: the host device owns story state `S`; clients send ops and position updates.
Default transport = WebSocket relay (`relaySocket` in index.html). `?p2p=1` = old PeerJS/WebRTC path,
`?bc=1` = BroadcastChannel between tabs of one browser (for testing). The relay only routes; it stores nothing.
Field Notes uses the same relay and op model (`?bc=1` works there too; no PeerJS path). Its hello carries
`v:'s1'` and the level id, so the two games can't join each other's rooms; a client that types a code for a
different level is redirected to that level. Characters nobody is playing become NPC "tag-alongs" that do
skill-gated jobs when asked (`needs()`) and hold their stations (`station()`), so every level is completable
solo; with real players those same jobs need the right person in the right place.

## Running locally
`npm install`, then `npx netlify dev` (serves the page and the relay together).
Opening index.html as a file uses the production relay.

## History
- Nov 15: built as a claude.ai artifact (https://claude.ai/artifact/Rj1qEraLwk59B54aFMYNcy). That copy is
  OUT OF DATE: it has no relay and cannot host one. Do not use it as a source.
- Nov 15: Netlify agent replaced peer-to-peer multiplayer with the relay (cross-network joins failed).
- Nov 26: this repo rebuilt from the artifact + the Netlify agent's diff; verified two headless browsers
  host/join through the relay.
- Nov 26: added Field Notes (stories.html: Still Water, Pressure, Out of Bounds) and a graphics pass on the
  original (critter-kit cast, shadow-casting sun, bloom).

## Testing without a GPU
Headless Chromium works with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. It renders
a few frames a second, so scripted playthroughs should call `LV.tick` / `updateNPCs` directly to pass time
rather than waiting. stories.html sets `window.ready` once a level has booted.
Serve `public/` on port 8123 first (`cd public && python3 -m http.server 8123`), then:
- `node tools/lab-test.cjs` — engine feature checks; run after any change to engine.js.
- `node tools/story.cjs <lv> <char> tools/steps/<lv>.cjs` — scripted playthrough of a level as one character;
  every level should finish (`flag('done')`, errors=0) as each of its three characters.
- `node tools/shot.cjs <url> <out.png> "<js>"` — a screenshot after running some JS in the page.
(`tools/` scripts are `.cjs` because package.json is `"type": "module"`.)
