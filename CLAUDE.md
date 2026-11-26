# Understory

Browser 3D adventure game (three.js), three playable animals, solo or up to 3 players online.
Live at https://unrivaled-speculoos-314f1b.netlify.app (Netlify project `unrivaled-speculoos-314f1b`).

## Layout
- `public/index.html` — the whole game: CSS, HTML and one large script. Some lines are very long; edit
  with targeted replacements, never by rewriting the file wholesale.
- `public/three.min.js`, `public/peerjs.min.js` — vendored libraries, don't edit.
- `netlify/server/index.mjs` — WebSocket relay for "Play together" at `/ws` (Netlify server, `ws` package).
- `netlify.toml` — publish `public/`, route only `/ws` to the server.

## Multiplayer
Host-authoritative: the host device owns story state `S`; clients send ops and position updates.
Default transport = WebSocket relay (`relaySocket` in index.html). `?p2p=1` = old PeerJS/WebRTC path,
`?bc=1` = BroadcastChannel between tabs of one browser (for testing). The relay only routes; it stores nothing.

## Running locally
`npm install`, then `npx netlify dev` (serves the page and the relay together).
Opening index.html as a file uses the production relay.

## History
- Nov 15: built as a claude.ai artifact (https://claude.ai/artifact/Rj1qEraLwk59B54aFMYNcy). That copy is
  OUT OF DATE: it has no relay and cannot host one. Do not use it as a source.
- Nov 15: Netlify agent replaced peer-to-peer multiplayer with the relay (cross-network joins failed).
- Nov 26: this repo rebuilt from the artifact + the Netlify agent's diff; verified two headless browsers
  host/join through the relay.
