'use strict';
/* Understory: Field Notes. The engine the anthology levels run on (stories.html).
   It shares its look, its dialogue format and its multiplayer relay with the original game in index.html,
   but each level brings its own world: see pond.js, rig.js, links.js. Characters come from critters.js. */
THREE.ColorManagement.enabled = false;
const QS = new URLSearchParams(location.search);

const $ = (s) => document.querySelector(s);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const sstep = (a, b, x) => smooth((x - a) / (b - a));
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry(20261115);
const rr = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function hash2(ix, iz) { let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z) { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, z, o) { let s = 0, a = .5, f = 1; for (let i = 0; i < (o || 4); i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= .5; } return s; }
function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
function polyDist(px, pz, poly) { let m = 1e9; for (let i = 0; i < poly.length - 1; i++) { const d = segDist(px, pz, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]); if (d < m) m = d; } return m; }

/* colliders (circles in a grid) */
const COLS = new Map(), CELL = 8;
function addCol(x, z, r, o) { const c = Object.assign({ x, z, r, on: true }, o || {}); const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL); if (!COLS.has(k)) COLS.set(k, []); COLS.get(k).push(c); return c; }

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const GEO = {};
function mx(x, y, z, sx, sy, sz, rx, ry, rz) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz)); }
function canvasTex(w, h, draw, o) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); Object.assign(t, o || {}); return t; }

/* ---------------- geometry helpers (faceted, hand-tinted, as in the original) ---------------- */
function tinted(geo, m, colorFn) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) g.applyMatrix4(m);
  const p = g.attributes.position.array, n = p.length / 3, col = new Float32Array(n * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) { a.fromArray(p, i * 3); b.fromArray(p, i * 3 + 3); c.fromArray(p, i * 3 + 6); nn.subVectors(b, a).cross(c.sub(a)).normalize();
    const k = colorFn(nn, (a.y + b.y + (c.y + a.y)) / 3); for (let j = 0; j < 3; j++) col.set(k, (i + j) * 3); }
  return { p, col };
}
function buildGeo(parts) { let n = 0; parts.forEach(q => n += q.p.length); const pos = new Float32Array(n), col = new Float32Array(n); let o = 0; parts.forEach(q => { pos.set(q.p, o); col.set(q.col, o); o += q.p.length; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g; }
function blob(seed, detail) { const g = new THREE.IcosahedronGeometry(1, detail === undefined ? 1 : detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (vnoise(x * 1.9 + seed, y * 1.9 + z * 2.7 + seed * 1.3) - .5) * .55; p.setXYZ(i, x * k, y * k, z * k); } return g; }
const leafCol = (base, amp) => { const b = hex(base); return (nn) => { const l = .8 + nn.y * .27 + (rnd() - .5) * (amp || .18), w = Math.max(nn.y, 0) * .07; return [b[0] * l + w, b[1] * l + w * .8, b[2] * l - w * .3]; }; };
const barkCol = (base, fleck) => { const b = hex(base); return () => { if (fleck && rnd() < .16) return [.2, .19, .17]; const l = .85 + rnd() * .3; return [b[0] * l, b[1] * l, b[2] * l]; }; };

/* three flat tones per canopy: lit top, mid side, cool underside */
const leaf3 = (base, amp) => { const b = hex(base); return (nn) => { const j = 1 + (rnd() - .5) * (amp || .1), l = nn.y > .38 ? 1.2 : nn.y < -.2 ? .62 : .9 + nn.x * .08; return [Math.min(1, b[0] * l * j + (nn.y > .38 ? .05 : 0)), Math.min(1, b[1] * l * j + (nn.y > .38 ? .04 : 0)), Math.min(1, b[2] * l * j + (nn.y < -.2 ? .04 : 0))]; }; };
function poly(seed) { const g = new THREE.IcosahedronGeometry(1, 0), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (hash2(Math.round(x * 31 + seed * 7), Math.round(y * 17 + z * 53 + seed)) - .5) * .5; p.setXYZ(i, x * k, y * k, z * k); } return g; }
function treeTemplates() {
  const T = {}, cyl = (rt_, rb, h, n) => new THREE.CylinderGeometry(rt_, rb, h, n || 5, 1, true);
  const oak = (c, c2, seed) => buildGeo([
    tinted(cyl(.2, .42, 3.6), mx(0, 1.8, 0, 1), barkCol(0x5b4330)), tinted(cyl(.08, .14, 1.5, 4), mx(.5, 3.1, .1, 1, 1, 1, 0, 0, -.9), barkCol(0x5b4330)),
    tinted(poly(seed), mx(0, 4.7, 0, 2.5, 2.0, 2.5, 0, seed), leaf3(c)), tinted(poly(seed + 3), mx(1.55, 3.9, .5, 1.6, 1.3, 1.6, 0, seed * 2), leaf3(c2)),
    tinted(poly(seed + 5), mx(-1.35, 4.0, .6, 1.7, 1.35, 1.7, .3, seed), leaf3(c2)), tinted(poly(seed + 7), mx(.1, 5.9, -.6, 1.55, 1.3, 1.55, 0, seed * 3), leaf3(c))]);
  T.oak0 = oak(0x6fa346, 0x82b04c, 1); T.oak1 = oak(0x9aa83e, 0xb3b346, 12); T.oak2 = oak(0x3f7d52, 0x4f8c52, 23); T.oak3 = oak(0xe2ad38, 0xedc04e, 34); T.oak4 = oak(0xcf6a2e, 0xde8a38, 45);
  const pine = (c, seed) => { const tier = (r, h, y, s) => { const g = new THREE.ConeGeometry(r, h, 6, 1, true), p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { const k = 1 + (hash2(i + Math.round(seed * 9), Math.round(y * 5)) - .5) * .35; p.setXYZ(i, p.getX(i) * k, p.getY(i) - (k - 1) * 1.2, p.getZ(i) * k); } return tinted(g, mx(0, y, 0, 1, 1, 1, 0, s, 0), leaf3(c, .14)); };
    return buildGeo([tinted(cyl(.15, .3, 2.6), mx(0, 1.3, 0, 1), barkCol(0x4a3628)), tier(1.9, 2.5, 2.9, seed), tier(1.5, 2.3, 4.3, seed + 1.1), tier(1.1, 2.1, 5.6, seed + 2.3), tier(.66, 1.8, 6.9, seed + 3.1)]); };
  T.pine0 = pine(0x2f6a5c, .2); T.pine1 = pine(0x4a7f46, .9); T.pine2 = pine(0xb9585a, 1.7);
  const birch = (c, seed) => buildGeo([tinted(cyl(.1, .16, 5, 4), mx(0, 2.5, 0, 1), barkCol(0xf0ebde, true)),
    tinted(poly(seed), mx(.1, 5.2, 0, 1.5, 1.15, 1.5, 0, seed), leaf3(c, .16)), tinted(poly(seed + 2), mx(-.75, 4.3, .5, 1.05, .85, 1.05), leaf3(c, .16)), tinted(poly(seed + 4), mx(.7, 4.1, -.6, 1.0, .8, 1.0), leaf3(c, .16))]);
  T.birch0 = birch(0xe6c644, 51); T.birch1 = birch(0xbccb52, 62);
  return T;
}
function textTex(lines, w, h, bg, fg, size, font) { return canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; lines.forEach((l, i) => { const big = i === 0; g.font = `${big ? 700 : 500} ${big ? size : size * .56}px ${font || 'Georgia, serif'}`; g.fillText(l, w / 2, h * (i + .75) / (lines.length + .5)); }); }); }

/* ---------------- sound unlock, tones, relay socket (shared with the original game) ---------------- */
const AU = { ctx: null, g: null, step: 0, n: 3, tag: null, kicked: 0, humLv: 0, bus: {} };
const isMuted = () => !!PREF.mute;
function silentWavURL() { const n = 2400, b = new Uint8Array(44 + n), v = new DataView(b.buffer), w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); }
function audioUnlock() {
  if (isMuted()) return;
  try {
    if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) { } }
    if (!AU.tag) { const a = AU.tag = document.createElement('audio'); a.src = silentWavURL(); a.loop = true; a.preload = 'auto'; a.setAttribute('playsinline', ''); try { a.disableRemotePlayback = true; } catch (e) { } }
    if (AU.tag.paused) { const pr = AU.tag.play(); if (pr && pr.catch) pr.catch(() => { }); }
    if (!AU.ctx) audioBuild();
    if (AU.ctx && AU.ctx.state !== 'running') { const pr = AU.ctx.resume(); if (pr && pr.catch) pr.catch(() => { }); }
    if (AU.ctx && !AU.kicked) { const s = AU.ctx.createBufferSource(); s.buffer = AU.ctx.createBuffer(1, 1, 22050); s.connect(AU.ctx.destination); s.start(0); AU.kicked = 1; }
  } catch (e) { }
}
const audioOn = () => !!(AU.ctx && AU.ctx.state === 'running' && !isMuted());
function tone(f, d, type, v, slide, delay, bus) { const a = AU.ctx; if (!a || isMuted() || a.state !== 'running') return; try { const t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v || .2, t + .012); g.gain.exponentialRampToValueAtTime(.0008, t + d); o.connect(g); g.connect(AU.bus[bus || 'sfx']); o.start(t); o.stop(t + d + .05); } catch (e) { } }
function noiseHit(f, q, d, v, delay) { const a = AU.ctx; if (!a || isMuted() || a.state !== 'running') return; try { const t = a.currentTime + (delay || 0), s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(); s.buffer = AU.noise; fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d); s.connect(fl); fl.connect(g); g.connect(AU.bus.sfx); s.start(t, Math.random()); s.stop(t + d + .05); } catch (e) { } }
for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(ev, audioUnlock, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { try { if (document.hidden) { if (AU.ctx) AU.ctx.suspend(); if (AU.tag) AU.tag.pause(); } else if (!isMuted()) { if (AU.ctx) AU.ctx.resume(); } } catch (e) { } });
const RELAY_URL = QS.get('relay') || (/^https?:$/.test(location.protocol) ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws` : 'wss://unrivaled-speculoos-314f1b.netlify.app/ws');
const relayId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
/* A WebSocket to the relay that quietly reconnects after short drops (phones sleeping, network hand-offs,
   the platform recycling connections). Messages sent while it is reconnecting are queued. */
function relaySocket(params, h) {
  let ws = null, ready = false, closed = false, everReady = false, tries = 0, downSince = 0, timer = 0; const q = [];
  const url = RELAY_URL + (RELAY_URL.includes('?') ? '&' : '?') + new URLSearchParams(params);
  const give = (e) => { if (closed) return; closed = true; clearTimeout(timer); try { ws && ws.close(1000); } catch (_) { } everReady ? h.onLost(e) : h.onError(e); };
  function open() { if (closed) return; let s; try { s = ws = new WebSocket(url); } catch (e) { return retry(); }
    s.onmessage = (ev) => { if (ws !== s) return; let d; try { d = JSON.parse(ev.data); } catch (_) { return; }
      if (d && d.t === '__ready') { ready = true; tries = 0; downSince = 0; const first = !everReady; everReady = true; while (q.length && s.readyState === 1) s.send(q.shift()); if (first) h.onReady(); return; }
      if (d && d.t === '__err') { if (everReady && d.e === 'peer-unavailable') return; return give(d.e); } if (d && d.t === '__closed') return give('closed'); h.onData(d); };
    s.onclose = () => { if (ws !== s) return; ready = false; ws = null; retry(); }; s.onerror = () => { }; }
  function retry() { if (closed) return; if (!downSince) downSince = Date.now(); if (Date.now() - downSince > (everReady ? 18000 : 9000)) return give(everReady ? 'closed' : 'noserver');
    timer = setTimeout(open, Math.min(4000, 300 * 2 ** tries++)); }
  open();
  return { send(m) { if (closed) return; const d = JSON.stringify(m); if (ready && ws && ws.readyState === 1) ws.send(d); else if (q.length < 300) q.push(d); }, close() { if (closed) return; closed = true; clearTimeout(timer); try { ws && ws.close(1000); } catch (_) { } } };
}
const ROOM_WORDS = ['MOSS', 'FERN', 'LEAF', 'BARK', 'PINE', 'TWIG', 'ROOT', 'SEED', 'POND', 'DUSK', 'DAWN', 'MIST', 'WREN', 'LARK', 'HAWK', 'DEER', 'FAWN', 'TOAD', 'NEWT', 'MOTH', 'BEAR', 'WOLF', 'LYNX', 'HARE', 'MOLE', 'VOLE', 'CROW', 'DOVE', 'SWAN', 'REED', 'SNOW', 'RAIN', 'GALE', 'FROG', 'CLAY', 'SAGE', 'MINT', 'NEST'];
const newCode = () => ROOM_WORDS[Math.floor(Math.random() * ROOM_WORDS.length)] + (10 + Math.floor(Math.random() * 90));

/* ---------------- the level, and the state it shares ----------------
   A level file calls U.level({...}). S is the shared story state: in multiplayer every change to it goes
   through op() so all devices agree. MY is this device's player. PREF is shared with the original game. */
let LV = null;
const U = { level(def) { LV = def; } };
const LEVELS = [
  { id: 'pond', n: 'One', title: 'Still Water', tag: 'A pond, a subdivision, and a smell like wet sidewalk.' },
  { id: 'rig', n: 'Two', title: 'Pressure', tag: 'Two kilometres down, under Platform Nine, the garden is dying politely.' },
  { id: 'links', n: 'Three', title: 'Out of Bounds', tag: 'Eighteen baskets, one herd, and a line of orange ribbon that lies.' }
];
let S = null, R = null;
const MY = { char: null, slot: null };
const PREF_KEY = 'understory.prefs.v1';
let PREF = { mute: false, name: '' };
try { Object.assign(PREF, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { }
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(PREF)); } catch (e) { } }
function freshState(seed) { return Object.assign({ v: 's1', lv: LV.id, seed: seed || (Math.random() * 2e9 | 0) + 1, st: 0, f: {}, clues: [], inv: [], disc: [], hold: {} }, LV.state ? LV.state() : {}); }
const has = (i) => S.inv.includes(i);
const flag = (k) => !!S.f[k];
const CH = () => LV.chars[MY.char];
const nameOf = (k) => LV.chars[k].name;
/* text that varies by who you are: string | {charKey: ..., all: ...} | fn */
const T = (t) => typeof t === 'function' ? T(t()) : (t && typeof t === 'object' && !Array.isArray(t)) ? (t[MY.char] !== undefined ? t[MY.char] : t.all || '') : t;
const WHO = { n: { name: '', pitch: 0 }, me: { name: () => CH().name, pitch: () => CH().pitch } };
const L = (s, t) => ({ s, t });
const N = (t) => ({ s: 'n', t });
const ME = (t) => ({ s: 'me', t });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const dirName = (dx, dz) => DIRS[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];

/* ---------------- colliders: circles in a grid, optionally only between two heights ---------------- */
function collide(p, pr) {
  const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = COLS.get((cx + i) + ',' + (cz + j)); if (!a) continue;
    for (const c of a) { if (!c.on || (c.top !== undefined && p.y > c.top) || (c.bot !== undefined && p.y + .5 < c.bot)) continue; const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + pr; if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } }
  }
}
/* things to stand on: { x, z, r, y } or { x0, x1, z0, z1, y }, optionally only: [charKeys] */
const PLAT = [];
function addPlat(p) { PLAT.push(p); return p; }
function floorAt(x, z, y, who) { let h = heightAt(x, z); for (const p of PLAT) { if (p.on === false || (p.only && !p.only.includes(who || MY.char))) continue; const inside = p.r ? Math.hypot(x - p.x, z - p.z) < p.r : (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1); if (inside && p.y > h && y >= p.y - (p.step || .55)) h = p.y; } return h; }

/* ---------------- renderer, sky, moods, light, and the finishing pass ---------------- */
let scene, camera, renderer, sun, sunFill, hemi, skyMesh, skyU, QUAL = 1, UW = 0, POST = null;
const WORLD = { anim: [] };
const CAUS = { value: new THREE.Vector4(0, -1e6, 0, .22) };  /* time, water level, strength, fade with depth */
/* any lambert material can carry caustic light: rippling sun below the water line */
function causticize(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => { if (prev) prev(s, r); s.uniforms.uCaus = CAUS;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\n vec4 wp4 = vec4(transformed, 1.);\n #ifdef USE_INSTANCING\n wp4 = instanceMatrix * wp4;\n #endif\n vWp = (modelMatrix * wp4).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform vec4 uCaus;').replace('#include <opaque_fragment>', `float cz = uCaus.y - vWp.y; if (cz > 0. && uCaus.z > 0.) { vec2 cp = vWp.xz * .42; float ct = uCaus.x;
      float ca = sin(cp.x * 1.7 + ct * 1.1 + sin(cp.y * 1.3 + ct * .7) * 1.6) + sin(cp.y * 2.1 - ct * .9 + sin(cp.x * 1.1 - ct * .6) * 1.8) + sin((cp.x + cp.y) * 1.2 + ct * .5) * .6;
      outgoingLight += vec3(.85, 1., .8) * pow(clamp(.5 + .21 * ca, 0., 1.), 5.) * uCaus.z * smoothstep(0., .5, cz) * exp(-cz * uCaus.w) * (.35 + .65 * diffuseColor.rgb); }\n#include <opaque_fragment>`); };
  m.customProgramCacheKey = () => 'caus' + (prev ? 'rim' : ''); return m;
}
const MATS = {};
const M = (c, o) => { const k = c + (o ? JSON.stringify(o) : ''); if (MATS[k]) return MATS[k]; const m = new THREE.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, o || {})); if (LV.env.caustics) causticize(m); return MATS[k] = m; };
let VMAT = null;
function mesh(geo, color, x, y, z, sx, sy, sz, rx, ry, rz) { const m = new THREE.Mesh(geo, typeof color === 'object' ? color : M(color)); m.position.set(x || 0, y || 0, z || 0); m.scale.set(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = m.receiveShadow = true; return m; }
const glow = (c, op) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, op ? { transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false } : {}));
function group(...kids) { const g = new THREE.Group(); kids.forEach(k => k && g.add(k)); return g; }
/* a soft additive shaft of light (sunbeams through leaves or water, lamps in the dark) */
function beam(x, y, z, r0, r1, h, col, op, rx, rz) { const g = new THREE.CylinderGeometry(r0, r1, h, 12, 1, true); g.translate(0, -h / 2, 0); const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { c: { value: new THREE.Color(col) }, op: { value: op }, h: { value: h } },
  vertexShader: 'varying float vY; varying vec3 vN, vV; void main(){ vY = -position.y / ' + h.toFixed(2) + '; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 c; uniform float op; varying float vY; varying vec3 vN, vV; void main(){ float e = pow(abs(dot(vN, vV)), 1.6); gl_FragColor = vec4(c, op * e * (1. - vY) * (1. - vY) * smoothstep(0., .08, vY)); }' })); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); m.frustumCulled = false; scene.add(m); return m; }

