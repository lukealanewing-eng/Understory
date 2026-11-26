'use strict';
/* Critter kit: round, soft, big-eyed animals with springy animation.
   Every maker returns a rig { g, root, head, eyes, h, anim(dt, t, st) }.
   st: { speed, air, vy, swim (floating), dive (under water), talk (0..1), act ('sense' while sensing), look (head yaw) }
   Model space: +z is forward, feet on y = 0, sizes are final world units. */
const Critter = (() => {
  const T = THREE, TAU = Math.PI * 2, cl = (v, a, b) => Math.max(a, Math.min(b, v)), lp = (a, b, t) => a + (b - a) * t;
  const SPH = new T.SphereGeometry(1, 22, 16), CONE = new T.ConeGeometry(1, 1, 14), CYL = new T.CylinderGeometry(1, 1, 1, 14);
  const MC = new Map(), CAPS = new Map();
  /* plush material: smooth lambert with a soft fresnel rim so silhouettes read as fuzzy */
  function mat(col, o) {
    o = o || {}; const rim = o.rim === undefined ? .5 : o.rim, k = [col, rim, o.glow || 0, o.op || 1, o.side || 0].join('|'); let m = MC.get(k); if (m) return m;
    m = new T.MeshLambertMaterial({ color: col, emissive: o.glow ? col : 0, emissiveIntensity: o.glow || 0, transparent: !!o.op, opacity: o.op || 1, side: o.side ? T.DoubleSide : T.FrontSide, depthWrite: !o.op });
    if (rim) { m.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', `float rimK = pow(1. - clamp(abs(dot(normalize(vViewPosition), normalize(normal))), 0., 1.), 2.2);\n outgoingLight += (diffuseColor.rgb * .7 + .1) * rimK * ${rim.toFixed(2)};\n#include <opaque_fragment>`); }; m.customProgramCacheKey = () => 'rim' + rim.toFixed(2); }
    MC.set(k, m); return m;
  }
  const WHITE = new T.MeshBasicMaterial({ color: 0xffffff }), DARK = 0x1b1512;
  function part(geo, col, x, y, z, sx, sy, sz, rx, ry, rz) { const m = new T.Mesh(geo, typeof col === 'object' ? col : mat(col)); m.position.set(x || 0, y || 0, z || 0); const a = sx === undefined ? 1 : sx; m.scale.set(a, sy === undefined ? a : sy, sz === undefined ? a : sz); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; return m; }
  const ball = (col, ...a) => part(SPH, col, ...a), cone = (col, ...a) => part(CONE, col, ...a), cyl = (col, ...a) => part(CYL, col, ...a);
  /* a capsule hanging down from its origin (a limb) */
  function limb(col, r, len, x, y, z, rx, ry, rz) { const k = r.toFixed(3) + '|' + len.toFixed(3); let g = CAPS.get(k); if (!g) { g = new T.CapsuleGeometry(r, len, 5, 12); g.translate(0, -len / 2, 0); CAPS.set(k, g); } return part(g, col, x, y, z, 1, 1, 1, rx, ry, rz); }
  function grp(x, y, z, ...kids) { const g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); for (const k of kids) if (k) g.add(k); return g; }
  function rig(h) { const g = new T.Group(), root = new T.Group(); g.add(root); g.rotation.order = 'YXZ'; return { g, root, eyes: [], h: h || 1.2, bt: 1 + Math.random() * 3, sq: 0, sqV: 0, fl: 0, flV: 0, lastSp: 0, ph: Math.random() * 6, idle: 0, tilt: 0, tiltT: 3 + Math.random() * 4, wasAir: false, actT: 0 }; }
  /* big glossy eyes. o: { col, white, iris, splay, tall } */
  function eyes(c, head, x, y, z, r, o) {
    o = o || {};
    for (const s of [-1, 1]) { const e = new T.Group(); e.position.set(s * x, y, z); e.rotation.y = s * (o.splay === undefined ? .3 : o.splay); e.rotation.x = o.up || 0;
      if (o.white) e.add(ball(mat(0xfdfbf4, { rim: 0 }), 0, 0, -r * .12, r * 1.22, r * 1.22 * (o.tall || 1), r * .6));
      e.add(ball(mat(o.col || DARK, { rim: 0 }), 0, 0, 0, r * (o.white ? .78 : 1), r * (o.white ? .82 : 1.1) * (o.tall || 1), r * .62));
      if (o.iris) e.add(ball(mat(o.iris, { rim: 0 }), 0, 0, -r * .04, r * 1.16, r * 1.24, r * .56));
      e.add(part(SPH, WHITE, r * .26, r * .36, r * .5, r * .3)); e.add(part(SPH, WHITE, -r * .28, -r * .26, r * .54, r * .13));
      head.add(e); c.eyes.push(e); }
  }
  const blush = (head, x, y, z, r, col) => { for (const s of [-1, 1]) head.add(ball(mat(col || 0xff9aa8, { rim: 0, op: .55 }), s * x, y, z, r, r * .62, r * .4, 0, s * .5)); };
  /* shared life: blinking, squash and stretch, a floppy-bits spring, idle head tilts */
  function life(c, dt, st) {
    c.bt -= dt; if (c.bt < 0) c.bt = 1.6 + Math.random() * 4.2; const b = c.bt < .12 || st.sleep ? .1 : 1; for (const e of c.eyes) e.scale.y = lp(e.scale.y, b, Math.min(1, dt * 34));
    const air = !!st.air; if (c.wasAir && !air) c.sqV -= 4.2; if (!c.wasAir && air) c.sqV += 3; c.wasAir = air;
    c.sqV += (-c.sq * 190 - c.sqV * 13) * dt; c.sq = cl(c.sq + c.sqV * dt, -.4, .5); c.root.scale.set(1 - c.sq * .45, 1 + c.sq, 1 - c.sq * .45);
    const sp = st.speed || 0, acc = (sp - c.lastSp) / Math.max(dt, .004); c.lastSp = sp; c.flV += (-c.fl * 70 - c.flV * 6 - cl(acc, -40, 40) * .03 + c.sqV * .8) * dt; c.fl = cl(c.fl + c.flV * dt, -1, 1);
    c.idle = sp > .15 || air ? 0 : c.idle + dt;
    c.tiltT -= dt; if (c.tiltT < 0) { c.tiltT = 3 + Math.random() * 5; c.tiltTo = c.idle > 1 ? (Math.random() < .5 ? -1 : 1) * (.18 + Math.random() * .2) : 0; } if (c.tiltT < 1.2 || sp > .3) c.tiltTo = 0; c.tilt = lp(c.tilt, c.tiltTo || 0, Math.min(1, dt * 7));
    if (st.act === 'sense') c.actT = Math.min(1, c.actT + dt * 5); else c.actT = Math.max(0, c.actT - dt * 3);
  }

  /* ---------------- four-legged friends: dog, fox, raccoon, deer ---------------- */
  function quad(o) {
    const c = rig(o.h), L = o.L || .62, R = o.R || .3, leg = o.leg || .3, lr = o.legR || .085, H = o.head || .33, neck = o.neck || 0, hipY = leg + lr * .9, by = R * .78, zf = L * .76;
    const body = c.body = grp(0, hipY, -L * .38); c.root.add(body);
    body.add(ball(o.coat, 0, by, zf * .5, R, R * .96, L * .5 + R * .5), ball(o.coat, 0, by + R * .04, zf * .86, R * 1.02, R, R * .95), ball(o.coat, 0, by, zf * .1, R * .98, R * .95, R));
    if (L > R * 2.2) body.add(limb(o.coat, R * .97, zf * .8, 0, by, zf * .1, -Math.PI / 2), limb(o.belly || o.coat, R * .8, zf * .7, 0, by - R * .22, zf * .15, -Math.PI / 2)); else body.add(ball(o.belly || o.coat, 0, by - R * .24, zf * .52, R * .8, R * .78, L * .5 + R * .3)); if (o.bib) body.add(ball(o.bib, 0, by - R * .1, zf * .98 + R * .28, R * .62, R * .74, R * .5));
    if (o.saddle) body.add(ball(o.saddle, 0, by + R * .22, zf * .45, R * .84, R * .8, L * .5 + R * .3));
    if (o.spots) for (let i = 0; i < 9; i++) { const a = (i % 2 ? 1 : -1) * (.5 + (i % 3) * .28); body.add(ball(mat(o.spots, { rim: 0 }), Math.sin(a) * R * .93, by + Math.cos(a) * R * .9, zf * (.12 + i * .09), R * .13, R * .13, R * .1)); }
    c.legs = [[-1, 1], [1, 1], [-1, 0], [1, 0]].map(([s, f]) => { const p = grp(s * R * .5, lr * .2, f ? zf * .94 : zf * .04, limb(o.legCol || o.coat, lr, leg - lr, 0, 0, 0), ball(o.sock || o.coat, 0, -leg + lr * .15, lr * .35, lr * 1.3, lr * .95, lr * 1.6)); if (o.sock && o.sockH) p.add(limb(o.sock, lr * 1.04, leg * o.sockH, 0, -leg * (1 - o.sockH) + lr, 0)); body.add(p); return p; });
    const hy = by + R * .52 + neck * .85, hz = zf + R * .55 + neck * .42;
    if (neck) { const ny = by + R * .25, nz = zf + R * .25, dy = hy - H * .3 - ny, dz = hz - H * .2 - nz, nl = Math.hypot(dy, dz), rx = Math.atan2(-dz, -dy); body.add(limb(o.coat, R * .5, nl, 0, ny, nz, rx), ball(o.coat, 0, ny - R * .1, nz - R * .1, R * .7)); }
    const head = c.head = grp(0, hy, hz); body.add(head); const sn = o.snout === undefined ? H * .5 : o.snout;
    head.add(ball(o.coat, 0, 0, 0, H * 1.08, H * .95, H)); if (o.cap) head.add(ball(o.cap, 0, H * .2, -H * .08, H * .98, H * .8, H * .92));
    if (o.cheek) for (const s of [-1, 1]) head.add(cone(o.cheek, s * H * .86, -H * .3, H * .22, H * .34, H * .62, H * .3, 0, 0, s * 2.05));
    if (o.mask) for (const s of [-1, 1]) head.add(ball(mat(o.mask, { rim: 0 }), s * H * .4, H * .06, H * .7, H * .4, H * .3, H * .32, 0, s * .4, s * -.3));
    if (o.blaze) head.add(ball(o.blaze, 0, H * .18, H * .6, H * .2, H * .56, H * .46));
    head.add(ball(o.muzzle || o.belly || o.coat, 0, -H * .26, H * .62, H * .5, H * .4, sn), ball(o.nose || DARK, 0, -H * .13, H * .62 + sn * .9, H * .16, H * .12, H * .1));
    c.tongue = ball(mat(0xf58aa0, { rim: 0 }), 0, -H * .52, H * .72 + sn * .3, H * .13, H * .05, H * .2); c.tongue.visible = false; if (o.tongue) head.add(c.tongue);
    eyes(c, head, H * (o.eyeX || .44), H * .06, H * .8, o.eye || H * .21, { iris: o.iris, splay: .34 }); if (o.blush !== false) blush(head, H * .68, -H * .24, H * .58, H * .2, o.blush);
    c.ears = [-1, 1].map(s => { const e = new T.Group(), E = o.earS || 1; head.add(e);
      if (o.ear === 'round') { e.position.set(s * H * .7, H * .68, -H * .05); e.add(ball(o.earOut || o.coat, 0, H * .1, 0, H * .32 * E, H * .32 * E, H * .14), ball(o.earIn || 0xf2b6b0, 0, H * .1, H * .07, H * .2 * E, H * .2 * E, H * .08)); }
      else if (o.ear === 'flop') { e.position.set(s * H * .72, H * .62, -H * .02); e.rotation.z = s * -.5; e.add(ball(o.earOut || o.coat, s * H * .16, -H * .02, 0, H * .36 * E, H * .15, H * .3 * E, 0, 0, s * -.5), ball(o.earOut || o.coat, s * H * .4, -H * .22, H * .02, H * .2 * E, H * .1, H * .22 * E, 0, 0, s * -1.1)); }
      else if (o.ear === 'leaf') { e.position.set(s * H * .6, H * .6, -H * .12); e.rotation.z = s * -.95; e.add(ball(o.earOut || o.coat, 0, H * .52 * E, 0, H * .24 * E, H * .56 * E, H * .1), ball(o.earIn || 0xf6dcc6, 0, H * .5 * E, H * .06, H * .14 * E, H * .42 * E, H * .06)); }
      else { e.position.set(s * H * .58, H * .62, -H * .06); e.rotation.z = s * -.26; e.add(cone(o.earOut || o.coat, 0, H * .42 * E, 0, H * .34 * E, H * .9 * E, H * .16), cone(o.earIn || 0xf2b6b0, 0, H * .36 * E, H * .07, H * .2 * E, H * .62 * E, H * .1)); if (o.earTip) e.add(cone(o.earTip, 0, H * .7 * E, 0, H * .15 * E, H * .36 * E, H * .1)); }
      e.userData.z = e.rotation.z; return e; });
    if (o.antlers) for (const s of [-1, 1]) { const a = grp(s * H * .34, H * .8, -H * .1), B = o.antlers, bone = mat(0xe9dcc0, { rim: .3 }); a.rotation.set(-.35, 0, s * -.55); const up = grp(0, .24 * B, 0), up2 = grp(0, .2 * B, 0); up.rotation.set(.5, 0, s * .45); up2.rotation.set(.55, 0, s * .3);
      a.add(limb(bone, .034 * B, .24 * B, 0, 0, 0, Math.PI), limb(bone, .026 * B, .13 * B, 0, .1 * B, 0, 2.0), up); up.add(limb(bone, .03 * B, .2 * B, 0, 0, 0, Math.PI), limb(bone, .024 * B, .14 * B, 0, .1 * B, 0, 2.1), up2); up2.add(limb(bone, .026 * B, .17 * B, 0, 0, 0, Math.PI), limb(bone, .022 * B, .12 * B, 0, .06 * B, 0, 2.2)); head.add(a); }
    if (o.collar) body.add(part(new T.TorusGeometry(R * .66, R * .09, 8, 18), o.collar, 0, by + R * .34, zf + R * .34, 1, 1, 1, 1.05), ball(mat(0xf2d27a, { rim: .2 }), 0, by - R * .2, zf + R * .78, R * .11));
    const tail = c.tail = grp(0, by + R * .25, -R * .72); body.add(tail); c.tailSeg = [];
    const chain = (n, f) => { let p = tail; for (let i = 0; i < n; i++) { const g = new T.Group(), q = f(i, g); g.position.set(q[0], q[1], q[2]); p.add(g); p = g; c.tailSeg.push(g); } };
    if (o.tail === 'bush') { tail.rotation.x = -.5; chain(4, (i, g) => { const r = R * [.42, .56, .52, .3][i]; g.add(ball(i === 3 ? (o.tailTip || o.coat) : (o.tailCol || o.coat), 0, 0, -r * .5, r, r, r * 1.25)); return [0, 0, i ? -R * .5 : 0]; }); }
    else if (o.tail === 'ring') { tail.rotation.x = -.35; chain(6, (i, g) => { const r = R * [.34, .4, .42, .4, .34, .24][i]; g.add(ball(i % 2 ? o.tailTip : (o.tailCol || o.coat), 0, 0, -r * .3, r, r, r * 1.05)); return [0, 0, i ? -R * .36 : 0]; }); }
    else if (o.tail === 'curl') { tail.position.set(0, by + R * .62, -R * .5); chain(6, (i, g) => { const r = R * (.2 - i * .018); g.add(ball(i > 3 && o.tailTip ? o.tailTip : o.coat, 0, r * .6, 0, r, r * 1.25, r)); g.rotation.x = i ? .62 : -.75; return [0, i ? R * .26 : 0, 0]; }); }
    else { tail.rotation.x = -.9; tail.add(ball(o.coat, 0, 0, -R * .16, R * .2, R * .16, R * .3), ball(o.tailTip || 0xffffff, 0, -R * .06, -R * .2, R * .17, R * .12, R * .28)); }
    const stride = o.stride || .8; let sitK = 0;
    c.anim = (dt, t, st) => {
      life(c, dt, st); const sp = st.speed || 0, k = Math.min(1, sp / 3.2), swim = st.swim ? 1 : 0; if (k > .02) c.ph += dt * (4.6 + sp * 1.25) * (o.gait || 1); const s = Math.sin(c.ph), amp = k * stride;
      sitK = lp(sitK, o.sit && c.idle > 3 && !swim && !st.air ? 1 : 0, Math.min(1, dt * 5));
      const Lg = c.legs;
      if (st.air) { const f = cl(-.2 - (st.vy || 0) * .05, -1.1, .3); Lg[0].rotation.x = Lg[1].rotation.x = lp(Lg[0].rotation.x, -1 - f * .3, .3); Lg[2].rotation.x = Lg[3].rotation.x = lp(Lg[2].rotation.x, 1 + f * .4, .3); }
      else if (swim) { const q = Math.sin(t * 9); Lg[0].rotation.x = -.5 + q * .5; Lg[1].rotation.x = -.5 - q * .5; Lg[2].rotation.x = .4 - q * .5; Lg[3].rotation.x = .4 + q * .5; }
      else { Lg[0].rotation.x = s * amp + sitK * .46; Lg[3].rotation.x = s * amp - sitK * .95; Lg[1].rotation.x = -s * amp + sitK * .46; Lg[2].rotation.x = -s * amp - sitK * .95; }
      body.position.y = hipY + Math.abs(Math.cos(c.ph)) * .06 * amp - sitK * (L * .27) + Math.sin(t * 2.1) * .006; body.rotation.x = -sitK * .46 + (st.air ? cl(-(st.vy || 0) * .035, -.35, .4) : Math.sin(c.ph * 2) * .035 * amp) - swim * .12; body.rotation.z = s * .05 * amp;
      const talk = st.talk || 0; head.rotation.x = sitK * .4 - Math.sin(c.ph * 2 + .6) * .05 * amp + Math.sin(t * 1.3) * .03 + Math.sin(t * 14) * .05 * talk - c.actT * (o.senseUp ? -.5 : .55) + swim * -.2; head.rotation.y = lp(head.rotation.y, cl(st.look || 0, -1, 1) + Math.sin(t * .6 + c.ph) * .12 * (1 - k), Math.min(1, dt * 6)); head.rotation.z = c.tilt + s * -.04 * amp;
      if (c.actT > 0) head.position.y = hy - (o.senseUp ? -1 : 1) * c.actT * H * .1 + Math.sin(t * 26) * .012 * c.actT;
      c.ears.forEach((e, i) => { const sg = i ? 1 : -1, tw = Math.max(0, Math.sin(t * 1.7 + i * 2.1 + c.ph) - .96) * 8; e.rotation.x = c.fl * (o.ear === 'flop' ? .9 : .5) - talk * .1 + (st.air ? -.3 : 0); e.rotation.z = e.userData.z + sg * (c.fl * .25 + tw * .5 - c.actT * .22); });
      c.tongue.visible = !!o.tongue && (sp > 4 || (c.idle > 1 && Math.sin(t * .3 + c.ph) > .2)); c.tongue.position.y = -H * .5 + Math.sin(t * 11) * H * .03;
      const wag = o.wag ? Math.sin(t * (sp > .5 ? 15 : 9)) * (sp > .5 ? .45 : .22 + talk * .5 + c.actT * .5) : Math.sin(t * 1.5) * .12 + s * .14 * amp;
      c.tailSeg.forEach((g, i) => { if (o.tail === 'curl') g.rotation.z = wag * (i ? .22 : .5); else { g.rotation.y = wag * (i ? .32 : .5) + c.fl * .12; if (i) g.rotation.x = -c.fl * .22 + Math.sin(t * 1.9 + i) * .04 + (st.air ? .16 : 0); } });
      if (!c.tailSeg.length) tail.rotation.y = Math.sin(t * (o.wag ? 14 : 2)) * (o.wag ? .5 : .12), tail.rotation.x = -.9 + (sp > 5 || st.air || st.alarm ? 1.5 : 0);
    };
    return c;
  }
  const vinca = () => quad({ h: 1.25, L: .56, R: .29, leg: .27, legR: .08, head: .34, coat: 0x34343f, belly: 0x2a2a33, bib: 0xf8f4ea, sock: 0xf8f4ea, muzzle: 0x55545c, nose: 0x0c0a0a, ear: 'flop', earOut: 0x2a2a33, tail: 'curl', tailTip: 0xf8f4ea, collar: 0xc9bfa6, iris: 0x6b4423, eye: .078, wag: 1, tongue: 1, sit: 1, blaze: 0xf8f4ea, stride: .95, gait: 1.2 });
  const fox = () => quad({ h: 1.3, L: .6, R: .27, leg: .3, legR: .07, head: .33, coat: 0xf08a35, belly: 0xfbf2e0, bib: 0xfbf2e0, sock: 0x2a1c18, sockH: .55, muzzle: 0xfbf2e0, cheek: 0xfbf2e0, ear: 'point', earIn: 0xfbe2cc, earTip: 0x2a1c18, earS: 1.25, tail: 'bush', tailTip: 0xfbf2e0, tailCol: 0xe57a2c, iris: 0xd9a22e, eye: .074, sit: 1, snout: .2, stride: .95 });
  const raccoon = () => quad({ h: 1.2, L: .52, R: .34, leg: .22, legR: .09, head: .35, coat: 0x9a968f, saddle: 0x6c6964, belly: 0xe9e2d2, sock: 0x2e2b2a, muzzle: 0xf4eee0, mask: 0x23201f, cheek: 0xe9e2d2, ear: 'round', earOut: 0xe9e2d2, earIn: 0x55504c, earS: .8, tail: 'ring', tailTip: 0x2e2b2a, tailCol: 0xd8d1c2, eye: .07, sit: 1, snout: .15, stride: .7, blush: 0xf2a6a0 });
  const deer = (o) => quad(Object.assign({ h: 2.0, L: .82, R: .3, leg: .72, legR: .058, head: .27, neck: .44, coat: 0xcf9a62, belly: 0xfaf1e0, bib: 0xfaf1e0, sock: 0x3a2a20, muzzle: 0xfaf1e0, nose: 0x241a16, ear: 'leaf', earS: 1.15, tail: 'stub', eye: .068, snout: .17, stride: .62, gait: .8, eyeX: .5 }, o || {}));

  /* ---------------- duck ---------------- */
  function duck(o) {
    o = o || {}; const c = rig(1.0), coat = o.coat || 0xb98a58, dk = o.dark || 0x7c5838, lt = o.light || 0xe2c79c, bill = o.bill || 0xf59a34, Z = o.s || 1;
    const body = c.body = grp(0, .36, 0); c.root.add(body); c.root.scale.setScalar(1); c.g.scale.setScalar(Z);
    body.add(ball(coat, 0, 0, -.02, .3, .27, .4), ball(lt, 0, -.05, .14, .25, .24, .26), ball(dk, 0, .1, -.12, .25, .2, .3));
    const tail = c.tail = grp(0, .1, -.36, cone(dk, 0, .08, -.05, .12, .26, .07, -1.0), ball(0xfaf6ea, 0, 0, -.02, .1, .07, .1)); body.add(tail);
    c.wings = [-1, 1].map(s => { const w = grp(s * .27, .08, -.02, ball(dk, s * .03, -.04, -.06, .07, .17, .28, .15), ball(o.spec || 0x3f6fd0, s * .06, -.1, -.14, .03, .05, .1, .15)); body.add(w); return w; });
    const head = c.head = grp(0, .36, .24); body.add(head); body.add(ball(lt, 0, .18, .2, .15, .2, .15));
    head.add(ball(coat, 0, 0, 0, .23, .215, .22), ball(dk, 0, .08, -.03, .2, .15, .2), ball(bill, 0, -.05, .23, .125, .05, .15), ball(0xd97a1e, 0, -.085, .21, .1, .03, .12));
    eyes(c, head, .125, .03, .165, .052, { splay: .55 }); blush(head, .17, -.06, .13, .05);
    c.feet = [-1, 1].map(s => { const f = grp(s * .12, -.1, 0, limb(bill, .028, .2, 0, 0, 0), ball(bill, 0, -.24, .06, .085, .022, .12)); body.add(f); return f; });
    c.anim = (dt, t, st) => {
      life(c, dt, st); const sp = st.speed || 0, k = Math.min(1, sp / 2.6), sw = st.swim ? 1 : 0; if (k > .02) c.ph += dt * (7 + sp * 1.3); const s = Math.sin(c.ph);
      body.rotation.z = s * .17 * k * (1 - sw) + Math.sin(t * 1.4) * .03 * sw; body.position.y = .36 + Math.abs(Math.cos(c.ph)) * .03 * k * (1 - sw) + Math.sin(t * 1.9) * .012; body.rotation.x = c.actT * 1.35 * (sw ? 1 : .5) - (st.air ? .25 : 0);
      c.feet.forEach((f, i) => { f.rotation.x = st.air ? .9 : (i ? -1 : 1) * s * (sw ? .9 : .7) * (sw ? 1 : k) + c.actT * -1.2; });
      const flap = st.air ? 1 : Math.max(0, Math.sin(t * .37 + c.ph) - .97) * 30; c.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (flap ? .5 + Math.sin(t * 34) * .8 * Math.min(1, flap) : c.fl * .3); });
      head.position.z = .24 + Math.sin(c.ph * 2) * .035 * k; head.rotation.x = Math.sin(t * 15) * .06 * (st.talk || 0) + Math.sin(t * 1.2) * .03; head.rotation.y = lp(head.rotation.y, cl(st.look || 0, -1, 1) + Math.sin(t * .7 + c.ph) * .16 * (1 - k), Math.min(1, dt * 6)); head.rotation.z = c.tilt - body.rotation.z * .8;
      tail.rotation.y = (c.idle > .2 && c.idle < 1 ? Math.sin(t * 30) * .5 : Math.sin(t * 2) * .08) + c.fl * .3;
    };
    return c;
  }

  /* ---------------- frog ---------------- */
  function frog(o) {
    o = o || {}; const c = rig(.75), coat = o.coat || 0xb7a06a, dk = o.dark || 0x7d6a42, lt = o.light || 0xf3ead2, Z = o.s || 1; c.g.scale.setScalar(Z);
    const body = c.body = grp(0, .2, 0); c.root.add(body);
    body.add(ball(coat, 0, 0, -.03, .25, .19, .28), ball(lt, 0, -.06, .03, .22, .15, .24));
    if (o.mark !== false) body.add(ball(mat(dk, { rim: 0 }), 0, .15, -.08, .035, .03, .14, 0, .6), ball(mat(dk, { rim: 0 }), 0, .15, -.08, .035, .03, .14, 0, -.6));
    const head = c.head = grp(0, .08, .17); body.add(head); head.add(ball(coat, 0, 0, 0, .245, .16, .2), ball(lt, 0, -.07, .03, .21, .1, .18));
    const sac = c.sac = ball(mat(0xf6e7b8, { rim: .3, op: .92 }), 0, -.1, .1, .1, .09, .1); head.add(sac);
    for (const s of [-1, 1]) head.add(ball(coat, s * .13, .12, .02, .095, .095, .095));
    eyes(c, head, .13, .135, .06, .074, { splay: .5, iris: o.iris || 0xd9a23a }); blush(head, .19, -.02, .13, .045); head.add(ball(mat(dk, { rim: 0 }), 0, -.015, .192, .1, .008, .02));
    c.arms = [-1, 1].map(s => { const a = grp(s * .17, -.02, .14, limb(coat, .034, .1, 0, 0, 0, -.3, 0, s * .25), ball(lt, s * .03, -.15, .05, .05, .02, .06)); body.add(a); return a; });
    c.legs = [-1, 1].map(s => { const th = grp(s * .19, -.02, -.16), sh = grp(0, 0, .2); th.add(ball(coat, 0, 0, .1, .075, .07, .15), sh); sh.add(ball(coat, 0, 0, -.1, .05, .045, .13), ball(lt, s * .03, -.04, -.2, .07, .018, .1, 0, s * -.5)); th.rotation.y = s * .7; th.userData = { sh, s }; body.add(th); return th; });
    c.anim = (dt, t, st) => {
      life(c, dt, st); const sp = st.speed || 0, k = Math.min(1, sp / 2.5), sw = st.swim || st.dive ? 1 : 0; if (k > .02) c.ph += dt * (6 + sp * .7); const hop = st.air ? 1 : sw ? .5 + .5 * Math.sin(t * 7) * k : Math.max(0, Math.sin(c.ph)) * k;
      body.position.y = .2 + (st.air || sw ? 0 : hop * .16) + Math.sin(t * 2.4) * .006; body.rotation.x = st.air ? cl(-(st.vy || 0) * .05, -.5, .5) : -hop * .25;
      c.legs.forEach((th) => { const s = th.userData.s; th.rotation.y = s * lp(.7, 2.75, hop); th.userData.sh.rotation.y = -s * lp(.45, 2.75, hop); });
      c.arms.forEach((a, i) => { a.rotation.x = st.air ? -.9 : -hop * .5 + (sw ? Math.sin(t * 7 + i * 3) * .5 : 0); });
      const talk = st.talk || 0, puff = Math.max(talk * (.6 + .4 * Math.sin(t * 13)), c.actT * 1.6, .12 + Math.sin(t * 3.1) * .08); c.sac.scale.set(.1 + puff * .13, .09 + puff * .13, .1 + puff * .15);
      head.rotation.y = lp(head.rotation.y, cl(st.look || 0, -.5, .5), Math.min(1, dt * 6)); head.rotation.z = c.tilt * .7; head.rotation.x = -c.actT * .3;
    };
    return c;
  }

  /* ---------------- turtle ---------------- */
  function turtle(o) {
    o = o || {}; const c = rig(.8), sh = o.shell || 0x55603f, rim = o.rim || 0x7f8a55, skin = o.skin || 0x6f7a62, lt = o.light || 0xe8d98a;
    const body = c.body = grp(0, .2, 0); c.root.add(body);
    body.add(ball(sh, 0, .07, -.02, .36, .25, .42), ball(rim, 0, -.02, -.02, .39, .09, .45), ball(lt, 0, -.07, -.02, .32, .07, .38));
    for (const [x, z, r] of [[0, .12, .13], [-.17, -.02, .11], [.17, -.02, .11], [0, -.2, .12], [-.14, .2, .08], [.14, .2, .08]]) body.add(ball(mat(rim, { rim: 0 }), x, .26 - Math.abs(x) * .35 - Math.abs(z) * .12, z - .02, r, .035, r));
    if (o.moss !== false) body.add(ball(0x8fbf5a, .05, .33, -.05, .07, .05, .07), ball(0xa6d06a, -.03, .35, .0, .05, .05, .05), ball(0xf6e27a, .06, .39, -.04, .02));
    const neck = c.neck = grp(0, 0, .34); body.add(neck); neck.add(limb(skin, .075, .16, 0, 0, -.12, Math.PI / 2));
    const head = c.head = grp(0, .03, .08); neck.add(head); head.add(ball(skin, 0, 0, 0, .15, .135, .16), ball(skin, 0, -.02, .13, .08, .07, .08), ball(lt, 0, -.06, .04, .11, .06, .12));
    for (const s of [-1, 1]) head.add(ball(mat(lt, { rim: 0 }), s * .115, .075, .02, .02, .02, .12, 0, s * .2), ball(mat(lt, { rim: 0 }), s * .135, -.005, .0, .018, .018, .12, 0, s * .2));
    eyes(c, head, .095, .035, .095, .046, { splay: .6 }); blush(head, .12, -.035, .08, .035);
    c.legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([s, f]) => { const l = grp(s * .3, -.06, f * .26 - .02, ball(skin, s * .08, -.04, f * .05, .12, .05, .09, 0, s * f * -.6)); body.add(l); l.userData = { s, f }; return l; });
    const tail = cone(skin, 0, -.04, -.46, .04, .14, .03, -1.5); body.add(tail);
    c.anim = (dt, t, st) => {
      life(c, dt, st); const sp = st.speed || 0, k = Math.min(1, sp / 2), wet = st.dive || st.swim ? 1 : 0; if (k > .02) c.ph += dt * (wet ? 5 + sp * .5 : 7 + sp); const s = Math.sin(c.ph);
      c.legs.forEach((l) => { const { s: sd, f } = l.userData, q = Math.sin(c.ph + (sd * f > 0 ? 0 : Math.PI)); if (wet) { l.rotation.z = sd * (-.15 + q * .55 * (.3 + k)); l.rotation.y = sd * f * q * .5 * (.3 + k); l.rotation.x = 0; } else { l.rotation.y = sd * q * .5 * k; l.rotation.z = sd * .25; l.rotation.x = 0; } });
      body.rotation.z = s * .05 * k * (1 - wet) + Math.sin(t * 1.1) * .04 * wet; body.position.y = .2 + Math.abs(s) * .02 * k + Math.sin(t * 1.6) * .008;
      const out = cl(1 - (c.idle - 6) * .5, .15, 1) * (st.sleep ? .1 : 1); neck.position.z = lp(neck.position.z, .2 + out * .14 + c.actT * .08, Math.min(1, dt * 4));
      head.rotation.y = lp(head.rotation.y, cl(st.look || 0, -.8, .8) + Math.sin(t * .4 + c.ph) * .2 * (1 - k), Math.min(1, dt * 3)); head.rotation.x = Math.sin(t * 12) * .06 * (st.talk || 0) - .1 * wet - c.actT * .3; head.rotation.z = c.tilt * .6;
      tail.rotation.y = Math.sin(t * 3) * .3;
    };
    return c;
  }

  /* ---------------- generic fish (NPC) ---------------- */
  function fish(o) {
    o = o || {}; const c = rig(.6), coat = o.coat || 0x7f8f9a, lt = o.light || 0xe6e2d2, Z = o.s || 1; c.g.scale.setScalar(Z);
    const body = c.body = grp(0, .3, 0); c.root.add(body); body.add(ball(coat, 0, 0, 0, .2, .22, .4), ball(lt, 0, -.07, .03, .16, .15, .32));
    const head = c.head = grp(0, 0, .26); body.add(head); head.add(ball(coat, 0, 0, 0, .19, .2, .2)); eyes(c, head, .13, .04, .1, .06, { splay: .9, white: o.white }); blush(head, .15, -.05, .1, .04);
    if (o.whiskers) for (const s of [-1, 1]) head.add(limb(o.dark || 0x3a3a3a, .012, .3, s * .1, -.08, .15, 1.2, 0, s * -1.1), limb(o.dark || 0x3a3a3a, .01, .2, s * .05, -.12, .17, 1.0, 0, s * -.5));
    const tail = c.tail = grp(0, 0, -.34, ball(o.fin || coat, 0, 0, -.14, .03, .2, .16)); body.add(tail); body.add(ball(o.fin || coat, 0, .22, -.05, .025, .1, .16));
    c.fins = [-1, 1].map(s => { const f = grp(s * .17, -.08, .1, ball(o.fin || coat, s * .08, 0, -.03, .11, .02, .07)); body.add(f); return f; });
    c.anim = (dt, t, st) => { life(c, dt, st); const sp = st.speed || 0; c.ph += dt * (3 + sp * 2.4); const s = Math.sin(c.ph); tail.rotation.y = s * .6; body.rotation.y = -s * .08; c.fins.forEach((f, i) => f.rotation.z = (i ? 1 : -1) * (.3 + Math.sin(t * 5 + i) * .3)); head.rotation.y = s * .05; body.position.y = .3 + Math.sin(t * 1.7 + c.ph * .1) * .03; };
    return c;
  }

  /* ---------------- anglerfish (with Gary) ---------------- */
  function angler(o) {
    o = o || {}; const c = rig(1.0), coat = o.coat || 0x4b3d6e, lt = o.light || 0x8a79b0, fin = o.fin || 0x6a5a96, glow = o.glow || 0x9df2ff;
    const body = c.body = grp(0, .5, 0); c.root.add(body); body.add(ball(coat, 0, 0, 0, .4, .4, .44), ball(lt, 0, -.1, .08, .33, .3, .36));
    const head = c.head = grp(0, 0, .12); body.add(head);
    const jaw = c.jaw = grp(0, -.14, .22, ball(lt, 0, 0, .06, .3, .12, .2)); head.add(jaw); for (const x of [-.14, 0, .14]) jaw.add(cone(0xfffdf2, x, .12, .2 - Math.abs(x) * .4, .035, .11, .035));
    eyes(c, head, .19, .1, .27, .095, { white: true, splay: .5 }); c.eyes[1].scale.setScalar(.86); blush(head, .29, -.02, .22, .07, 0xff8fb8);
    const tail = c.tail = grp(0, 0, -.4, ball(fin, 0, 0, -.15, .04, .24, .2)); body.add(tail); body.add(ball(fin, 0, .36, -.14, .03, .12, .16));
    c.fins = [-1, 1].map(s => { const f = grp(s * .36, -.08, .0, ball(fin, s * .1, 0, -.04, .14, .03, .1)); body.add(f); return f; });
    const st0 = c.stalk = grp(0, .34, .16), st1 = grp(0, .24, 0), st2 = grp(0, .2, 0), rod = mat(coat, { rim: .3 }); st0.add(limb(rod, .022, .24, 0, .24, 0), st1); st1.add(limb(rod, .018, .2, 0, .2, 0), st2); st0.rotation.x = .55; st1.rotation.x = .75; st2.rotation.x = .7; body.add(st0);
    const bulb = c.bulb = part(SPH, new T.MeshBasicMaterial({ color: glow }), 0, .1, 0, .075); st2.add(bulb); st2.add(limb(rod, .014, .1, 0, .1, 0)); const halo = part(SPH, new T.MeshBasicMaterial({ color: glow, transparent: true, opacity: .25, depthWrite: false }), 0, .1, 0, .15); halo.castShadow = false; bulb.castShadow = false; st2.add(halo);
    c.light = new T.PointLight(glow, o.power === undefined ? 2.2 : o.power, 13, 1.6); c.light.position.set(0, .2, .25); st2.add(c.light); c.lightBase = c.light.intensity;
    const gary = c.gary = grp(-.36, -.2, -.12, ball(0xa99ac6, 0, 0, 0, .08, .075, .1), ball(0xa99ac6, 0, 0, -.11, .015, .05, .05)); gary.rotation.y = -1.1; body.add(gary); { const e = c.eyes.length; eyes(c, gary, .045, .02, .06, .026, { splay: .6 }); c.garyEyes = c.eyes.splice(e); }
    c.anim = (dt, t, st) => {
      life(c, dt, st); const sp = st.speed || 0, k = Math.min(1, sp / 3); c.ph += dt * (2.4 + sp * 2); const s = Math.sin(c.ph);
      tail.rotation.y = s * (.35 + k * .4); body.rotation.y = -s * .07 * (.4 + k); body.position.y = .5 + Math.sin(t * 1.5) * .04; body.rotation.z = Math.sin(t * .9) * .04;
      c.fins.forEach((f, i) => f.rotation.z = (i ? 1 : -1) * (.2 + Math.sin(t * (4 + k * 6) + i) * .45)); jaw.rotation.x = .05 + Math.abs(Math.sin(t * 11)) * .22 * (st.talk || 0);
      st0.rotation.x = .55 + c.fl * .25 + Math.sin(t * 1.3) * .05; st1.rotation.x = .75 + c.fl * .35 + Math.sin(t * 1.7 + 1) * .07; st2.rotation.x = .7 + c.fl * .4; st0.rotation.z = Math.sin(t * .8) * .08;
      const fl = 1 + c.actT * 2.2 + Math.sin(t * 3) * .06; bulb.scale.setScalar(.075 * (1 + c.actT * .5)); halo.scale.setScalar(.15 * fl); c.light.intensity = c.lightBase * fl;
      gary.rotation.z = Math.sin(t * 6) * .15; const gb = Math.sin(t * .23 + 2) > .97 ? .1 : 1; c.garyEyes.forEach(e => e.scale.y = gb);
    };
    return c;
  }

  /* ---------------- giant isopod ---------------- */
  function isopod(o) {
    o = o || {}; const c = rig(.7), coat = o.coat || 0xd9c4e2, edge = o.edge || 0xb39ac4, lt = o.light || 0xf3e8f2;
    const body = c.body = grp(0, .2, 0); c.root.add(body); const mid = new T.Group(); body.add(mid); c.seg = []; c.legs = [];
    const plate = (w, h, tailEnd) => { const g = new T.Group(); g.add(ball(coat, 0, .02, 0, w, h, .13), ball(edge, 0, -.01, -.04, w * 1.03, h * .8, .1), ball(lt, 0, -.07, 0, w * .8, .05, .11)); if (!tailEnd) for (const s of [-1, 1]) { const l = grp(s * w * .7, -.08, 0, limb(lt, .02, .16, 0, 0, 0, 0, 0, s * .5)); g.add(l); c.legs.push(l); } return g; };
    mid.add(plate(.3, .2)); let p = mid; for (let i = 1; i <= 3; i++) { const g = plate(.3 - i * .012, .2 - i * .012); g.position.z = .15; p.add(g); p = g; c.seg.push([g, 1]); }
    const head = c.head = grp(0, 0, .15); p.add(head); head.add(ball(coat, 0, 0, 0, .25, .15, .15), ball(lt, 0, -.06, .04, .2, .06, .1)); c.seg.push([head, 1]);
    for (const s of [-1, 1]) { const e = new T.Group(); e.position.set(s * .15, .04, .09); e.rotation.y = s * .7; e.add(ball(mat(DARK, { rim: 0 }), 0, 0, 0, .075, .055, .035), part(SPH, WHITE, .02, .02, .028, .02), part(SPH, WHITE, -.025, -.012, .03, .009)); head.add(e); c.eyes.push(e); }
    blush(head, .19, -.04, .09, .04, 0xff9ec4);
    c.ant = [-1, 1].map(s => { const a = grp(s * .07, .0, .14), b = grp(0, 0, .2); a.add(limb(edge, .014, .16, 0, 0, 0, -Math.PI / 2), b); b.position.z = .16; b.add(limb(edge, .01, .18, 0, 0, 0, -Math.PI / 2)); b.rotation.set(.5, s * .3, 0); head.add(a); return a; });
    p = mid; for (let i = 1; i <= 3; i++) { const g = plate(.29 - i * .03, .19 - i * .02, i === 3); g.position.z = -.15; p.add(g); p = g; c.seg.push([g, -1]); }
    p.add(ball(edge, 0, 0, -.14, .17, .06, .14), ball(coat, -.12, 0, -.1, .06, .03, .1, 0, .5), ball(coat, .12, 0, -.1, .06, .03, .1, 0, -.5));
    let curl = 0, flip = 0;
    c.anim = (dt, t, st) => {
      life(c, dt, st); const sp = st.speed || 0, k = Math.min(1, sp / 2); c.ph += dt * (2 + sp * 3.4);
      curl = lp(curl, st.roll ? 1 : 0, Math.min(1, dt * 9)); flip = lp(flip, st.dive && !st.roll && (st.off || 0) > .8 ? 1 : 0, Math.min(1, dt * 3));
      c.seg.forEach(([g, d], i) => { g.rotation.x = d * (curl * .82 + Math.sin(c.ph * .5 + i * .7) * .04 * (.3 + k) + (st.talk || 0) * (d > 0 ? -.05 : 0)); });
      c.legs.forEach((l, i) => { l.rotation.x = Math.sin(c.ph * 2 + Math.floor(i / 2) * 1.0) * .7 * (.15 + k); l.scale.y = 1 - curl * .7; });
      c.ant.forEach((a, i) => { a.rotation.y = (i ? 1 : -1) * (.35 + Math.sin(t * 1.9 + i * 1.3) * .22 + c.actT * .4); a.rotation.x = -.45 + Math.sin(t * 2.6 + i) * .15 - c.actT * .3; });
      mid.rotation.z = flip * Math.PI; mid.rotation.x = st.roll ? (mid.rotation.x - dt * 14) : mid.rotation.x * (1 - Math.min(1, dt * 10)); body.position.y = .2 + curl * .16 + flip * .1 + Math.sin(t * 1.3) * .01 * (st.dive ? 3 : 1);
      head.rotation.y = lp(head.rotation.y, cl(st.look || 0, -.4, .4), Math.min(1, dt * 4)); head.rotation.z = c.tilt * .5;
    };
    return c;
  }

  /* ---------------- dumbo octopus ---------------- */
  function dumbo(o) {
    o = o || {}; const c = rig(1.0), coat = o.coat || 0xf4a47e, lt = o.light || 0xfbd3b6, dk = o.dark || 0xe07f66;
    const body = c.body = grp(0, .5, 0); c.root.add(body); const head = c.head = grp(0, 0, 0); body.add(head);
    head.add(ball(coat, 0, .06, 0, .36, .34, .34), ball(lt, 0, -.04, .1, .3, .24, .26)); eyes(c, head, .17, .02, .28, .092, { splay: .42 }); blush(head, .28, -.09, .22, .07, 0xff8a9c);
    head.add(ball(mat(dk, { rim: 0 }), 0, -.1, .325, .035, .02, .02));
    c.fins = [-1, 1].map(s => { const f = grp(s * .22, .3, -.02, ball(dk, s * .13, .02, 0, .17, .06, .13), ball(lt, s * .13, .03, .03, .11, .05, .09)); head.add(f); return f; });
    const skirt = c.skirt = part(new T.CylinderGeometry(.24, .4, .26, 16, 1, true), mat(lt, { side: 1, rim: .3 }), 0, -.3, 0); body.add(skirt);
    c.arms = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + .39, g = grp(Math.sin(a) * .2, -.22, Math.cos(a) * .2), g2 = grp(0, -.2, 0); g.rotation.y = a; g.add(limb(coat, .07, .16, 0, 0, 0), g2); g2.add(limb(coat, .05, .12, 0, 0, 0), ball(lt, 0, -.17, 0, .045)); body.add(g); c.arms.push([g, g2]); }
    c.anim = (dt, t, st) => {
      life(c, dt, st); const sp = st.speed || 0, k = Math.min(1, sp / 3); c.ph += dt * (2.2 + sp * 1.7); const pu = Math.sin(c.ph), open = .5 + pu * (.22 + k * .2);
      c.arms.forEach(([g, g2], i) => { g.rotation.x = -open - Math.sin(t * 1.3 + i) * .06 - c.actT * .4 * (i % 2 ? 1 : -1); g2.rotation.x = open * .9 + Math.sin(c.ph - .9 + i * .4) * .3; });
      skirt.scale.set(1 + (open - .5) * .7, 1 - (open - .5) * .3, 1 + (open - .5) * .7); body.position.y = .5 - pu * .035 + Math.sin(t * 1.1) * .03; head.scale.set(1 - pu * .03, 1 + pu * .04, 1 - pu * .03);
      c.fins.forEach((f, i) => f.rotation.z = (i ? 1 : -1) * (.45 + Math.sin(t * (2.4 + k * 5) + i * .3) * .5 + c.fl * .3)); head.rotation.z = c.tilt + Math.sin(t * .8) * .04; head.rotation.x = Math.sin(t * 13) * .04 * (st.talk || 0) + k * .18;
      head.rotation.y = lp(head.rotation.y, cl(st.look || 0, -.6, .6), Math.min(1, dt * 5));
    };
    return c;
  }

  /* ---------------- little people ---------------- */
  function human(o) {
    o = o || {}; const c = rig(2.1), skin = o.skin || 0xe0ac82, shirt = o.shirt || 0x5f8fb0, pants = o.pants || 0x3f4c5e, Z = o.s || 1; c.g.scale.setScalar(Z);
    const body = c.body = grp(0, .78, 0); c.root.add(body); body.add(ball(shirt, 0, .3, 0, .27, .36, .2)); if (o.vest) body.add(ball(o.vest, 0, .3, 0, .285, .3, .215));
    c.legs = [-1, 1].map(s => { const l = grp(s * .12, .05, 0, limb(pants, .095, .58, 0, 0, 0), ball(o.shoe || 0x3a2d24, 0, -.74, .05, .1, .07, .16)); body.add(l); return l; });
    c.arms = [-1, 1].map(s => { const a = grp(s * .29, .52, 0, limb(shirt, .07, .3, 0, 0, 0), ball(skin, 0, -.42, 0, .075)); a.rotation.z = s * .14; body.add(a); return a; });
    const head = c.head = grp(0, .92, .02); body.add(head); head.add(ball(skin, 0, 0, 0, .29, .28, .27));
    if (o.hair) head.add(ball(o.hair, 0, .07, -.05, .3, .26, .28)); if (o.bun) head.add(ball(o.hair, 0, .3, -.12, .12)); if (o.tails) for (const s of [-1, 1]) head.add(ball(o.hair, s * .3, -.02, -.08, .09, .14, .09));
    if (o.hat === 'hard') head.add(ball(o.hatCol || 0xf2d24b, 0, .13, 0, .31, .2, .31), ball(o.hatCol || 0xf2d24b, 0, .09, .2, .2, .03, .16)); else if (o.hat === 'cap') head.add(ball(o.hatCol || 0x2f6b4a, 0, .14, -.01, .3, .18, .29), ball(o.hatCol || 0x2f6b4a, 0, .1, .26, .17, .025, .15)); else if (o.hat === 'bucket') head.add(ball(o.hatCol || 0xe9dcc0, 0, .16, 0, .29, .17, .28), ball(o.hatCol || 0xe9dcc0, 0, .08, 0, .4, .035, .39));
    eyes(c, head, .11, -.01, .235, .042, { splay: .3 }); blush(head, .17, -.08, .2, .05); head.add(ball(mat(0x8a4a3a, { rim: 0 }), 0, -.11, .255, .04, .014, .02));
    if (o.beard) head.add(ball(o.beard, 0, -.14, .15, .2, .13, .15)); if (o.glasses) for (const s of [-1, 1]) head.add(part(new T.TorusGeometry(.06, .012, 6, 14), mat(0x2a2a2a, { rim: 0 }), s * .11, -.01, .262));
    c.hand = c.arms[1];
    c.anim = (dt, t, st) => {
      life(c, dt, st); const sp = st.speed || 0, k = Math.min(1, sp / 2); if (k > .02) c.ph += dt * (3.5 + sp * 1.9); const s = Math.sin(c.ph) * k;
      c.legs[0].rotation.x = s * .7; c.legs[1].rotation.x = -s * .7; c.arms[0].rotation.x = -s * .6 + (st.hold === 2 ? -1.3 : 0); c.arms[1].rotation.x = st.hold ? -1.25 + Math.sin(t * 2) * .05 : s * .6; if (st.wave) c.arms[1].rotation.x = -2.6 + Math.sin(t * 12) * .3;
      body.position.y = .78 + Math.abs(Math.cos(c.ph)) * .04 * k + Math.sin(t * 1.8) * .006; body.rotation.z = s * .04; head.rotation.y = lp(head.rotation.y, cl(st.look || 0, -1, 1) + Math.sin(t * .5 + c.ph) * .2 * (1 - k), Math.min(1, dt * 4)); head.rotation.x = Math.sin(t * 13) * .05 * (st.talk || 0) + (st.down ? .35 : 0); head.rotation.z = c.tilt * .6;
    };
    return c;
  }
  return { mat, part, ball, cone, cyl, limb, grp, rig, eyes, blush, life, quad, vinca, fox, raccoon, deer, duck, frog, turtle, fish, angler, isopod, dumbo, human, SPH, CONE, CYL, lp, cl };
})();
