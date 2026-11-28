# Building a Field Notes level

A level is one file, `public/stories/<id>.js`: an IIFE that calls `U.level({...})` once. `stories.html?lv=<id>`
loads `three.min.js`, `critters.js`, `engine.js`, then that file, then calls `boot()`. Everything declared at
the top level of `engine.js` is a global the level can call directly. Read `pond.js` first (the reference),
then `links.js` (a whodunit with a random culprit) and `lab.js` (a tiny yard that exercises the newer features).

Coordinates: `x` east, `z` south (north is `-z`), `y` up. A character facing `yaw` looks along `(sin yaw, cos yaw)`.

## The level object

```js
U.level({
  id, title, tag, order: ['a', 'b', 'c'],            // three character keys, in title-screen order
  chars: { a: {...}, b: {...}, c: {...} },             // see "Characters"
  who: { npcId: { name, pitch } },                     // speakers other than the three leads
  state: () => ({ ... }),                              // extra fields for the shared state S
  rand(seed) { return {...}; },                        // per-playthrough variation -> global R (use mulberry(seed))
  env: { spawn: (i) => [x, z] | [x, z, y], camYaw, bound: { r, x, z }, edge: 'text at the world edge',
         waterY: number | (x, z) => number,            // omit for no water; may differ by region (see lab.js)
         sea: true, ceil,                              // whole level under water (see rig.js); ceil also caps flight
         caustics: 0..1, shadows: false, shadowK,
         under: { fog, fd, hemS, hemG, sun, bloom, grade },   // look when the camera is under water
         motes: { n, col, size, op, rise, night }, umotes: {...},   // drifting specks (rise < 0 falls: snow)
         tracks: { n, col, op, gap, on: (x, z) => bool },    // players leave footprints where on() is true
         moundCol },                                   // colour of a burrower's mound
  moods: { name: { top, hor, sunC, sunI, hemS, hemG, hemI, fog, fd, dir: [x, y, z], stars, cloud, cl, bloom, grade: [r, g, b], lamps } },
  moodFor: () => 'name',                               // re-read whenever S.st changes
  audio: { scale | scales: { mood: [hz...] }, timbre, density, len, birds, frogs, deep, wind, windF, rumble, humF },
  hum: () => 0..1,                                     // machine hum near infrastructure
  D: { id: [script] | () => [script] },                // dialogue, see below
  CLUES: { id: [title, text] }, ITEMS: { id: [name, text] },
  DISC: { id: [title, text, hintWhenUnfound, { charKey: 'aside' }] },
  NEWS: { flag: 'did a thing' },                       // toast shown to the other players when that flag is set
  cards: { intro: [[title, text, kind, kicker]], outro: [..., [title, text, 'end']] },
  palTalk(k) { return [script]; },                     // what tag-along k says when talked to (orders are appended)
  tasks() { return [{ h, sub, items: [{ t, done }] }]; },   // journal
  objective() { return { t, at: [x, z] | [x, z, y] }; },    // HUD line and arrow
  build() { ... },                                     // make the world: terrain first, then everything else
  tick(dt, t) { ... }, sync() { ... },                 // per frame; after every state change (set visibility from S here)
  onStage(v, local), onOp(o, local, by), onSense(k) -> true to swallow, onBegin(), onMsg(m, fromId), onCaught(watcher),
  force(player, mode) -> [vx, vy, vz] | null,          // wind / current, applied in 'float', 'dive', 'fly' (and on land if you return it)
  canBurrow(x, z) -> bool, hidden(watcher) -> bool, speedMul() -> number, animSt(st), noOrders
});
```

`S` is shared story state: `{ st (stage number), f: {flags}, clues: [], inv: [], disc: [], hold: {}, c: {} }` plus your
`state()` fields. Change it only through: `setFlag(k)`, `flag(k)`, `stage(n)` (only goes up), `setVal(key, v)`,
`addTo(list, v)`, `dropFrom(list, v)`, `addClue(id)`, `give(itemId)`, `has(itemId)`, `discover(discId)`.
Every op is idempotent and is replayed on the other players' devices. Never keep puzzle progress in local
variables unless it is deliberately private to one player (information another player must be told aloud).
Make stage changes depend on flags in `sync()` (see pond.js), never only on someone finishing a conversation.

## Characters