const COLK = ['top', 'hor', 'sunC', 'hemS', 'hemG', 'fog', 'cl'];
let moodNow = null, moodFrom = null, moodTo = null, moodT = 1;
function moodVals(m) { const o = { dir: m.dir.slice(), grade: (m.grade || [1, 1, 1]).slice(), sunI: m.sunI, hemI: m.hemI, fd: m.fd, stars: m.stars || 0, cloud: m.cloud === undefined ? .5 : m.cloud, bloom: m.bloom === undefined ? .55 : m.bloom, lamps: m.lamps || 0 }; for (const k of COLK) o[k] = hex(m[k] === undefined ? 0xffffff : m[k]); return o; }
function setMood(name, instant) { if (WORLD.mood === name && !instant) return; const v = moodVals(LV.moods[name]); if (instant || !moodNow) { moodNow = v; moodT = 1; } else { moodFrom = moodNow; moodTo = v; moodT = 0; } WORLD.mood = name; }
function tickMood(dt) { if (moodT >= 1) return; moodT = Math.min(1, moodT + dt / 4); const t = smooth(moodT), a = moodFrom, b = moodTo, o = {}; for (const k in b) o[k] = Array.isArray(b[k]) ? b[k].map((v, i) => lerp(a[k][i], v, t)) : lerp(a[k], b[k], t); moodNow = o; }
const waterY = () => { const w = LV.env.waterY; return w === undefined ? -1e9 : typeof w === 'function' ? w() : w; };
function applyEnv(dt, t) {
  const m = moodNow, u = LV.env.under, k = u ? UW : 0, uc = (key) => u && u[key] !== undefined ? mix3(m[key], hex(u[key]), k) : m[key];
  skyU.top.value.setRGB(...m.top); skyU.hor.value.setRGB(...m.hor); skyU.sunC.value.setRGB(...m.sunC); skyU.cl.value.setRGB(...m.cl); skyU.stars.value = m.stars; skyU.cloud.value = m.cloud; skyU.time.value = t; skyU.sunDir.value.set(...m.dir).normalize();
  const fog = uc('fog'); scene.fog.color.setRGB(...fog); scene.fog.density = u ? lerp(m.fd, u.fd, k) : m.fd; skyMesh.visible = !LV.env.sea && k < .5; scene.background = skyMesh.visible ? null : scene.fog.color;
  sun.color.setRGB(...m.sunC); sun.intensity = m.sunI * 2.5 * (u ? lerp(1, u.sun === undefined ? .6 : u.sun, k) : 1); sun.target.position.set(player.x, player.y, player.z); sun.position.copy(skyU.sunDir.value).multiplyScalar(90).add(sun.target.position); { const k = renderer.shadowMap.enabled && sun.castShadow ? (LV.env.shadowK || .6) : 1, I = sun.intensity; sun.intensity = I * k; sunFill.intensity = I * (1 - k); sunFill.color.copy(sun.color); sunFill.position.copy(sun.position); }
  hemi.color.setRGB(...uc('hemS')); hemi.groundColor.setRGB(...uc('hemG')); hemi.intensity = m.hemI * 1.35;
  if (WORLD.waterU) { const w = WORLD.waterU; w.time.value = t; w.sky.value.setRGB(...m.hor); w.sunC.value.setRGB(...m.sunC); w.fogC.value.copy(scene.fog.color); w.fd.value = scene.fog.density; w.night.value = m.stars; }
  CAUS.value.x = t; CAUS.value.y = waterY(); CAUS.value.z = LV.env.caustics ? LV.env.caustics * m.sunI * (.35 + .65 * k) : 0;
  if (POST) { const p = POST.u; p.bloom.value = u ? lerp(m.bloom, u.bloom === undefined ? .8 : u.bloom, k) : m.bloom; const g = u && u.grade ? mix3(m.grade, u.grade, k) : m.grade; p.grade.value.set(g[0], g[1], g[2]); p.wob.value = (LV.env.sea ? 1 : k) * (LV.env.wobble === undefined ? .0022 : LV.env.wobble); p.time.value = t; }
  for (const l of WORLD.lamps || []) l.intensity = l.userData.i * m.lamps;
}
function initRenderer() {
  if (window.__QUAL) QUAL = window.__QUAL;
  renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: false, powerPreference: 'high-performance' }); renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.shadowMap.enabled = LV.env.shadows !== false; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xeed6a8, .009);
  camera = new THREE.PerspectiveCamera(58, 1, .25, 1700);
  hemi = new THREE.HemisphereLight(0xffffff, 0x556644, .8); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 1); sun.castShadow = LV.env.shadows !== false; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 220 }); sun.shadow.bias = -.0007; sun.shadow.normalBias = .05; scene.add(sun); scene.add(sun.target); sunFill = new THREE.DirectionalLight(0xffffff, 0); sunFill.target = sun.target; scene.add(sunFill);
  VMAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }); if (LV.env.caustics) causticize(VMAT);
  GEO.box = new THREE.BoxGeometry(1, 1, 1); GEO.cyl = new THREE.CylinderGeometry(1, 1, 1, 10); GEO.sph = new THREE.IcosahedronGeometry(1, 1); GEO.cone = new THREE.ConeGeometry(1, 1, 7); GEO.ball = Critter.SPH; GEO.tube = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunC: { value: new THREE.Color() }, cl: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, stars: { value: 0 }, cloud: { value: .5 }, time: { value: 0 } };
  skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1300, 32, 18), new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 top,hor,sunC,cl,sunDir; uniform float stars,cloud,time; varying vec3 vD;
    float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    float ns(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+1.),f.x),f.y); }
    void main(){ vec3 d=normalize(vD); float h=d.y; float t=pow(clamp(h,0.,1.),.5);
      vec3 c=mix(hor,top,t); c=mix(c,hor*.9,clamp(-h*4.,0.,1.));
      float s=max(dot(d,sunDir),0.); c+=sunC*(pow(s,60.)*.3+pow(s,7.)*.13); c=mix(c,sunC*1.3,smoothstep(.9989,.9993,s));
      vec2 q=d.xz/(h+.2)*1.5+vec2(time*.004,0.); float n=ns(q)*.55+ns(q*2.3+3.)*.3+ns(q*5.1+7.)*.15; float lo=1.-cloud*.6;
      float m=smoothstep(lo,lo+.14,n)*smoothstep(.02,.2,h); vec3 cc=mix(cl*.8,cl*1.06+sunC*.14*pow(s,3.),smoothstep(lo+.03,lo+.3,n)); c=mix(c,cc,m*.94);
      c+=step(.9965,h21(floor(d.xz/(h+.3)*120.)))*stars*smoothstep(.05,.4,h)*.9*(1.-m);
      gl_FragColor=vec4(c,1.); }` }));
  skyMesh.frustumCulled = false; scene.add(skyMesh);
  initPost(); resize(); addEventListener('resize', resize);
}
/* finishing pass: soft bloom, a colour grade, vignette, grain, and a slow wobble under water */
function initPost() {
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null), oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), V = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
  const sm = (fs, u) => new THREE.ShaderMaterial({ vertexShader: V, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
  const u = { tD: { value: null }, tB: { value: null }, bloom: { value: .6 }, grade: { value: new THREE.Vector3(1, 1, 1) }, wob: { value: 0 }, time: { value: 0 }, px: { value: new THREE.Vector2() } };
  const bright = sm('uniform sampler2D tD; varying vec2 vUv; void main(){ vec3 c=texture2D(tD,vUv).rgb; float l=max(c.r,max(c.g,c.b)); gl_FragColor=vec4(c*smoothstep(.62,1.,l),1.); }', { tD: u.tD });
  const bu = { tD: { value: null }, d: { value: new THREE.Vector2() } };
  const blur = sm('uniform sampler2D tD; uniform vec2 d; varying vec2 vUv; void main(){ vec3 c=texture2D(tD,vUv).rgb*.227; c+=(texture2D(tD,vUv+d*1.385).rgb+texture2D(tD,vUv-d*1.385).rgb)*.316; c+=(texture2D(tD,vUv+d*3.231).rgb+texture2D(tD,vUv-d*3.231).rgb)*.0703; gl_FragColor=vec4(c,1.); }', bu);
  const fin = sm(`uniform sampler2D tD,tB; uniform float bloom,wob,time; uniform vec3 grade; varying vec2 vUv;
    float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){ vec2 uv=vUv; uv+=vec2(sin(uv.y*23.+time*1.7),cos(uv.x*19.+time*1.3))*wob;
      vec3 c=texture2D(tD,uv).rgb; vec3 b=texture2D(tB,uv).rgb; c+=b*bloom; c=mix(c,c*c*(3.-2.*c),.22); c*=grade;
      vec2 q=vUv-.5; c*=1.-dot(q,q)*.62; c+=(h21(vUv*vec2(913.,517.)+fract(time))-.5)*.022; gl_FragColor=vec4(c,1.); }`, u);
  POST = { quad, oc, u, bright, blur, bu, fin, rt: null, a: null, b: null };
}
function resize() {
  const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio || 1, 2) * QUAL; renderer.setPixelRatio(pr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 66 : 54; camera.updateProjectionMatrix();
  const P = POST, W = Math.max(2, Math.floor(w * pr)), H = Math.max(2, Math.floor(h * pr)); for (const k of ['rt', 'a', 'b']) if (P[k]) P[k].dispose();
  P.rt = new THREE.WebGLRenderTarget(W, H, { samples: QUAL >= .85 ? 4 : 0 }); const o = { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }; P.a = new THREE.WebGLRenderTarget(W >> 2, H >> 2, o); P.b = new THREE.WebGLRenderTarget(W >> 2, H >> 2, o); P.u.px.value.set(4 / W, 4 / H);
}
function renderFrame() {
  const P = POST, r = renderer; r.setRenderTarget(P.rt); r.render(scene, camera); const sh = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
  const pass = (mat, to) => { P.quad.material = mat; r.setRenderTarget(to); r.render(P.quad, P.oc); };
  P.u.tD.value = P.rt.texture; pass(P.bright, P.a);
  for (const s of [1, 2.2]) { P.bu.tD.value = P.a.texture; P.bu.d.value.set(P.u.px.value.x * s, 0); pass(P.blur, P.b); P.bu.tD.value = P.b.texture; P.bu.d.value.set(0, P.u.px.value.y * s); pass(P.blur, P.a); }
  P.u.tD.value = P.rt.texture; P.u.tB.value = P.a.texture; pass(P.fin, null); r.shadowMap.autoUpdate = sh;
}

/* ---------------- ground ---------------- */
let HG = null; const TER = { n: 0, s: 0, c: 0, raw: null };
/* o: { size, n, height(x,z), color(x,z,h) -> [r,g,b], shade(x,z) -> 0..1 } */
function terrain(o) {
  const n = TER.n = o.n || 128, s = TER.s = o.size, c = TER.c = s / n, w = n + 1; TER.raw = o.height; HG = new Float32Array(w * w);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) HG[j * w + i] = o.height(i * c - s / 2, j * c - s / 2);
  const pos = new Float32Array(n * n * 18), col = new Float32Array(n * n * 18); let q = 0;
  const put = (i0, j0, i1, j1, i2, j2) => { const ax = i0 * c - s / 2, az = j0 * c - s / 2, bx = i1 * c - s / 2, bz = j1 * c - s / 2, cx = i2 * c - s / 2, cz = j2 * c - s / 2, ha = HG[j0 * w + i0], hb = HG[j1 * w + i1], hc = HG[j2 * w + i2];
    const mx_ = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3, k0 = o.color(mx_, mz, (ha + hb + hc) / 3), sh = o.shade ? o.shade(mx_, mz) : 0, k = (1 - sh * .3) * (.94 + hash2(Math.round(mx_ * 3.1), Math.round(mz * 3.7)) * .12);
    pos.set([ax, ha, az, bx, hb, bz, cx, hc, cz], q); for (let v = 0; v < 3; v++) { col[q + v * 3] = k0[0] * k; col[q + v * 3 + 1] = k0[1] * k; col[q + v * 3 + 2] = Math.min(1, k0[2] * k * (1 + sh * .2)); } q += 9; };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { put(i, j, i, j + 1, i + 1, j); put(i + 1, j, i, j + 1, i + 1, j + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, VMAT); m.receiveShadow = true; scene.add(m); WORLD.ground = m; return m;
}
function heightAt(x, z) { const fx = (x + TER.s / 2) / TER.c, fz = (z + TER.s / 2) / TER.c, i = Math.floor(fx), j = Math.floor(fz), n = TER.n; if (i < 0 || j < 0 || i >= n || j >= n) return TER.raw(x, z);
  const u = fx - i, v = fz - j, w = n + 1, a = HG[j * w + i], b = HG[j * w + i + 1], c = HG[(j + 1) * w + i], d = HG[(j + 1) * w + i + 1]; return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v); }
/* a water surface that knows how deep it is: foam at the edges, ripples, sparkle, and a bright ceiling from below */
function water(o) {
  const g = new THREE.PlaneGeometry(o.size, o.size, o.seg || 90, o.seg || 90); g.rotateX(-Math.PI / 2); g.translate(o.x || 0, 0, o.z || 0); const p = g.attributes.position, dep = new Float32Array(p.count), y0 = waterY(); for (let i = 0; i < p.count; i++) dep[i] = y0 - heightAt(p.getX(i), p.getZ(i)); g.setAttribute('dep', new THREE.BufferAttribute(dep, 1));
  const u = WORLD.waterU = { time: { value: 0 }, shallow: { value: new THREE.Color(o.shallow || 0x7fd0c8) }, deep: { value: new THREE.Color(o.deep || 0x2c6f8a) }, sky: { value: new THREE.Color() }, sunC: { value: new THREE.Color() }, fogC: { value: new THREE.Color() }, fd: { value: .01 }, drop: { value: 0 }, murk: { value: 0 }, murkC: { value: new THREE.Color(o.murk || 0xb9b7a8) }, night: { value: 0 } };
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: 'attribute float dep; varying float vDep; varying vec3 vW; varying float vDist; void main(){ vDep=dep; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=viewMatrix*w; vDist=length(mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: `uniform float time,fd,drop,murk,night; uniform vec3 shallow,deep,sky,sunC,fogC,murkC; varying float vDep,vDist; varying vec3 vW;
    void main(){ vec2 p=vW.xz; float d=vDep-drop; if(d<-.02) discard;
      float r1=sin(p.x*.9+time*.8+sin(p.y*.7+time*.5)*1.4), r2=sin(p.y*1.3-time*.6+sin(p.x*.5-time*.3)*1.7), rip=(r1+r2)*.5;
      vec3 c=mix(shallow,deep,smoothstep(0.,2.6,d)); c=mix(c,murkC,murk*(.55+.2*rip)); c=mix(c,c*.35+vec3(.02,.05,.1),night*.7);
      c+=sky*.2*smoothstep(.15,.9,rip); float sp=pow(max(0.,sin(p.x*3.3+time*1.9+r2)*sin(p.y*2.9-time*1.5+r1)),14.); c+=sunC*sp*.7*(1.-night*.7);
      float foam=smoothstep(.42,.0,d+rip*.1)*(.7+.3*sin(p.x*5.+p.y*4.+time*2.)); c=mix(c,vec3(.97,1.,.98),foam*.75*(1.-night*.5));
      float a=mix(.5,.93,smoothstep(0.,1.5,d)); a=max(a,foam*.9);
      if(!gl_FrontFacing){ float k=pow(.5+.5*rip,2.); c=mix(deep*.9,sky*.9+sunC*.25,k*.75+.1); a=.82; }
      float f=1.-exp(-fd*fd*vDist*vDist); c=mix(c,fogC,f); gl_FragColor=vec4(c,a); }` }));
  m.position.y = y0; m.renderOrder = 2; m.userData.y0 = y0; scene.add(m); WORLD.water = m;
  WORLD.anim.push((dt) => { const y = waterY(); m.position.y += (y - m.position.y) * Math.min(1, dt * .6); u.drop.value = m.userData.y0 - m.position.y; });
  return m;
}
/* many copies of one shape. list: [{x,y,z,s|sx,sy,sz,rx,ry,rz,c:[r,g,b]}] */
function inst(geo, mat, list, o) { o = o || {}; const im = new THREE.InstancedMesh(geo, mat, list.length), d = new THREE.Object3D(), c = new THREE.Color(); list.forEach((q, i) => { d.position.set(q.x, q.y, q.z); d.rotation.set(q.rx || 0, q.ry || 0, q.rz || 0); d.scale.set(q.sx || q.s || 1, q.sy || q.s || 1, q.sz || q.s || 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); if (q.c) im.setColorAt(i, c.setRGB(q.c[0], q.c[1], q.c[2])); }); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; im.castShadow = o.cast !== false; im.receiveShadow = o.recv !== false; scene.add(im); return im; }
/* try n random points inside radius r; fn(x, z, h) returns an instance or nothing */
function scatter(n, r, fn, cx, cz) { const out = []; let guard = 0; while (out.length < n && guard++ < n * 30) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * r, x = (cx || 0) + Math.cos(a) * d, z = (cz || 0) + Math.sin(a) * d, q = fn(x, z, heightAt(x, z)); if (q) out.push(q); } return out; }
/* a tuft of blades (grass, reeds) as one small geometry */
function tuftGeo(n, h, w, lean) { const gp = [], gc = []; for (let b = 0; b < n; b++) { const a = b * 1.31 + .3, cx = Math.cos(a), sz = Math.sin(a), ox = Math.cos(a * 1.7) * .16, oz = Math.sin(a * 2.3) * .16, hh = h * (.75 + (b % 3) * .18), le = lean * (1 + (b % 2));
  const A = [ox - cx * w, 0, oz - sz * w], B = [ox + cx * w, 0, oz + sz * w], C = [ox + sz * le, hh, oz - cx * le]; gp.push(...A, ...B, ...C, ...B, ...A, ...C); for (let k = 0; k < 2; k++) gc.push(.78, .82, .72, .78, .82, .72, 1.2, 1.18, .98); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(gp.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3)); return g; }
const TUFT_MAT = () => WORLD.tuftMat || (WORLD.tuftMat = LV.env.caustics ? causticize(new THREE.MeshLambertMaterial({ vertexColors: true })) : new THREE.MeshLambertMaterial({ vertexColors: true }));
function place(g, x, z, dy) { g.position.set(x, heightAt(x, z) + (dy || 0), z); scene.add(g); return g; }
function sign(lines, w, h, bg, fg, size, font) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTex(lines, 512, Math.round(512 * h / w), bg, fg, size, font), side: THREE.DoubleSide })); }
function lamp(x, y, z, col, i, dist) { const l = new THREE.PointLight(col, 0, dist || 18, 1.5); l.position.set(x, y, z); l.userData.i = i; scene.add(l); (WORLD.lamps || (WORLD.lamps = [])).push(l); return l; }

/* ---------------- little effects ---------------- */
let DOT, FXP = [], motes, moteV = [], ringFx = [];
function initFx() {
  DOT = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 1, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  for (let i = 0; i < 64; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; scene.add(s); FXP.push({ s, life: 0 }); }
  const mo = LV.env.motes || {}, n = mo.n || 160, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = rr(-22, 22); pos[i * 3 + 1] = rr(-8, 9); pos[i * 3 + 2] = rr(-22, 22); moteV.push([rr(-.3, .3), rr(-.12, .12), rr(-.3, .3), rnd() * 6]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); motes = new THREE.Points(g, new THREE.PointsMaterial({ map: DOT, size: .16, transparent: true, opacity: .7, depthWrite: false, color: 0xfff3c8, blending: THREE.AdditiveBlending, fog: false })); motes.frustumCulled = false; scene.add(motes);
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(1, .035, 6, 44), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; scene.add(m); ringFx.push(m); }
}
function ringAt(x, y, z, col) { const m = ringFx.find(q => q.material.opacity <= 0) || ringFx[0]; m.position.set(x, y + .15, z); m.scale.setScalar(1); m.material.opacity = .9; m.material.color.setHex(col); }
function puff(x, y, z, vx, vy, vz, life, color, size) { const p = FXP.find(q => q.life <= 0); if (!p) return; p.s.position.set(x, y, z); p.v = [vx, vy, vz]; p.life = p.max = life; p.s.material.color.setHex(color); p.size = size; p.s.visible = true; }
function burst(x, y, z, n, col, size, up) { for (let i = 0; i < n; i++) puff(x + rr(-.2, .2), y, z + rr(-.2, .2), rr(-1, 1), rr(.4, 2) * (up || 1), rr(-1, 1), rr(.5, 1), col, size || .3); }
function tickFx(dt, t) {
  for (const p of FXP) { if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; } p.s.position.x += p.v[0] * dt; p.s.position.y += p.v[1] * dt; p.s.position.z += p.v[2] * dt; const k = p.life / p.max; p.s.material.opacity = k; p.s.scale.setScalar(p.size * (.6 + k * .6)); }
  const a = motes.geometry.attributes.position, wet = UW > .5 || LV.env.sea, mo = (wet ? LV.env.umotes : null) || LV.env.motes || {}, night = moodNow.stars > .5 && !wet, rise = mo.rise || 0;
  motes.position.set(camera.position.x, camera.position.y, camera.position.z); motes.material.color.setHex(night ? (mo.night || 0xd8ff7a) : mo.col || 0xfff3c8); motes.material.size = (night ? .28 : mo.size || .15); motes.material.opacity = night ? .55 + Math.sin(t * 3) * .25 : mo.op || .6;
  for (let i = 0; i < moteV.length; i++) { const v = moteV[i]; let x = a.getX(i) + (v[0] + Math.sin(t * .7 + v[3]) * .25) * dt, y = a.getY(i) + (v[1] + rise + Math.sin(t * 1.1 + v[3]) * .15) * dt, z = a.getZ(i) + (v[2] + Math.cos(t * .6 + v[3]) * .25) * dt;
    if (x > 22) x -= 44; if (x < -22) x += 44; if (z > 22) z -= 44; if (z < -22) z += 44; if (y > 9) y = -8; if (y < -8) y = 9; a.setXYZ(i, x, y, z); }
  a.needsUpdate = true;
  for (const m of ringFx) if (m.material.opacity > 0) { m.scale.multiplyScalar(1 + dt * 4.2); m.material.opacity -= dt * .9; }
}
function nameSprite(txt, col) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 64, (g) => { g.font = '700 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; const w = Math.min(244, g.measureText(txt).width + 30); g.fillStyle = col || 'rgba(19,28,23,.78)'; g.beginPath(); g.roundRect ? g.roundRect(128 - w / 2, 8, w, 48, 22) : g.rect(128 - w / 2, 8, w, 48); g.fill(); g.fillStyle = '#f0e6cf'; g.fillText(txt, 128, 33); }), transparent: true, depthWrite: false, depthTest: false, fog: false, sizeAttenuation: false })); s.scale.set(.17, .0425, 1); s.renderOrder = 5; return s; }
let shadowMat;
function blobShadow(r) { shadowMat = shadowMat || new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(10,20,15,.42)'); g.addColorStop(1, 'rgba(10,20,15,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }), transparent: true, depthWrite: false }); const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), shadowMat); m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m; }

/* ---------------- sound: everything is synthesised (see the original game for the iOS notes) ---------------- */
function audioBuild() {
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const a = AU.ctx = new C(), A = LV.audio || {};
  const comp = a.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = .005; comp.release.value = .2;
  AU.g = a.createGain(); AU.g.gain.value = 1; AU.lp = a.createBiquadFilter(); AU.lp.type = 'lowpass'; AU.lp.frequency.value = 18000; AU.g.connect(AU.lp); AU.lp.connect(comp); comp.connect(a.destination);
  for (const k of ['music', 'amb', 'sfx', 'hum']) { const g = a.createGain(); g.gain.value = 1; g.connect(AU.g); AU.bus[k] = g; }
  const nb = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; AU.noise = nb;
  const loop = (type, f, q, v) => { const s = a.createBufferSource(); s.buffer = nb; s.loop = true; const fl = a.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = a.createGain(); g.gain.value = v; s.connect(fl); fl.connect(g); g.connect(AU.bus.amb); s.start(); return g; };
  AU.wind = loop('bandpass', A.windF || 620, .5, A.wind === undefined ? .14 : A.wind); AU.lap = loop('bandpass', 1300, .8, 0); AU.rumble = loop('lowpass', 150, .6, A.rumble || 0);
  const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = .13; lg.gain.value = .07; lfo.connect(lg); lg.connect(AU.wind.gain); lfo.start();
  /* a machine hum the level can turn up near infrastructure */
  const hg = AU.humG = a.createGain(); hg.gain.value = 0; hg.connect(AU.bus.hum); const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300; lp.connect(hg);
  for (const [f, type, v] of [[60, 'sawtooth', .5], [120.4, 'sawtooth', .4], [180, 'square', .15], [239.2, 'sawtooth', .2], [360.7, 'triangle', .18]]) { const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f * (A.humF || 1); g.gain.value = v; o.connect(g); g.connect(lp); o.start(); }
  setInterval(musicTick, 400);
}
function musicTick() {
  if (!audioOn() || document.hidden || !moodNow) return; AU.step++; const A = LV.audio || {}, wet = UW > .5 || LV.env.sea, sc = (A.scales && A.scales[WORLD.mood]) || A.scale || [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3], night = moodNow.stars > .5, tb = A.timbre || 'triangle', quiet = 1 - AU.humLv;
  if (Math.random() < (A.density || .34)) { AU.n = clamp(AU.n + pick([-2, -1, -1, 1, 1, 2]), 0, sc.length - 1); const f = sc[AU.n] * (Math.random() < .2 ? 2 : 1); tone(f, A.len || 1.8, tb, .15, 0, 0, 'music'); tone(f * 2, 1.0, 'sine', .045, 0, 0, 'music'); if (Math.random() < .35) tone(sc[(AU.n + 2) % sc.length], 2, 'sine', .085, 0, .2, 'music'); }
  if (AU.step % 16 === 0) { tone(sc[0] / 2, 6, 'sine', .09, 0, 0, 'music'); tone(sc[Math.min(4, sc.length - 1)] / 2, 6, 'sine', .05, 0, 0, 'music'); }
  if (wet) { if (Math.random() < .12) tone(180 + Math.random() * 500, .12, 'sine', .05, 2.2, 0, 'amb'); if (A.deep && Math.random() < .035) { tone(92, 2.6, 'sine', .16, 1.7, 0, 'amb'); tone(138, 2.2, 'sine', .08, 1.5, .4, 'amb'); } if (A.deep && AU.step % 24 === 0) tone(1480, .9, 'sine', .05, 1, 0, 'amb'); return; }
  if (A.birds && !night && Math.random() < .2 * quiet) { const f = 2100 + Math.random() * 1700, n = 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) tone(f * (1 + (i % 2) * .12), .08, 'sine', .06, 1.3, i * .1, 'amb'); }
  if (A.frogs && Math.random() < (night ? .3 : .06) * quiet) { const f = 2600 + Math.random() * 500; for (let i = 0; i < 3; i++) tone(f, .11, 'sine', .05, 1.12, i * .22, 'amb'); }
  if (A.frogs && Math.random() < .03 * quiet) { tone(110, .35, 'sawtooth', .07, .8, 0, 'amb'); tone(104, .4, 'sawtooth', .07, .8, .45, 'amb'); }
  if (night && AU.step % 2 === 0 && quiet > .4) for (let i = 0; i < 3; i++) tone(4100, .03, 'sine', .03, 1, i * .055, 'amb');
}
/* called a few times a second: how close is water, how loud is the machine */
function audioScene(lap, hum) { if (!AU.ctx) return; const t = AU.ctx.currentTime, wet = UW > .5 && !LV.env.sea; AU.humLv = hum; AU.lap.gain.setTargetAtTime(lap * .22, t, .3); AU.humG.gain.setTargetAtTime(hum * hum * .5, t, .25); AU.lp.frequency.setTargetAtTime(wet ? 620 : LV.env.sea ? 2600 : 18000, t, .12); AU.bus.music.gain.setTargetAtTime(1 - hum * .7, t, .5); }
function setMute(m) { PREF.mute = m; savePrefs(); if (m) { if (AU.ctx) AU.g.gain.value = 0; if (AU.tag) AU.tag.pause(); } else { audioUnlock(); if (AU.ctx) AU.g.gain.value = 1; sfx.ok(); } }
const sfx = {
  blip: (p) => tone((p || 300) * (.92 + Math.random() * .2), .06, 'square', .055), pick: () => { tone(660, .14, 'triangle', .3); tone(990, .24, 'triangle', .3, 0, .08); },
  clue: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .34, 'triangle', .26, 0, i * .09)), ok: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, .45, 'triangle', .26, 0, i * .08)),
  bad: () => tone(196, .3, 'sawtooth', .16, .6), jump: () => tone(320, .16, 'sine', .16, 1.9), flap: () => { noiseHit(700, .8, .12, .3); noiseHit(900, .8, .1, .25, .09); }, dig: () => { for (let i = 0; i < 3; i++) noiseHit(500 + i * 120, 1.2, .1, .5, i * .09); },
  yank: () => { tone(220, .2, 'sawtooth', .18, 2.4); noiseHit(900, 1, .12, .3); }, sniff: () => { for (let i = 0; i < 3; i++) noiseHit(2400, 1.5, .09, .35, i * .12); },
  listen: () => { tone(1320, .5, 'sine', .14, 1.02); tone(1980, .7, 'sine', .08, 1, .08); }, feel: () => { for (let i = 0; i < 4; i++) tone(500 + i * 90, .05, 'triangle', .16, 1.2, i * .06); },
  quack: () => { tone(520, .1, 'sawtooth', .2, .7); tone(470, .14, 'sawtooth', .2, .6, .13); }, peep: () => { for (let i = 0; i < 3; i++) tone(2900, .13, 'sine', .2, 1.14, i * .2); }, glub: () => { tone(160, .2, 'sine', .25, 2.4); tone(240, .16, 'sine', .2, 2.2, .14); },
  ping: () => { tone(1480, .8, 'sine', .16, 1); tone(2220, .5, 'sine', .06, 1, .05); }, thrum: () => { tone(70, .5, 'sine', .3, .8); tone(105, .4, 'triangle', .14, .8, .05); }, glow: () => [880, 1108, 1318].forEach((f, i) => tone(f, .5, 'sine', .12, 1, i * .05)),
  turn: () => { tone(180, .18, 'square', .14, 1.6); noiseHit(700, 2, .1, .25); }, clank: () => { tone(140, .25, 'square', .18, .7); noiseHit(2200, 3, .08, .3); }, chime: (i) => { tone([392, 440, 523.3, 587.3, 659.3][i % 5], .55, 'triangle', .34); },
  splash: () => noiseHit(1800, .7, .18, .25), step: () => noiseHit(380 + Math.random() * 200, 1.4, .05, .09), bark: () => { tone(420, .09, 'sawtooth', .22, .7); tone(380, .12, 'sawtooth', .22, .6, .11); }, snort: () => { noiseHit(500, 1.2, .16, .4); noiseHit(380, 1.2, .2, .35, .12); }
};


/* ---------------- toasts, bubbles ---------------- */
function toast(html, ms) { const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html; $('#toasts').appendChild(t); while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove(); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 420); }, ms || 4800); }
let bubbleT = 0, bubbleAt = null;
function bubble(text, obj, ms) { const b = $('#bubble'); b.textContent = text; b.classList.add('on'); bubbleAt = obj; bubbleT = (ms || 3400) / 1000; }
const _v = new THREE.Vector3();
function tickBubble(dt) { if (bubbleT <= 0) return; bubbleT -= dt; const b = $('#bubble'); if (bubbleT <= 0 || Dlg.on) { b.classList.remove('on'); bubbleT = 0; return; }
  _v.copy(bubbleAt.position); _v.y += bubbleAt.userData.h || 1.4; _v.project(camera); if (_v.z > 1) { b.classList.remove('on'); return; } b.classList.add('on'); b.style.left = clamp((_v.x * .5 + .5) * innerWidth, 110, innerWidth - 110) + 'px'; b.style.top = Math.max(120, (-_v.y * .5 + .5) * innerHeight) + 'px'; }

/* ---------------- dialogue: [L(who, text), N(text), ME({char: text}), { c: [{ t, r: [...] }] }, { do }, { if, then }] ---------------- */
const Dlg = { on: false, q: [], typing: false, full: '', shown: 0, t: 0, node: null, lock: 0, sid: null };
function say(script) { if (typeof script === 'string') script = LV.D[script]; if (typeof script === 'function') script = script(); if (!script) return; Dlg.q.push(...script); if (!Dlg.on) { Dlg.on = true; $('#dlg').classList.remove('hide'); $('#hud').classList.add('hide'); IN.mx = IN.my = 0; dlgNext(); } }
function dlgEnd() { Dlg.on = false; Dlg.node = null; Dlg.hold = false; Dlg.sid = null; $('#dlg').classList.add('hide'); if (!sheetOpen && !cardOpen && started) $('#hud').classList.remove('hide'); saveGame(); }
function dlgNext() {
  for (;;) { const n = Dlg.q.shift(); if (!n) return dlgEnd();
    if (n.if) { if (n.if()) Dlg.q.unshift(...(n.then || [])); else if (n.else) Dlg.q.unshift(...n.else); continue; }
    if (n.do) { n.do(); if (sheetOpen || cardOpen) { Dlg.q.length ? (Dlg.hold = true) : 0; if (!Dlg.q.length) return dlgEnd(); $('#dlg').classList.add('hide'); return; } continue; }
    Dlg.node = n; const ch = $('#dlgCh'); ch.innerHTML = '';
    if (n.c) { $('#dlgNext').style.display = 'none'; const who = WHO.me; $('#dlgName').textContent = T(who.name); $('#dlgName').style.display = ''; $('#dlgTxt').textContent = ''; $('#dlgTxt').style.minHeight = '0'; Dlg.sid = 'me';
      n.c.forEach((o) => { const txt = T(o.t); if (!txt) return; const b = document.createElement('button'); b.textContent = txt; b.onclick = (e) => { e.stopPropagation(); sfx.blip(T(who.pitch)); Dlg.q.unshift(...(o.r || [])); Dlg.lock = performance.now() + 200; dlgNext(); }; ch.appendChild(b); }); return; }
    let sid = typeof n.s === 'function' ? n.s() : n.s; if (sid === MY.char) sid = 'me'; const who = WHO[sid] || WHO.n, nm = T(who.name); $('#dlgName').textContent = nm; $('#dlgName').style.display = nm ? '' : 'none'; $('#dlgTxt').className = sid === 'n' ? 'narr' : ''; $('#dlgTxt').style.minHeight = '';
    Dlg.full = T(n.t); if (!Dlg.full) continue; Dlg.sid = sid; Dlg.shown = 0; Dlg.typing = true; Dlg.pitch = T(who.pitch) || 0; $('#dlgTxt').textContent = ''; $('#dlgNext').style.display = 'none'; return; }
}
function dlgTick(dt) { if (!Dlg.on || !Dlg.typing) return; Dlg.t += dt; const want = Math.min(Dlg.full.length, Dlg.shown + Math.ceil(dt * 70));
  if (want !== Dlg.shown) { if (Dlg.pitch && (want % 3 === 0)) sfx.blip(Dlg.pitch); Dlg.shown = want; $('#dlgTxt').textContent = Dlg.full.slice(0, want); } if (Dlg.shown >= Dlg.full.length) { Dlg.typing = false; $('#dlgNext').style.display = ''; } }
function dlgTap() { if (!Dlg.on || Dlg.hold || cardOpen || performance.now() < Dlg.lock || (Dlg.node && Dlg.node.c)) return; if (Dlg.typing) { Dlg.shown = Dlg.full.length; $('#dlgTxt').textContent = Dlg.full; Dlg.typing = false; $('#dlgNext').style.display = ''; Dlg.lock = performance.now() + 120; } else dlgNext(); }
const speaking = (id) => Dlg.on && Dlg.typing && (Dlg.sid === id || (Dlg.sid === 'me' && id === MY.char));

/* ---------------- sheets, cards, fades ---------------- */
let sheetOpen = false, sheetClose = null, cardOpen = false;
function openSheet(html, onClose, noX) { sheetOpen = true; sheetClose = onClose || null; $('#sheetCard').innerHTML = (noX ? '' : '<button class="x" id="sheetX" aria-label="Close">✕</button>') + html; $('#sheet').classList.remove('hide'); $('#hud').classList.add('hide'); $('#dlg').classList.add('hide'); IN.mx = IN.my = 0; const x = $('#sheetX'); if (x) x.onclick = () => closeSheet(); $('#sheetCard').scrollTop = 0; }
function closeSheet(skip) { if (!sheetOpen) return; sheetOpen = false; $('#sheet').classList.add('hide'); const f = sheetClose; sheetClose = null; if (f && !skip) f(); if (Dlg.on) { $('#dlg').classList.remove('hide'); if (!Dlg.node || Dlg.hold) { Dlg.hold = false; dlgNext(); } } else if (started && !cardOpen) $('#hud').classList.remove('hide'); }
/* cards: [[title, text, kind, kicker]] */
function showCards(cards, done) { cardOpen = true; let i = 0; const c = $('#chap'); c.classList.remove('hide'); $('#hud').classList.add('hide');
  const show = () => { const k = cards[i]; c.innerHTML = `${k[0] ? `<small>${k[3] || ''}</small><h2>${k[0]}</h2>` : ''}<p>${k[1]}</p><div class="tap">${k[2] === 'end' ? 'tap to keep exploring' : 'tap'}</div>`; requestAnimationFrame(() => c.classList.add('on')); };
  let lock = performance.now() + 700; c.onclick = () => { if (performance.now() < lock) return; lock = performance.now() + 500; i++; if (i >= cards.length) { c.classList.remove('on'); setTimeout(() => { c.classList.add('hide'); cardOpen = false; if (Dlg.on) { Dlg.hold = false; $('#dlg').classList.remove('hide'); dlgNext(); } else if (started && !sheetOpen) $('#hud').classList.remove('hide'); if (done) done(); }, 700); c.onclick = null; } else { c.classList.remove('on'); setTimeout(show, 380); } }; show(); }
function fade(mid, after) { const f = $('#fade'); f.classList.add('on'); busy = true; setTimeout(() => { mid && mid(); setTimeout(() => { f.classList.remove('on'); busy = false; after && after(); }, 250); }, 720); }

/* ---------------- journal ---------------- */
let jTab = 'tasks';
function openJournal(tab) { if (!started) return; if (tab) jTab = tab; $('#btnJournal').classList.remove('new'); const tabs = [['tasks', 'To do'], ['clues', `Clues ${S.clues.length}`], ['pack', 'Pack'], ['finds', `Finds ${S.disc.length}/${Object.keys(LV.DISC || {}).length}`], ['cast', 'Who’s who']];
  let h = `<h2>${LV.title}</h2><div class="tabs">${tabs.map(([k, n]) => `<button data-t="${k}" class="${k === jTab ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  if (jTab === 'tasks') h += LV.tasks().map(q => `<div class="q"><b>${q.h}</b>${q.sub ? `<div class="sub">${q.sub}</div>` : ''}<ul>${q.items.map(i => `<li class="${i.done ? 'done' : ''}">${i.t}</li>`).join('')}</ul></div>`).join('');
  else if (jTab === 'clues') h += S.clues.length ? S.clues.map(k => `<div class="item"><div class="ic">!</div><div><b>${LV.CLUES[k][0]}</b><span>${T(LV.CLUES[k][1])}</span></div></div>`).join('') : '<p class="sub">Nothing yet. Go and be nosy.</p>';
  else if (jTab === 'pack') h += S.inv.length ? S.inv.map(k => `<div class="item"><div class="ic">${LV.ITEMS[k][0][0]}</div><div><b>${LV.ITEMS[k][0]}</b><span>${T(LV.ITEMS[k][1])}</span></div></div>`).join('') : '<p class="sub">Empty. Travelling light, or just unprepared.</p>';
  else if (jTab === 'finds') h += Object.keys(LV.DISC || {}).map(k => S.disc.includes(k) ? `<div class="item"><div class="ic">✓</div><div><b>${LV.DISC[k][0]}</b><span>${T(LV.DISC[k][1])}</span></div></div>` : `<div class="item" style="opacity:.5"><div class="ic">?</div><div><b>Not found yet</b><span>${LV.DISC[k][2] || 'Somewhere out there.'}</span></div></div>`).join('');
  else h += LV.order.map(k => { const c = LV.chars[k], pl = playerOf(k); return `<div class="item"><div class="ic">${c.name[0]}</div><div><b>${c.name}${k === MY.char && !SPEC ? ' (you)' : pl ? ` (${esc(pl.name)})` : ''}</b><span>${c.role}. ${c.blurb}</span></div></div>`; }).join('') + '<p class="sub">Anyone not being played tags along and does their part when asked.</p>';
  openSheet(h); $('#sheetCard').querySelectorAll('.tabs button').forEach(b => b.onclick = () => openJournal(b.dataset.t)); }

/* ---------------- input ---------------- */
const IN = { mx: 0, my: 0, jump: false, up: false, down: false, look: null, stick: null, keys: {}, lastLook: 0, moved: false };
function syncSoundBtn() { document.querySelectorAll('.sndBtn').forEach(b => { b.classList.toggle('off', !!PREF.mute); const t = b.querySelector('span'); if (t) t.textContent = PREF.mute ? 'Sound off' : 'Sound on'; }); }
const pitchLim = () => player.mode === 'dive' ? [-1.2, 1.25] : [.03, 1.2];
function lookBy(dx, dy) { const [a, b] = pitchLim(); cam.yaw -= dx * .0058; cam.pitch = clamp(cam.pitch + dy * .004, a, b); IN.lastLook = performance.now(); }
function initInput() {
  const cvs = $('#gl'), st = $('#stick');
  const endStick = () => { IN.stick = null; IN.mx = IN.my = 0; st.style.display = 'none'; };
  const resetTouch = () => { endStick(); IN.look = null; IN.up = IN.down = false; };
  const sync = (e) => { const ids = new Set(); for (const t of e.touches) ids.add(t.identifier); if (IN.stick && !ids.has(IN.stick.id)) endStick(); if (IN.look && !ids.has(IN.look.id)) IN.look = null; };
  cvs.addEventListener('touchstart', (e) => { e.preventDefault(); sync(e); if (Dlg.on) return dlgTap(); if (!started || paused()) return;
    for (const t of e.changedTouches) { if (!IN.stick && !SPEC && t.clientX < innerWidth * .5 && t.clientY > innerHeight * .34) { IN.stick = { id: t.identifier, x: t.clientX, y: t.clientY }; st.style.display = 'block'; st.style.left = t.clientX + 'px'; st.style.top = t.clientY + 'px'; st.firstChild.style.transform = ''; if (!IN.moved) { IN.moved = true; $('#hint').classList.add('hide'); } }
      else if (!IN.look) IN.look = { id: t.identifier, x: t.clientX, y: t.clientY }; } }, { passive: false });
  cvs.addEventListener('touchmove', (e) => { e.preventDefault(); sync(e); for (const t of e.changedTouches) {
    if (IN.stick && t.identifier === IN.stick.id) { let dx = t.clientX - IN.stick.x, dy = t.clientY - IN.stick.y; const d = Math.hypot(dx, dy), m = 52; if (d > m) { dx *= m / d; dy *= m / d; } IN.mx = dx / m; IN.my = -dy / m; st.firstChild.style.transform = `translate(${dx}px,${dy}px)`; }
    else if (IN.look && t.identifier === IN.look.id) { lookBy(t.clientX - IN.look.x, t.clientY - IN.look.y); IN.look.x = t.clientX; IN.look.y = t.clientY; } } }, { passive: false });
  for (const ev of ['touchend', 'touchcancel']) cvs.addEventListener(ev, (e) => { sync(e); }, { passive: true });
  cvs.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; e.preventDefault(); if (Dlg.on) return dlgTap(); if (!started || paused()) return; IN.look = { id: 'mouse', x: e.clientX, y: e.clientY }; });
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' || !IN.look || IN.look.id !== 'mouse') return; if (!e.buttons) { IN.look = null; return; } lookBy(e.clientX - IN.look.x, e.clientY - IN.look.y); IN.look.x = e.clientX; IN.look.y = e.clientY; });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && IN.look && IN.look.id === 'mouse') IN.look = null; });
  addEventListener('blur', resetTouch); document.addEventListener('visibilitychange', resetTouch);
  $('#dlg').addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; e.preventDefault(); dlgTap(); });
  document.addEventListener('contextmenu', (e) => e.preventDefault()); document.addEventListener('gesturestart', (e) => e.preventDefault());
  addEventListener('keydown', (e) => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; const first = !IN.keys[e.code]; IN.keys[e.code] = true; if (e.code === 'Space') { e.preventDefault(); if (Dlg.on) dlgTap(); else if (first) IN.jump = true; } if (e.code === 'KeyE' || e.code === 'Enter') { if (Dlg.on) dlgTap(); else doAct(); } if (e.code === 'KeyQ') doSense(); if (e.code === 'KeyJ') openJournal(); if (e.code === 'Escape') closeSheet(); if (!IN.moved && /Key[WASD]|Arrow/.test(e.code)) { IN.moved = true; $('#hint').classList.add('hide'); } });
  addEventListener('keyup', (e) => { IN.keys[e.code] = false; });
  const press = (id, fn, up) => { const b = $(id); b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (_) { } fn(); }); if (up) for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up); };
  press('#btnJump', () => { IN.jump = true; IN.up = true; }, () => { IN.up = false; }); press('#btnDown', () => { IN.down = true; }, () => { IN.down = false; }); press('#btnSniff', () => doSense()); press('#btnAct', () => doAct());
  $('#btnJournal').onclick = () => openJournal(); $('#obj').onclick = () => openJournal('tasks');
  document.querySelectorAll('.sndBtn').forEach(b => b.onclick = (e) => { e.stopPropagation(); setMute(!PREF.mute); syncSoundBtn(); }); syncSoundBtn();
}
function keyMove() { const k = IN.keys; return [(k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0), (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)]; }
const paused = () => Dlg.on || sheetOpen || cardOpen || busy;

/* ---------------- player + camera ----------------
   Three ways to move: 'land' (walk, jump, flap), 'float' (bob on the surface), 'dive' (free swimming).
   A character def says what it can do: speed, swim, diveSp, jump, flaps, glide, draft, dive, sink. */
let started = false, busy = false, SPEC = false, specId = null, senseCD = 0;
const player = { x: 0, z: 0, y: 0, vy: 0, yaw: 2.6, pitch: 0, air: false, under: false, mode: 'land', c: null, g: null, sp: 0, flaps: 0, actT: 0, st: {} };
const cam = { yaw: .5, pitch: .24, dist: 6.4, pos: new THREE.Vector3(), tgt: new THREE.Vector3(), snap: true };
function makePlayer(ch) { if (player.g) scene.remove(player.g); const c = LV.chars[ch].make(), g = new THREE.Group(); g.add(c.g); player.sh = blobShadow(.9); if (LV.env.sea) player.sh.visible = false; g.add(player.sh); player.c = c; player.g = g; scene.add(g); g.visible = !SPEC; }
function placePlayer(x, z, y) { player.x = x; player.z = z; const ch = CH(), wy = waterY(), gh = heightAt(x, z); player.under = !!LV.env.sea; player.y = y !== undefined ? y : LV.env.sea ? gh + 1.2 : Math.max(gh, wy - ch.draft); player.vy = 0; player.air = false; cam.snap = true; }
let edgeT = 0;
function updatePlayer(dt, t) {
  if (SPEC) return; const ch = CH(), wy = waterY(), sea = !!LV.env.sea, P = paused();
  let mx = IN.mx, my = IN.my; const km = keyMove(); if (km[0] || km[1]) { mx = km[0]; my = km[1]; } if (P) mx = my = 0;
  const mag = Math.min(1, Math.hypot(mx, my)), fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  let dx = fx * my + rx * mx, dz = fz * my + rz * mx; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const up = !P && (IN.keys.Space || IN.up) ? 1 : 0, down = !P && (IN.keys.KeyC || IN.keys.ShiftLeft || IN.keys.ShiftRight || IN.down) ? 1 : 0;
  const gh = heightAt(player.x, player.z), surf = wy - ch.draft, deep = sea || gh < surf - .02;
  let mode = 'land'; if (sea) mode = 'dive'; else if (deep && player.y <= surf + .1 && !(player.air && player.vy > 0)) mode = ch.dive && player.under ? 'dive' : 'float';
  if (mode !== 'dive') player.under = false; if (mode !== player.mode) { if (player.mode === 'land' && mode === 'float' && started) { sfx.splash(); burst(player.x, wy, player.z, 6, 0xeaffff, .3); } player.mode = mode; }
  const boost = LV.speedMul ? LV.speedMul() : 1, sp = (mode === 'land' ? ch.speed * (gh < wy - .15 ? .72 : 1) : mode === 'float' ? ch.swim : ch.diveSp) * mag * boost;
  if (mag > .05) { const st = sp * dt, base = mode === 'land' ? Math.max(floorAt(player.x, player.z, player.y), player.y) : 0, top = sea ? 1e9 : surf - .2;
    const ok = (x, z) => mode === 'land' ? floorAt(x, z, player.y) - base <= st * 1.7 + .04 : mode === 'float' ? heightAt(x, z) - surf <= st * 1.7 + .32 : heightAt(x, z) < top - .05;
    const nx = player.x + dx * st, nz = player.z + dz * st; if (ok(nx, nz)) { player.x = nx; player.z = nz; } else if (ok(nx, player.z)) player.x = nx; else if (ok(player.x, nz)) player.z = nz;
    player.yaw += angDiff(Math.atan2(dx, dz), player.yaw) * Math.min(1, dt * (mode === 'land' ? 11 : 6)); }
  collide(player, ch.r || .45);
  const B = LV.env.bound; if (B) { const d = Math.hypot(player.x - (B.x || 0), player.z - (B.z || 0)); if (d > B.r) { player.x = (B.x || 0) + (player.x - (B.x || 0)) * B.r / d; player.z = (B.z || 0) + (player.z - (B.z || 0)) * B.r / d; if (t - edgeT > 14) { edgeT = t; toast(LV.env.edge || 'The world goes on. The story does not.'); } } }
  const g1 = heightAt(player.x, player.z);
  if (mode === 'land') { const fl = floorAt(player.x, player.z, player.y), floor = g1 < surf - .02 && fl <= g1 + .01 ? surf : fl;
    if (IN.jump) { IN.jump = false; if (!P) { if (!player.air && ch.jump) { player.vy = ch.jump; player.air = true; player.flaps = ch.flaps || 0; sfx.jump(); } else if (player.air && player.flaps > 0) { player.vy = ch.flapVy || 6.5; player.flaps--; sfx.flap(); } } }
    if (player.air) { player.vy -= (player.vy < 0 && ch.glide && up ? 24 * ch.glide : 24) * dt; if (player.vy < -3 && ch.glide && up) player.vy = Math.max(player.vy, -3); player.y += player.vy * dt; if (player.y <= floor) { player.y = floor; player.air = false; player.vy = 0; if (floor === surf) { sfx.splash(); burst(player.x, wy, player.z, 7, 0xeaffff, .32); } } }
    else if (player.y > floor + .7) { player.air = true; player.vy = 0; player.flaps = ch.flaps || 0; } else player.y += (floor - player.y) * Math.min(1, dt * 18);
    player.pitch += (0 - player.pitch) * Math.min(1, dt * 8); }
  else if (mode === 'float') { player.air = false; player.vy = 0; player.y += (surf + Math.sin(t * 2.1) * .025 - player.y) * Math.min(1, dt * 9); player.pitch += (0 - player.pitch) * Math.min(1, dt * 8);
    if (IN.jump) { IN.jump = false; if (!P && ch.jumpWater) { player.vy = ch.jumpWater; player.air = true; player.flaps = ch.flaps || 0; player.y = surf + .12; sfx.jump(); burst(player.x, wy, player.z, 5, 0xeaffff, .28); } }
    if (down && ch.dive && g1 < surf - 1) { player.under = true; player.y = surf - .32; player.vy = -2.5; sfx.glub(); burst(player.x, wy, player.z, 6, 0xeaffff, .3); } }
  else { IN.jump = false; player.air = false; const top = sea ? (LV.env.ceil || 60) : surf - .28, cp = cam.pitch, look = my > .1 ? (cp > .5 ? -Math.sin(cp - .5) : cp < -.06 ? -Math.sin(cp) : 0) * sp * 1.1 : 0;
    let tv = (up - down) * ch.diveSp * .75 + look; if (ch.sink && !up && tv >= 0 && mag < .05) tv = -ch.sink; player.vy += (tv - player.vy) * Math.min(1, dt * 5); player.y += player.vy * dt;
    const fl = Math.max(g1, floorAt(player.x, player.z, player.y)) + .03; if (player.y < fl) { player.y = fl; if (player.vy < 0) player.vy = 0; }
    if (player.y >= top) { player.y = top; if (player.vy > 0) player.vy = 0; if (!sea && (up || look > .6)) { player.under = false; sfx.splash(); } }
    player.off = player.y - fl; player.pitch += (clamp(Math.atan2(player.vy, Math.max(sp, 2.2)), -.9, .9) - player.pitch) * Math.min(1, dt * 5);
    if (Math.random() < dt * (1.2 + mag * 3)) puff(player.x + rr(-.2, .2), player.y + .5, player.z + rr(-.2, .2), rr(-.1, .1), rr(.6, 1.3), rr(-.1, .1), 1.6, 0xcfefff, rr(.08, .16)); }
  player.g.position.set(player.x, player.y, player.z); const c = player.c; c.g.rotation.y = player.yaw; c.g.rotation.x = -player.pitch;
  player.sh.position.y = Math.max(g1, mode === 'land' && g1 < wy ? wy : -1e9, floorAt(player.x, player.z, player.y)) - player.y + .05; player.sh.visible = !sea && mode === 'land' && UW < .5;
  player.moving = mag > .05; player.sp = player.moving ? sp : 0; player.actT = Math.max(0, player.actT - dt); senseCD = Math.max(0, senseCD - dt);
  if (player.moving && mode === 'land' && !player.air) { player.stepT = (player.stepT || 0) - dt * sp; if (player.stepT <= 0) { player.stepT = 2.4; g1 < wy ? sfx.splash() : sfx.step(); } }
  if (player.moving && mode === 'float' && Math.random() < dt * 10) puff(player.x - Math.sin(player.yaw) * .4 + rr(-.3, .3), wy + .04, player.z - Math.cos(player.yaw) * .4 + rr(-.3, .3), rr(-.3, .3), .5, rr(-.3, .3), .7, 0xeaffff, .26);
  const s = player.st; s.speed = player.sp + (mode === 'dive' ? Math.abs(player.vy) * .6 : 0); s.air = player.air; s.vy = player.vy; s.swim = mode === 'float'; s.dive = mode === 'dive'; s.off = player.off || 0; s.talk = speaking(MY.char) ? 1 : 0; s.act = player.actT > 0 ? 'sense' : null; s.look = 0; if (LV.animSt) LV.animSt(s);
  c.anim(dt, t, s);
}
function updateCam(dt) {
  if (SPEC) { const a = AV.get(specId) || AV.values().next().value; if (a) { player.x = a.x; player.z = a.z; player.y = a.y; player.mode = a.s === 2 ? 'dive' : 'land'; } }
  else if (player.moving && !IN.look && performance.now() - IN.lastLook > 1300) { const dd = angDiff(player.yaw + Math.PI, cam.yaw); if (Math.abs(dd) < 2.4) cam.yaw += dd * Math.min(1, dt * 1.1); }
  const [pa, pb] = pitchLim(); cam.pitch = clamp(cam.pitch, pa, pb); const ch = CH(), wy = waterY(), sea = !!LV.env.sea, port = innerWidth < innerHeight, d = cam.dist * (ch && ch.cam || 1) * (port ? 1.14 : 1), cp = Math.cos(cam.pitch);
  cam.tgt.set(player.x, player.y + (ch && ch.eye || .9) + (port ? .7 : 0), player.z); const dive = player.mode === 'dive' && !sea; let px, py, pz;
  for (const q of [1, .82, .66, .5, .36, .24, .14]) { px = cam.tgt.x + Math.sin(cam.yaw) * cp * d * q; pz = cam.tgt.z + Math.cos(cam.yaw) * cp * d * q; py = cam.tgt.y + Math.sin(cam.pitch) * d * q; const g = heightAt(px, pz) + .45;
    if (dive) { py = Math.min(py, wy - .3); if (py >= g || q < .2) { py = Math.max(py, Math.min(g, wy - .3)); break; } } else { if (!sea && g < wy + .4 && wy > -1e8) py = Math.max(py, wy + .4); if (py >= g - .6 || q < .2) { py = Math.max(py, g); break; } } }
  if (cam.snap) { cam.pos.set(px, py, pz); cam.snap = false; } else cam.pos.lerp(_v.set(px, py, pz), Math.min(1, dt * 9));
  camera.position.copy(cam.pos); camera.lookAt(cam.tgt); skyMesh.position.copy(camera.position);
  UW += ((sea || camera.position.y < wy ? 1 : 0) - UW) * Math.min(1, dt * 14);
}

/* ---------------- other players ---------------- */
const AV = new Map();
function avatarAdd(pl) { if (AV.has(pl.id) || !pl.char || !LV.chars[pl.char]) return; const c = LV.chars[pl.char].make(), g = new THREE.Group(); g.add(c.g); const lab = nameSprite(pl.name || nameOf(pl.char)); lab.position.y = c.h + .7; g.add(lab); g.visible = false; scene.add(g);
  AV.set(pl.id, { id: pl.id, c, g, char: pl.char, name: pl.name || nameOf(pl.char), x: 0, z: 0, y: 0, yaw: 0, p: 0, tx: 0, tz: 0, ty: 0, tw: 0, tp: 0, m: 0, a: 0, s: 0, seen: false, st: {}, actT: 0 }); syncPartners(); }
function avatarDrop(id) { const a = AV.get(id); if (a) { scene.remove(a.g); AV.delete(id); } if (specId === id) specId = null; syncPartners(); }
function avatarState(id, d) { const a = AV.get(id); if (!a) return; a.last = performance.now(); a.tx = d.x; a.tz = d.z; a.ty = d.y; a.tw = d.w; a.tp = d.p || 0; a.m = d.m; a.a = d.a; a.s = d.s || 0; if (!a.seen) { a.x = d.x; a.z = d.z; a.y = d.y; a.yaw = d.w; a.seen = true; a.g.visible = true; } }
function tickAvatars(dt, t) { for (const a of AV.values()) { if (!a.seen) continue; if (performance.now() - a.last > 9000) { a.seen = false; a.g.visible = false; continue; } const k = Math.min(1, dt * 12); a.x += (a.tx - a.x) * k; a.z += (a.tz - a.z) * k; a.y += (a.ty - a.y) * k; a.yaw += angDiff(a.tw, a.yaw) * k; a.p += (a.tp - a.p) * k; a.g.position.set(a.x, a.y, a.z); a.c.g.rotation.y = a.yaw; a.c.g.rotation.x = -a.p; a.actT = Math.max(0, a.actT - dt);
  const s = a.st; s.speed = a.m; s.air = !!a.a; s.vy = 0; s.swim = a.s === 1; s.dive = a.s === 2; s.act = a.actT > 0 ? 'sense' : null; s.talk = 0; s.off = 1; a.c.anim(dt, t, s); } }
/* skills: every character has a few; a job that needs one is done by whoever has it */
const playerOf = (k) => { if (!Net.on) return null; for (const p of Net.players.values()) if (p.char === k && p.id !== Net.id) return p; return null; };
const isPlayed = (k) => (k === MY.char && !SPEC) || !!playerOf(k);
const canUse = (sk) => !SPEC && CH().skills.includes(sk);
const whoHas = (sk) => LV.order.find(k => LV.chars[k].skills.includes(sk));
const someoneHas = (sk) => { const k = whoHas(sk); return !!k && isPlayed(k); };
/* needs(skill, fn(mine), { call, npc }): do it if it's my gift; if another player has the gift, call them; otherwise our tag-along does it */
function needs(sk, fn, o) { o = o || {}; if (canUse(sk)) return fn(true); const k = whoHas(sk); if (isPlayed(k)) { sfx.bad(); return toast((T(o.call) || `That needs ${nameOf(k)}.`) + ` <b>Call ${nameOf(k)} over.</b>`, 6500); } const pre = T(o.npc); if (pre && pre.length) say(pre.concat([{ do: () => fn(false) }])); else fn(false); }

/* ---------------- the shared story: every change goes through op() ---------------- */
function applyOp(o) { if (o.t === 'f') { if (S.f[o.k]) return false; S.f[o.k] = 1; } else if (o.t === 'a') { if (!S[o.l] || S[o.l].includes(o.v)) return false; S[o.l].push(o.v); } else if (o.t === 'r') { if (!S[o.l] || !S[o.l].includes(o.v)) return false; S[o.l] = S[o.l].filter(x => x !== o.v); } else if (o.t === 's') { if (S[o.k] === o.v) return false; S[o.k] = o.v; } else if (o.t === 'h') { if ((S.hold[o.k] || 0) === o.v) return false; if (o.v) S.hold[o.k] = o.v; else delete S.hold[o.k]; } else return false; return true; }
function op(o) { if (!applyOp(o)) return; onOp(o, true); Net.sendOp(o); }
function remoteOp(o, by) { if (!applyOp(o)) return; onOp(o, false, by); }
function onOp(o, local, by) {
  if (!started) return; syncWorld(); if (o.t === 'h') return;
  if (o.t === 's' && o.k === 'st') { setMood(LV.moodFor ? LV.moodFor() : Object.keys(LV.moods)[0]); if (LV.onStage) LV.onStage(o.v, local); }
  if (o.t === 'f' && o.k === 'done') { PREF.done = PREF.done || {}; PREF.done[LV.id] = 1; savePrefs(); }
  if (LV.onOp) LV.onOp(o, local, by);
  if (!local) { const who = `<b>${esc(by || 'Someone')}</b>`; let m = null;
    if (o.t === 'a') { if (o.l === 'clues') m = `${who} found a clue: ${LV.CLUES[o.v][0]}`; else if (o.l === 'inv') m = `${who} got: ${LV.ITEMS[o.v][0]}`; else if (o.l === 'disc') m = `${who} found: ${LV.DISC[o.v][0]}`; }
    else if (o.t === 'f' && LV.NEWS && LV.NEWS[o.k]) m = `${who} ${LV.NEWS[o.k]}`;
    if (m) { toast(m); newPip(); } }
  Net.dirty = true;
}
const setFlag = (k) => op({ t: 'f', k }), addTo = (l, v) => op({ t: 'a', l, v }), setVal = (k, v) => op({ t: 's', k, v }), dropFrom = (l, v) => op({ t: 'r', l, v });
const stage = (n) => { if (n > S.st) setVal('st', n); };
const newPip = () => $('#btnJournal').classList.add('new');
function addClue(k) { if (S.clues.includes(k)) return; addTo('clues', k); sfx.clue(); newPip(); toast(`<b>Clue:</b> ${LV.CLUES[k][0]}`); if (LV.onClue) LV.onClue(k); }
function give(k) { if (has(k)) return; addTo('inv', k); sfx.pick(); newPip(); toast(`<b>${LV.ITEMS[k][0]}.</b> ${T(LV.ITEMS[k][1])}`, 5600); }
function discover(k) { if (S.disc.includes(k)) return; addTo('disc', k); sfx.clue(); newPip(); const d = LV.DISC[k]; say([N(T(d[1]))].concat(d[3] ? [ME(d[3])] : [])); toast(`<b>Found:</b> ${d[0]} (${S.disc.length}/${Object.keys(LV.DISC).length})`); }
function syncWorld() { for (const o of IX) if (o.show) o.show.visible = !o.when || !!o.when(); syncPartners(); if (LV.sync) LV.sync(); }

/* ---------------- NPCs ---------------- */
const NPCS = {};
/* o: { y, s, r, h, talk, label, when, barks, noCol, turn, swim, reach } */
function npc(id, c, x, z, face, o) { o = o || {}; const g = c.g, y = o.y !== undefined ? o.y : heightAt(x, z) + (o.dy || 0); g.position.set(x, y, z); g.rotation.y = face || 0; if (o.s) g.scale.multiplyScalar(o.s); g.userData.h = o.h || c.h + .3; scene.add(g);
  const n = { id, c, g, x, y, z, face: face || 0, o, barkT: rr(6, 16), st: { speed: 0 }, goto: null, off: false, sp: o.speed || 3 }; NPCS[id] = n; if (!o.noCol) n.col = addCol(x, z, o.r || .5);
  if (o.talk) n.ix = ix({ id: 'npc_' + id, at: [x, y, z], r: o.reach || 2.8, label: o.label || 'Talk', when: () => !n.off && g.visible && (!o.when || o.when()), act: () => { faceNpc(n); say(typeof o.talk === 'function' ? o.talk() : o.talk); }, dy: o.h || c.h + .5 }); return n; }
function faceNpc(n) { player.yaw = Math.atan2(n.g.position.x - player.x, n.g.position.z - player.z); }
function npcMove(n, x, z, y) { n.g.position.set(x, y === undefined ? heightAt(x, z) : y, z); if (n.col) { n.col.x = x; n.col.z = z; } if (n.ix) { n.ix.p[0] = x; n.ix.p[1] = n.g.position.y; n.ix.p[2] = z; } }
function updateNPCs(dt, t) {
  for (const id in NPCS) { const n = NPCS[id], g = n.g; if (!g.visible) continue; const st = n.st; st.speed = 0;
    if (n.goto) { const [tx, tz, ty] = n.goto, dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz); if (d < .25) { n.goto = null; if (n.onArrive) { const f = n.onArrive; n.onArrive = null; f(); } } else { const stp = Math.min(d, n.sp * dt), nx = g.position.x + dx / d * stp, nz = g.position.z + dz / d * stp, gy = n.o.swim ? (ty === undefined ? g.position.y : g.position.y + (ty - g.position.y) * Math.min(1, dt * 2)) : n.o.float ? Math.max(heightAt(nx, nz), waterY() - n.o.float) : heightAt(nx, nz); npcMove(n, nx, nz, gy); g.rotation.y += angDiff(Math.atan2(dx, dz), g.rotation.y) * Math.min(1, dt * 7); st.speed = n.sp; } }
    else if (n.path) { n.wait = (n.wait || 0) - dt; if (n.wait <= 0) { n.pi = ((n.pi || 0) + 1) % n.path.length; n.goto = n.path[n.pi]; n.wait = n.path[n.pi][3] || rr(1.5, 4); } }
    const dx = player.x - g.position.x, dz = player.z - g.position.z, d = Math.hypot(dx, dz, (player.y - g.position.y) * .6);
    st.look = d < 7 && n.o.turn !== false ? clamp(angDiff(Math.atan2(dx, dz), g.rotation.y), -1.1, 1.1) : 0; st.talk = speaking(n.o.voice || id.replace('pal_', '')) ? 1 : 0; st.swim = !!n.o.float; st.dive = !!n.o.swim; st.off = 1; if (n.tick) n.tick(dt, t, st, d);
    n.c.anim(dt, t, st);
    if (n.o.barks && started && !paused() && d < 10) { n.barkT -= dt; if (n.barkT <= 0) { n.barkT = rr(11, 24); bubble(T(pick(n.o.barks)), g); } }
  }
}
/* the leads nobody is playing tag along as themselves: they stand at home, take their station when it's needed, and do their jobs when asked */
function syncPartners() { if (!LV || !scene || !S) return; for (const k of LV.order) { const c = LV.chars[k], played = isPlayed(k); let n = NPCS['pal_' + k]; const h = typeof c.home === 'function' ? c.home() : c.home;
  if (!n) { n = npc('pal_' + k, c.make(), h[0], h[1], h[2] || 0, { y: h[3], talk: () => LV.palTalk ? LV.palTalk(k) : [L(k, '...')], barks: c.barks, voice: k, swim: h[3] !== undefined && !c.floatHome, float: c.floatHome ? c.draft : 0, r: .45 }); n.sp = c.speed * .8; n.pal = k; }
  n.off = played; n.g.visible = !played; if (n.col) n.col.on = !played;
  if (!played) { let to = h; for (const id in STN) { const s = STN[id]; if (s.skill && c.skills.includes(s.skill) && stationOn(s)) to = [s.p[0], s.p[2], h[2], s.p[1] !== null && (c.dive || LV.env.sea) ? s.p[1] : h[3]]; } if (!n.home || n.home[0] !== to[0] || n.home[1] !== to[1]) { n.home = to; if (started && Math.hypot(n.g.position.x - to[0], n.g.position.z - to[1]) < 90) n.goto = [to[0], to[1], to[3]]; else npcMove(n, to[0], to[1], to[3] !== undefined ? to[3] : c.floatHome ? Math.max(heightAt(to[0], to[1]), waterY() - c.draft) : undefined); } } } }

/* ---------------- things to do: ix({ id, at: [x,z] | [x,y,z], r, label, when, act, sense, found, dy, show }) ---------------- */
const IX = []; let curIX = null;
function ix(o) { o.p = o.at.length === 3 ? o.at.slice() : [o.at[0], null, o.at[1]]; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: o.col || 0xffd27a, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false })); s.scale.setScalar(.5); s.visible = false; s.renderOrder = 4; scene.add(s); o.sp = s; IX.push(o); return o; }
const ixY = (o) => o.p[1] === null ? Math.max(heightAt(o.p[0], o.p[2]), o.float ? waterY() : -1e9) : o.p[1];
const ixLive = (o) => (!o.when || o.when()) && (!o.sense || flag('rv_' + o.id));
function tickIX(dt, t) { let best = null, bd = 1e9; const ok = started && !SPEC;
  for (const o of IX) { const live = ok && ixLive(o), y = ixY(o), d = Math.hypot(o.p[0] - player.x, o.p[2] - player.z, (y - player.y) * .7); o.sp.visible = live && d < 46 && !o.quiet; if (o.sp.visible) { o.sp.position.set(o.p[0], y + (o.dy || 1.1) + Math.sin(t * 2.4 + o.p[0]) * .1, o.p[2]); o.sp.material.opacity = d < (o.r || 2.6) ? 1 : .55; o.sp.scale.setScalar(d < (o.r || 2.6) ? .62 : .4); } if (live && d < (o.r || 2.6) && d < bd) { bd = d; best = o; } }
  if (paused()) best = null; if (best !== curIX) { curIX = best; const b = $('#btnAct'); if (best) { b.textContent = T(best.label) || 'Look'; b.classList.remove('hide'); } else b.classList.add('hide'); } }
function doAct() { if (!started || paused() || SPEC || !curIX) return; const o = curIX; if (ixLive(o)) o.act(o); }
function doSense() { if (!started || paused() || SPEC || senseCD > 0) return; const ch = CH(), se = ch.sense; senseCD = 1.4; player.actT = 1; ringAt(player.x, player.y + .2, player.z, se.col || 0xffe2a0); (sfx[se.sfx] || sfx.sniff)(); Net.send({ t: 'e', k: 1 });
  if (LV.onSense && LV.onSense(se.k) === true) return; let best = null, bd = 1e9;
  for (const o of IX) if (o.sense === se.k && !flag('rv_' + o.id) && (!o.when || o.when())) { const d = Math.hypot(o.p[0] - player.x, o.p[2] - player.z, ixY(o) - player.y); if (d < bd) { bd = d; best = o; } }
  if (!best) { if (se.none && Math.random() < .7) bubble(T(pick(se.none)), player.g); return; }
  if (bd < (best.sr || 12)) { setFlag('rv_' + best.id); sfx.clue(); ringAt(best.p[0], ixY(best), best.p[2], se.col || 0xffe2a0); toast(T(best.found) || 'There. Something.', 5600); } else toast(`${se.far} <b>${dirName(best.p[0] - player.x, best.p[2] - player.z)}</b>${ixY(best) < player.y - 3 ? ', and down' : ixY(best) > player.y + 3 ? ', and up' : ''}.`); }

/* ---------------- stations: places that must be held at the same moment ----------------
   station({ id, at, r, skill, when, label }). A player with the skill holds it by standing on it.
   If nobody is playing that character, the tag-along holds it. */
const STN = {};
function station(o) { o.p = o.at.length === 3 ? o.at.slice() : [o.at[0], null, o.at[1]]; const m = new THREE.Mesh(new THREE.TorusGeometry(o.r || 1.6, .07, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffb14a, transparent: true, opacity: .8, depthWrite: false, fog: false })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); o.ring = m; const lab = nameSprite(o.label || nameOf(whoHas(o.skill)), 'rgba(139,58,18,.85)'); lab.visible = false; scene.add(lab); o.lab = lab; STN[o.id] = o; return o; }
const stationOn = (s) => !!S && (!s.when || !!s.when());
const stnY = (s) => s.p[1] === null ? Math.max(heightAt(s.p[0], s.p[2]), s.float ? waterY() : -1e9) : s.p[1];
const held = (id) => { const s = STN[id]; return stationOn(s) && (!!S.hold[id] || !someoneHas(s.skill)); };
function tickStations(dt, t) { for (const id in STN) { const s = STN[id], on = started && stationOn(s), y = stnY(s); s.ring.visible = s.lab.visible = on; if (!on) { if (s.mine) { s.mine = false; op({ t: 'h', k: id, v: 0 }); } continue; }
  const h = held(id); s.ring.position.set(s.p[0], y + .12, s.p[2]); s.ring.material.color.setHex(h ? 0x9dff8a : 0xffb14a); s.ring.material.opacity = h ? .9 : .5 + Math.sin(t * 4) * .3; s.ring.scale.setScalar(1 + (h ? 0 : Math.sin(t * 4) * .04)); s.lab.position.set(s.p[0], y + 2.3, s.p[2]);
  const mine = canUse(s.skill) && Math.hypot(player.x - s.p[0], player.z - s.p[2]) < (s.r || 1.6) && Math.abs(player.y - y) < (s.dy || 1.6); if (mine !== !!s.mine) { s.mine = mine; op({ t: 'h', k: id, v: mine ? Net.id : 0 }); if (mine) sfx.chime(Object.keys(STN).indexOf(id)); } } }

/* ---------------- objective ---------------- */
let hudT = 0;
function tickHUD(dt, t) { hudT -= dt; if (hudT > 0) return; hudT = .2; const o = LV.objective() || {}; $('#objCh').textContent = `${LV.title} · ${T(CH().name)}`; $('#objLine').textContent = T(o.t) || ''; const a = $('#objArrow svg');
  if (o.at) { const dx = o.at[0] - player.x, dz = o.at[1] - player.z, d = Math.hypot(dx, dz), ang = Math.atan2(dx, -dz) + cam.yaw; a.style.opacity = 1; a.style.transform = `rotate(${ang}rad)`; const dy = o.at[2] !== undefined ? o.at[2] - player.y : 0; $('#objDist').textContent = d < 3 ? (Math.abs(dy) > 2.5 ? (dy < 0 ? 'right below you' : 'right above you') : 'right here') : `${Math.round(d)} hops ${dirName(dx, dz)}${dy < -3 ? ', down' : dy > 3 ? ', up' : ''}`; } else { a.style.opacity = .25; $('#objDist').textContent = ''; }
  const wy = waterY(), near = LV.env.sea ? 0 : clamp(1 - Math.abs(heightAt(player.x, player.z) - wy) / 3, 0, 1); audioScene(near, LV.hum ? LV.hum() : 0);
  $('#btnDown').classList.toggle('hide', !(CH().dive && (LV.env.sea || player.mode !== 'land')));
}

/* ---------------- saving: one autosave per level, on this device ---------------- */
const SAVE_KEY = 'understory.stories.v1';
function loadSaves() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch (e) { return {}; } }
function saveGame() { if (!started || SPEC || !S) return; if (Net.on && !Net.isHost) return; const a = loadSaves(); a[LV.id] = { S, char: MY.char, x: +player.x.toFixed(1), y: +player.y.toFixed(1), z: +player.z.toFixed(1), t: Date.now(), mp: Net.on ? Net.code : '' }; try { localStorage.setItem(SAVE_KEY, JSON.stringify(a)); } catch (e) { } }

/* ---------------- boot ---------------- */
function beginGame(o) { /* o: { S, char, x, y, z, spec, isNew } */
  audioUnlock(); S = o.S; R = LV.rand ? LV.rand(S.seed) : {}; SPEC = !!o.spec; MY.char = o.char || MY.char; for (const id in STN) STN[id].mine = false;
  $('#title').classList.add('hide'); closeSheet(true); makePlayer(MY.char); const sp = LV.env.spawn(Net.on ? Net.index() : 0); if (o.x === undefined) placePlayer(sp[0], sp[1], sp[2]); else placePlayer(o.x, o.z, o.y); cam.yaw = LV.env.camYaw || .5; cam.pitch = .24; setMood(LV.moodFor ? LV.moodFor() : Object.keys(LV.moods)[0], true); started = true; startT = performance.now() / 1000; syncWorld();
  document.body.classList.toggle('spec', SPEC); const se = CH().sense; $('#btnSniff').innerHTML = se.icon || SENSE_ICON; $('#btnSniff').setAttribute('aria-label', se.name);
  netChip(); if (o.isNew && !SPEC) showCards(LV.cards.intro, () => { toast(`You are <b>${CH().name}</b>, ${CH().role.toLowerCase()}. Tap the round button to <b>${se.name.toLowerCase()}</b>.`, 8000); if (CH().tip) toast(CH().tip, 9000); if (LV.onBegin) LV.onBegin(); }); else { $('#hud').classList.remove('hide'); } saveGame(); }
function resetToTitle() { saveGame(); Net.close(); location.href = location.pathname + '?lv=' + LV.id; }
const SENSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M5 12a7 7 0 0114 0M2 12a10 10 0 0120 0"/></svg>';
let lastT = 0, perfT = 0, perfN = 0, saveT = 0, slowN = 0, startT = 0, sendT = 0;
function loop(now) { requestAnimationFrame(loop); const dt = Math.min(.05, (now - lastT) / 1000 || .016), t = now / 1000; lastT = now;
  if (started) { updatePlayer(dt, t); tickAvatars(dt, t); tickIX(dt, t); tickStations(dt, t); tickHUD(dt, t); if (LV.tick) LV.tick(dt, t); saveT += dt; if (saveT > 12 && !paused()) { saveT = 0; saveGame(); }
    sendT += dt; if (sendT > .1 && Net.on && !SPEC) { sendT = 0; Net.send({ t: 'p', x: +player.x.toFixed(2), z: +player.z.toFixed(2), y: +player.y.toFixed(2), w: +player.yaw.toFixed(2), p: +player.pitch.toFixed(2), m: +player.st.speed.toFixed(1), a: player.air ? 1 : 0, s: player.mode === 'float' ? 1 : player.mode === 'dive' ? 2 : 0 }); }
    perfT += dt; perfN++; if (perfT > 3) { const ms = perfT / perfN * 1000; perfT = perfN = 0; slowN = ms > 36 && t - startT > 8 && !paused() ? slowN + 1 : 0; if (slowN >= 2 && !window.__NOADAPT) { slowN = 0; if (QUAL > .55) { QUAL -= .15; if (QUAL < .8) { renderer.shadowMap.enabled = false; sun.castShadow = false; } resize(); } } } }
  else { cam.yaw += dt * .05; const c = player.c; player.g.position.set(player.x, player.y, player.z); c.g.rotation.y = cam.yaw + .45; c.anim(dt, t, { speed: 0, swim: player.mode === 'float', dive: player.mode === 'dive', off: 1 }); }
  updateNPCs(dt, t); updateCam(dt); tickMood(dt); applyEnv(dt, t); for (const f of WORLD.anim) f(dt, t); tickFx(dt, t); dlgTick(dt); tickBubble(dt); renderFrame(); }
function boot() {
  for (const k of LV.order) WHO[k] = { name: LV.chars[k].name, pitch: LV.chars[k].pitch }; Object.assign(WHO, LV.who || {}); document.title = `${LV.title} · Understory`;
  S = freshState(7); R = LV.rand ? LV.rand(S.seed) : {}; MY.char = LV.order[0]; initRenderer(); initFx(); LV.build(); setMood(Object.keys(LV.moods)[0], true); makePlayer(MY.char); const sp = LV.env.spawn(0); placePlayer(sp[0], sp[1], sp[2]); player.mode = LV.env.sea ? 'dive' : 'land'; cam.yaw = (LV.env.camYaw || .5) - .5; started = true; syncWorld(); started = false; initInput(); initTitle();
  addEventListener('visibilitychange', () => { if (document.hidden && started) saveGame(); }); window.ready = 1; requestAnimationFrame(loop);
  const j = QS.get('join'); if (j) openTogether(j);
}

/* ---------------- multiplayer: the same relay and the same rules as the original game ----------------
   One device hosts and owns the story state; the others send it small idempotent ops and 10 position updates a second. */
const USE_BC = QS.get('bc') === '1', NET_V = 's1';
const myName = () => (PREF.name || '').trim().slice(0, 14) || nameOf(MY.char);
const Net = { on: false, isHost: false, code: '', id: 'me', players: new Map(), tr: null, offset: 0, dirty: false, pending: null,
  index() { if (!this.on) return 0; const a = [...this.players.values()].filter(p => p.char); return Math.max(0, a.findIndex(p => p.id === this.id)); },
  count() { return [...this.players.values()].filter(p => p.char).length; },
  send(m) { if (!this.on || !this.tr) return; if (this.isHost) this.tr.broadcast(Object.assign({ id: 'host' }, m)); else this.tr.send(m); },
  sendOp(o) { if (this.on && !SPEC) this.send({ t: 'op', o, by: myName() }); },
  close() { try { if (this.tr) this.tr.close(); } catch (e) { } this.tr = null; this.on = false; this.isHost = false; this.code = ''; this.players = new Map(); this.offset = 0; this.pending = null; netChip(); } };
function hostTransport(code, h) {
  if (USE_BC) { const ch = new BroadcastChannel('understory-' + code); ch.onmessage = (e) => { const d = e.data; if (d.to !== 'host') return; if (d.m.t === '__bye') return h.onClose(d.from); h.onMsg(d.from, d.m); }; setTimeout(h.onReady, 0);
    return { sendTo(cid, m) { ch.postMessage({ to: cid, m }); }, broadcast(m, ex) { ch.postMessage({ to: '*', ex, m }); }, close() { ch.close(); } }; }
  const sock = relaySocket({ role: 'host', room: code, sid: relayId() }, { onReady: h.onReady, onError: h.onError, onLost: (e) => h.onError(e === 'closed' ? 'lost' : e), onData(d) { if (!d || !d.from) return; if (d.m && d.m.t === '__bye') return h.onClose(d.from); h.onMsg(d.from, d.m); } });
  return { sendTo(cid, m) { sock.send({ to: cid, m }); }, broadcast(m, ex) { sock.send({ to: '*', ex, m }); }, close() { sock.close(); } };
}
function clientTransport(code, h) {
  if (USE_BC) { const id = 'c' + Math.random().toString(36).slice(2, 8), ch = new BroadcastChannel('understory-' + code), bye = () => { try { ch.postMessage({ to: 'host', from: id, m: { t: '__bye' } }); } catch (e) { } };
    ch.onmessage = (e) => { const d = e.data; if (d.to === id || (d.to === '*' && d.ex !== id)) h.onMsg(d.m); }; setTimeout(h.onReady, 0); addEventListener('pagehide', bye);
    return { send(m) { ch.postMessage({ to: 'host', from: id, m }); }, close() { bye(); ch.close(); } }; }
  const sock = relaySocket({ role: 'client', room: code, cid: 'c' + relayId() }, { onReady: h.onReady, onError: h.onError, onLost: () => h.onClose(), onData: h.onMsg });
  return { send(m) { sock.send(m); }, close() { sock.close(); } };
}
setInterval(() => { if (Net.on && !Net.isHost) Net.send({ t: 'k' }); }, 3000);
addEventListener('pagehide', () => { if (Net.on && !Net.isHost) Net.send({ t: 'bye' }); if (started) saveGame(); });
function senseFx(id) { const a = AV.get(id); if (a && a.seen) { a.actT = 1; ringAt(a.x, a.y + .2, a.z, LV.chars[a.char].sense.col || 0xffffff); } }
const NET_ERR = { 'peer-unavailable': 'No game with that code is open right now. Check the code, and that the host’s game is still on screen.', 'unavailable-id': 'That room code is in use. Try hosting again for a new one.', taken: 'That character is already taken in this game.', full: 'That game already has three players. You can still watch.', version: 'That room is playing a different story (or a different version). Check which one the host opened.', timeout: 'Couldn’t reach that room in time.', noserver: 'Couldn’t reach the game server. Check this device’s internet connection and try again.', busy: 'The game server is busy right now. Try again in a minute.', lost: 'Lost the connection to the game server. Other players can’t see you right now.' };
const netErrText = (e) => NET_ERR[e] || 'Couldn’t connect. Playing together needs the web copy of the game and a working internet connection.';
function dropPlayer(cid, why) { const p = Net.players.get(cid); if (!p) return; Net.players.delete(cid); avatarDrop(cid); Net.tr.broadcast({ t: 'leave', id: cid }); for (const k in S.hold) if (S.hold[k] === cid) op({ t: 'h', k, v: 0 }); toast(`<b>${esc(p.name)}</b> left.`); netChip(); }
function netHost(code, cb) { Net.close(); Net.on = true; Net.isHost = true; Net.code = code; Net.id = 'host'; Net.players = new Map([['host', { id: 'host', name: myName(), char: MY.char }]]);
  Net.tr = hostTransport(code, { onReady() { netChip(); cb && cb(null); cb = null; }, onError(e) { if (cb) { const f = cb; cb = null; Net.close(); f(e); } else if (e !== 'peer-unavailable') toast(NET_ERR[e] ? netErrText(e) : 'Connection trouble: ' + e, 9000); }, onMsg: hostMsg, onClose(cid) { dropPlayer(cid); } }); netChip(); syncPartners(); }
function hostMsg(cid, m) { if (!m || !started) return;
  if (m.t === 'bye') return dropPlayer(cid);
  if (m.t === 'peek') return Net.tr.sendTo(cid, { t: 'info', v: NET_V, lv: LV.id, taken: [...Net.players.values()].map(p => p.char).filter(Boolean) });
  if (m.t === 'hello') { for (const [k, q] of Net.players) if (k !== 'host' && m.char && q.char === m.char && Date.now() - (q.last || 0) > 9000) dropPlayer(k);
    const taken = [...Net.players.values()].map(p => p.char).filter(Boolean); if (m.v !== NET_V || m.lv !== LV.id) return Net.tr.sendTo(cid, { t: 'deny', why: 'version' }); if (m.char && taken.includes(m.char)) return Net.tr.sendTo(cid, { t: 'deny', why: 'taken', taken }); if (m.char && Net.count() >= 3) return Net.tr.sendTo(cid, { t: 'deny', why: 'full' });
    const pl = { id: cid, name: String(m.name || '').slice(0, 14) || (m.char ? nameOf(m.char) : 'A watcher'), char: m.char || null, last: Date.now() }; Net.players.set(cid, pl);
    Net.tr.sendTo(cid, { t: 'welcome', id: cid, S, players: [...Net.players.values()], now: Date.now(), code: Net.code });
    Net.tr.broadcast({ t: 'join', pl }, cid); avatarAdd(pl); toast(`<b>${esc(pl.name)}</b> joined${pl.char ? ' as ' + nameOf(pl.char) : ' to watch'}.`); sfx.ok(); netChip(); syncWorld(); return; }
  if (!Net.players.has(cid)) return; Net.players.get(cid).last = Date.now();
  if (m.t === 'p') { avatarState(cid, m); Net.tr.broadcast(Object.assign({}, m, { id: cid }), cid); }
  else if (m.t === 'op') { if (!Net.players.get(cid).char) return; remoteOp(m.o, m.by); Net.tr.broadcast(m, cid); }
  else if (m.t === 'e') { senseFx(cid); Net.tr.broadcast(Object.assign({}, m, { id: cid }), cid); }
  else if (m.t === 'x' && LV.onMsg) { LV.onMsg(m, cid); Net.tr.broadcast(Object.assign({}, m, { id: cid }), cid); } }
function netJoin(code, spec, cb) { Net.close(); let done = false; const fin = (e, x) => { if (done) return; done = true; clearTimeout(to); if (e) { try { Net.tr && Net.tr.close(); } catch (_) { } Net.tr = null; } cb(e, x); }, to = setTimeout(() => fin('timeout'), 15000);
  Net.pending = { spec, fin }; Net.tr = clientTransport(code, { onReady() { Net.tr.send({ t: 'peek' }); }, onError(e) { fin(e); }, onMsg: clientMsg, onClose() { if (!done) return fin('closed'); if (Net.on) { Net.on = false; toast('Lost the host.', 9000); setTimeout(resetToTitle, 2500); } } }); }
function clientMsg(m) { if (!m) return;
  switch (m.t) {
    case 'info': { const pd = Net.pending; if (!pd) break; if (m.v !== NET_V) { pd.fin('version'); break; } if (m.lv !== LV.id) { location.href = `${location.pathname}?lv=${m.lv}&join=${Net.pendingCode}${USE_BC ? '&bc=1' : ''}`; break; } if (!pd.spec && m.taken.includes(MY.char)) { pd.fin('taken', m.taken); break; } Net.tr.send({ t: 'hello', v: NET_V, lv: LV.id, name: pd.spec ? (PREF.name || '') : myName(), char: pd.spec ? null : MY.char }); break; }
    case 'welcome': { const pd = Net.pending; Net.on = true; Net.isHost = false; Net.code = m.code; Net.id = m.id; Net.offset = m.now - Date.now(); Net.players = new Map(m.players.map(p => [p.id, p]));
      beginGame({ S: m.S, char: MY.char, spec: pd.spec }); for (const p of m.players) if (p.id !== Net.id) avatarAdd(p); netChip(); syncWorld(); pd.fin(null); toast(pd.spec ? `Watching room <b>${m.code}</b>. Drag to look around.` : `You’re in room <b>${m.code}</b>.`, 6000); break; }
    case 'deny': Net.pending && Net.pending.fin(m.why, m.taken); break;
    case 'join': Net.players.set(m.pl.id, m.pl); avatarAdd(m.pl); toast(`<b>${esc(m.pl.name)}</b> joined${m.pl.char ? ' as ' + nameOf(m.pl.char) : ' to watch'}.`); netChip(); syncWorld(); break;
    case 'leave': { const p = Net.players.get(m.id); Net.players.delete(m.id); avatarDrop(m.id); if (p) toast(`<b>${esc(p.name)}</b> left.`); netChip(); syncWorld(); break; }
    case 'p': avatarState(m.id, m); break;
    case 'op': remoteOp(m.o, m.by); break;
    case 'e': senseFx(m.id); break;
    case 'x': if (LV.onMsg) LV.onMsg(m, m.id); break;
  } }
function netChip() { const c = $('#netChip'); if (!c) return; if (!Net.on || !started) { c.classList.add('hide'); return; } c.classList.remove('hide'); const n = Net.count(), w = Net.players.size - n; c.textContent = SPEC ? `Watching ${(AV.get(specId) || AV.values().next().value || { name: '…' }).name} ▸` : `Room ${Net.code} · ${n} playing${w ? ` · ${w} watching` : ''}`; }
function openRoom() { if (SPEC) { const ids = [...AV.keys()]; if (ids.length) { specId = ids[(ids.indexOf(specId) + 1) % ids.length]; cam.snap = true; netChip(); } return; }
  const rows = [...Net.players.values()].map(p => `<div class="item"><div class="ic">${p.char ? nameOf(p.char)[0] : '◉'}</div><div><b>${esc(p.name)}${p.id === Net.id ? ' (you)' : ''}</b><span>${p.char ? `${nameOf(p.char)} · ${LV.chars[p.char].role}` : 'Watching'}</span></div></div>`).join('');
  openSheet(`<h2>Room ${Net.code}</h2><p class="sub">Others join from this story’s title screen: Play together, then this code. The story and the pack are shared. Some jobs need a particular character, and some need two of you in two places at once.</p>${rows}<div class="row" style="margin-top:12px"><button class="btn sm" id="btnQuit">Leave to title</button></div>`); $('#btnQuit').onclick = resetToTitle; }

/* ---------------- title screen ---------------- */
function renderTitle() { const sv = loadSaves()[LV.id]; $('#btnCont').classList.toggle('hide', !sv); $('#btnStart').textContent = sv ? 'New game' : 'Play alone'; document.querySelectorAll('#chars button').forEach(x => x.classList.toggle('on', x.dataset.c === MY.char)); }
function initTitle() {
  const me = LEVELS.find(l => l.id === LV.id) || {}; $('#tKick').textContent = `Understory · Field Notes · ${me.n || ''}`; $('#tName').textContent = LV.title; $('#tTag').textContent = LV.tag;
  $('#lvls').innerHTML = `<a href="index.html">Hollow Creek</a>` + LEVELS.map(l => `<a href="?lv=${l.id}" class="${l.id === LV.id ? 'on' : ''}">${(PREF.done || {})[l.id] ? '✓ ' : ''}${l.title}</a>`).join('');
  $('#chars').innerHTML = LV.order.map(k => { const c = LV.chars[k]; return `<button data-c="${k}"><i>${c.role}</i><b>${c.name}</b><small>${c.blurb}</small></button>`; }).join('');
  document.querySelectorAll('#chars button').forEach(b => b.onclick = () => { MY.char = b.dataset.c; makePlayer(MY.char); const sp = LV.env.spawn(0); placePlayer(sp[0], sp[1], sp[2]); renderTitle(); audioUnlock(); sfx.blip(CH().pitch); });
  $('#btnStart').onclick = () => beginGame({ S: freshState(), char: MY.char, isNew: true });
  $('#btnCont').onclick = () => { const s = loadSaves()[LV.id]; if (!s) return; beginGame({ S: s.S, char: s.char, x: s.x, y: s.y, z: s.z }); };
  $('#btnTogether').onclick = () => openTogether(); $('#netChip').onclick = openRoom; renderTitle();
}
function hostGame(state, code) { beginGame({ S: state || freshState(), char: MY.char, isNew: !state }); const go = (c, again) => netHost(c, (e) => { if (e === 'unavailable-id' && again) return go(newCode(), false); if (e) return toast(netErrText(e), 9000); toast(`Room <b>${c}</b> is open. Tell the others the code.`, 12000); saveGame(); }); go(code, true); }
function openTogether(pre) { const sv = loadSaves()[LV.id];
  openSheet(`<h2>Play together</h2><p class="sub">Up to three players, one of each character, plus anyone who wants to watch. Everyone opens this page; one device hosts and the rest type its room code. Some jobs need a particular character, and the big ones need all of you in different places at once. Talk to each other.</p>
    <h3>Your name</h3><input id="nmIn" class="in" maxlength="14" autocomplete="off" placeholder="${nameOf(MY.char)}" value="${esc(PREF.name || '')}">
    <h3>Start a room</h3><div class="row"><button class="btn go" id="mpHost">Host as ${nameOf(MY.char)}</button>${sv ? `<button class="btn" id="mpHostSv">Host my saved game</button>` : ''}</div>
    <h3>Or join one</h3><input id="codeIn" class="in code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="FERN42" value="${esc(pre || '')}">
    <div class="row" style="margin-top:8px"><button class="btn go" id="mpJoin">Join as ${nameOf(MY.char)}</button><button class="btn" id="mpWatch">Just watch</button></div><p class="sub" id="mpSay">${pre ? `That room is playing <b>${LV.title}</b>. Close this to pick your character, then join.` : ''}</p>`);
  const nm = () => { PREF.name = $('#nmIn').value.trim(); savePrefs(); }, code = () => $('#codeIn').value.toUpperCase().replace(/[^A-Z0-9]/g, ''), sayEl = $('#mpSay');
  $('#mpHost').onclick = () => { nm(); hostGame(null, newCode()); }; if (sv) $('#mpHostSv').onclick = () => { nm(); MY.char = sv.char; hostGame(sv.S, sv.mp || newCode()); };
  const join = (spec) => { nm(); const c = code(); if (c.length < 4) { sayEl.textContent = 'Type the room code from the host’s screen.'; return; } sayEl.textContent = 'Looking for room ' + c + '…'; Net.pendingCode = c;
    netJoin(c, spec, (e, taken) => { if (!e) return; const el = $('#mpSay'); if (!el) return toast(netErrText(e)); const free = LV.order.filter(x => !(taken || []).includes(x)).map(nameOf); el.textContent = e === 'taken' ? (free.length ? `${nameOf(MY.char)} is already in that game. Close this, pick ${free.join(' or ')}, and join again.` : 'All three are taken in that game. You can still watch.') : netErrText(e); }); };
  $('#mpJoin').onclick = () => join(false); $('#mpWatch').onclick = () => join(true); }