```js
key: { name, role: 'The something', blurb, pitch, skills: ['a', 'b'], make: () => rig, home: [x, z, yaw] | [x, z, yaw, y],
       speed, jump, r, eye, cam,                       // land
       swim, draft, jumpWater,                         // floating: draft = how deep the feet sit
       dive: true, diveSp, sink, fish: true, leap,     // free swimming; fish never floats; leap = burst out of the surface (hold up while rising)
       fly: true, flySp,                               // jump, then jump again in the air to fly; land by touching down without holding up
       flaps, flapVy, glide,                           // (non-flyers) extra air jumps, slow fall
       climb: speed,                                   // clings to and climbs block() walls; also ignores the slope limit on terrain
       burrow: true, burrowSp,                         // down goes under (where LV.canBurrow allows), jump comes up; passes `low` colliders/blocks; unseen
       sneak: 0..1,                                    // multiplies watchers' range
       sense: { k, name, sfx, col, far: 'It gets stronger to the', none: ['...'], icon: '<svg>', scout: 3, scoutT },
       tip, barks: [...], sayFollow, sayStay, sayHome, floatHome }
```

`sense.k` matches `ix({ sense: k, found })`: sensing near a hidden ix reveals it, sensing far away gives a compass
direction. `scout` zooms the camera out for a few seconds when sensing. Handle anything else in `LV.onSense(k)`.

Rigs come from `critters.js` (`Critter.duck/frog/turtle/fish/angler/isopod/dumbo/human/vinca/fox/raccoon/deer/
owl/crow/heron/beaver/possum/squirrel`, and the general `Critter.quad({...})`, `Critter.bird({...})`), or build your
own in the level file from `Critter.rig(h)`, `ball`, `limb`, `cone`, `grp`, `eyes`, `blush`, `mat`, `life` — see
the NPC makers in rig.js. A rig is `{ g, root, head, eyes, h, anim(dt, t, st) }`; `st` carries
`speed, air, vy, swim, dive, fly, cling, hold, off, talk, act ('sense'), look, ride`. Call `Critter.life(c, dt, st)`
first in `anim` for blinking, squash and floppy springs. Characters must be cute: big head, big glossy eyes
(`Critter.eyes`), blush, short limbs, and animation on every state they can be in.

Skills gate jobs. `needs(skill, fn(mine), { call, npc })`: runs `fn(true)` if my character has the skill; if another
*player* has it, shows `call` and tells you to fetch them; if nobody is playing that character, plays the `npc`
script (the tag-along does it) then `fn(false)`. This is what makes every level finishable solo.
`canUse(skill)`, `whoHas(skill)`, `isPlayed(charKey)`, `someoneHas(skill)`, `nameOf(charKey)`, `CH()` (my character), `MY.char`.

Tag-alongs (leads nobody is playing) stand at `home`, walk to their stations, and take orders from any player:
talking to one appends "Come with me / Wait here / Head back". `palAt(k)` is their position (or null),
`palNear(k, x, z, r)`. Their order is `S['pal_' + k]`.

## Dialogue

`say(script | 'id')`. A script is an array of: `L('who', text)`, `N(narration)`, `ME({ charKey: text })`,
`{ c: [{ t: text, r: [script] }] }` (choices), `{ do: fn }`, `{ if: fn, then: [...], else: [...] }`.
`text` may be a string, a function, or `{ a: '..', b: '..', all: '..' }` keyed by who is playing. Lines by a lead are
written `L('charKey', ...)` and are spoken whether or not anyone is playing them: write scenes as an ensemble.
`toast(html, ms)`, `bubble(text, object3D)`, `openSheet(html, onClose)`, `closeSheet()`, `showCards(cards, done)`,
`fade(mid, after)`. Custom puzzles are `openSheet` HTML with your own handlers (see `openBoard` in pond.js).

## World building

`terrain({ size, n, height(x, z), color(x, z, h) -> [r, g, b], shade(x, z) })` first; then `heightAt(x, z)`.
`water({ x, z, size | sx, sz, seg, shallow, deep, murk, flow: [vx, vz], flat, level: () => y })` — call once per body of water.
`mesh(geo, colour | material, x, y, z, sx, sy, sz, rx, ry, rz)`, `group(...)`, `place(obj, x, z, dy)`, `GEO.box/cyl/sph/cone/ball/tube`,
`M(colour, opts)`, `glow(colour, opacity)`, `inst(geo, material, [{ x, y, z, s | sx, sy, sz, rx, ry, rz, c }], { cast, recv })`,
`scatter(n, radius, fn(x, z, h) -> instance | 0, cx, cz)`, `tuftGeo(blades, h, w, lean)` with `TUFT_MAT()`,
`treeTemplates()` (oak0-4, pine0-2, birch0-1; use with `inst(T.oak0, VMAT, [...])`), `tinted`/`buildGeo`/`poly`/`blob`/`leaf3`/`barkCol`,
`sign(lines, w, h, bg, fg, size, font)`, `textTex`, `canvasTex`, `lamp(x, y, z, colour, intensity, dist)` (lit by mood `lamps`),
`beam(x, y, z, r0, r1, h, colour, opacity, rx, rz)`, `puff`, `burst`, `ringAt`, `nameSprite`, `WORLD.anim.push((dt, t) => ...)`.
Noise and maths: `fbm`, `vnoise`, `hash2`, `sstep`, `smooth`, `lerp`, `clamp`, `mix3`, `hex`, `rr`, `rnd`, `pick`, `mulberry`, `angDiff`, `segDist`, `polyDist`.

Solids:
- `addCol(x, z, r, { top, bot, low })` — a circular pillar. `low: true` lets burrowers through.
- `block(x0, x1, z0, z1, top, { bot, low, climb: false, step, noCam })` — a box with walls and a walkable top; `.on = false` opens it.
- `addPlat({ x, z, r, y } | { x0, x1, z0, z1, y, only: [charKeys], step })` — a floor with no walls (`y` may be a getter).

## Things in the world

- `ix({ id, at: [x, z] | [x, y, z], r, label, when, act, sense, found, float, quiet, under, col, dy })` — something to tap.
  `float` sits on the water; `under: true` can be used while burrowed; `sense` hides it until sensed.
- `npc(id, rig, x, z, yaw, { y, s, talk, label, when, barks, reach, r, noCol, turn, swim, float, voice, speed })` → `n`.
  `n.path = [[x, z, , wait]...]` patrols; `n.goto = [x, z, y]`; `n.tick = (dt, t, st, distToPlayer) => ...`; `npcMove(n, x, z, y)`.
- `station({ id, at, r, skill, label, when, float, dy, manual })` — a spot held while a player with `skill` stands on it.
  `held(id)`. Unplayed characters hold theirs automatically; with `manual: true` only once you have posted them there.
- `carriable({ id, at, mesh, label, skill, heavy, when, lift, rest, onPick, onDrop })` — one thing at a time, held overhead and
  visible to everyone. `holding(id)`, `putDown()`, `consume(id)`, `carryAt(id)`. A receptacle is an ix with `when: () => holding('x')`.
- `pushable({ id, at: [x, z], r, mesh, skill, no, ok(x, z), onMove(p, dist) })` — shoved by walking into it.
- `watcher({ at: () => [x, y, z, yaw], range, fov, when, rate, dy, cone, caught() })` — a vision cone on the ground. Standing in it
  fills an eye; when full, `caught()` runs (send the player back with `fade` + `placePlayer` and a quip; never punish harder).
- `ride({ at(dt, t) -> [x, y, z, yaw] | null, anim, swim, air, leave, onEnd(finished) })` — carry the player along a path; jump hops off.
- `tracks(n, colour, opacity).add(x, z, yaw, size, stretch)` — marks on the ground (evidence trails).
- `placePlayer(x, z, y)`, `player` (`x, y, z, yaw, mode: 'land'|'float'|'dive'|'fly'|'ride', flying, burrow, under`), `AV` (other players), `clock()` (seconds, same on every device).

## Rules that keep multiplayer honest

- Three players, one of each character; anyone missing is a tag-along. Every job must be doable solo through `needs()`,
  stations and orders, and must genuinely need the right player when that character is being played.
- Give each character a domain the others cannot enter, and a finale that needs all three at once.
- Put at least one piece of information where only one player can see it, so they have to say it out loud.
- NPC motion that matters to the story must be derived from shared state or from player/avatar positions, because every
  device simulates its own NPCs.

## Testing (no GPU needed)

Serve `public/` on port 8123 (`cd public && python3 -m http.server 8123`). Headless Chromium renders a few frames a
second, so scripts must not wait for things to happen in real time.

- `node tools/lab-test.cjs` — engine feature checks (run after touching engine.js).
- `node tools/story.cjs <lv> <charKey> tools/steps/<lv>.cjs [shotPrefix]` — a scripted playthrough. The steps file exports
  `(ch) => [...]` where a step is an ix id (`'npc_lou'`: go there and act), `{ js }`, `{ shot: 'name' }`, `{ wait: ms }`,
  `{ expect: 'js' }`, and `{ js, sheetJs }` to drive a puzzle sheet. Dialogue is auto-advanced (choices picked at random).
  `LOG=1` prints every line spoken. See `tools/steps/pond.cjs`; pass time with a `sim` step that calls `LV.tick` / `updateNPCs` in a loop.
- `node tools/shot.cjs <url> <out.png> "<js to run>" [w h]` — one screenshot.
