'use strict';
/* Not a story: a small yard for exercising engine features (stories.html?lv=lab). Used by tools/lab-test.js. */
(() => {
  const pool = (x, z) => Math.hypot(x + 20, z) < 9 ? 1 : Math.hypot(x + 20, z - 22) < 9 ? 2 : 0;       /* 1: low pool, 2: high pool */
  const hRaw = (x, z) => { const a = Math.hypot(x + 20, z), b = Math.hypot(x + 20, z - 22); let h = 1 + (x > 30 ? (x - 30) * 1.4 : 0); if (a < 10) h = lerp(1, -4, sstep(10, 6, a)); if (b < 10) h = Math.min(h + 3, lerp(4, -1, sstep(10, 6, b))); else if (z > 10 && x < -8 && x > -32) h = Math.max(h, lerp(1, 4, sstep(10, 13, z))); return h; };
  let lift = null, box = null, fence = null, snow = null;
  U.level({
    id: 'lab', title: 'The Lab', tag: 'Engine test yard.', order: ['bird', 'bug', 'mole'], D: {},
    chars: {
      bird: { name: 'Bird', role: 'Flies', blurb: 'fly', pitch: 500, skills: ['fly'], make: () => Critter.duck(), speed: 6, swim: 6, flySp: 11, jump: 7, jumpWater: 6, fly: true, draft: .2, home: [4, 4, 0], sense: { k: 'a', name: 'Scout', scout: 3, far: '', none: [] } },
      bug: { name: 'Bug', role: 'Climbs', blurb: 'climb', pitch: 700, skills: ['climb', 'push'], make: () => Critter.frog({ s: 1.2 }), speed: 6, swim: 4, jump: 9, climb: 4, draft: .14, home: [6, 4, 0], sense: { k: 'b', name: 'Peep', far: '', none: [] } },
      mole: { name: 'Mole', role: 'Burrows and dives', blurb: 'burrow', pitch: 200, skills: ['burrow', 'dive'], make: () => Critter.turtle(), speed: 5, swim: 5, diveSp: 8, dive: true, fish: false, leap: 9, burrow: true, draft: .24, home: [8, 4, 0], sense: { k: 'c', name: 'Taste', far: '', none: [] } }
    },
    env: { waterY: (x, z) => pool(x, z) === 2 ? 3.2 : pool(x, z) === 1 ? .4 : -1e9, spawn: (i) => [i * 2, 0], bound: { r: 60 }, tracks: { n: 100 } },
    moods: { day: { top: 0x5a9bc4, hor: 0xf8dfae, sunC: 0xfff0c4, sunI: 1.2, hemS: 0xfff1d6, hemG: 0x6f7c44, hemI: .8, fog: 0xeed6a8, fd: .006, dir: [.55, .52, .35] } },
    CLUES: {}, ITEMS: {}, DISC: {}, cards: { intro: [['Lab', 'x', '']] }, tasks: () => [], objective: () => ({ t: 'Test things' }),
    force: (p, mode) => mode === 'float' && pool(p.x, p.z) === 1 ? [1.5, 0, 0] : mode === 'fly' && p.z < -20 ? [0, 0, 4] : null,
    canBurrow: (x, z) => x > -8,
    build() {
      terrain({ size: 140, n: 70, height: hRaw, color: (x, z, h) => h < .5 ? [.5, .5, .4] : [.5, .65, .35] });
      water({ x: -20, z: 0, size: 22, seg: 20 }); water({ x: -20, z: 22, size: 22, seg: 20, flow: [1, 0] });
      box = block(10, 16, 10, 16, 6); scene.add(mesh(GEO.box, 0x8a8f96, 13, 3.5, 13, 6, 5, 6));
      fence = block(18, 18.3, -10, 10, 3, { low: true, noCam: true }); scene.add(mesh(GEO.box, 0x6b5440, 18.15, 2, 0, .3, 2, 20));
      carriable({ id: 'key', at: [2, -6], mesh: mesh(GEO.box, 0xf2d24b, 0, 0, 0, .4, .2, .2), label: 'the key', rest: .2 });
      ix({ id: 'lock', at: [8, -6], r: 2.4, label: 'Use the key', when: () => holding('key'), act: () => { consume('key'); setFlag('unlocked'); } });
      snow = pushable({ id: 'ball', at: [-4, -8], r: .8, skill: 'push', mesh: mesh(GEO.sph, 0xffffff, 0, 0, 0, .8), onMove: (p, d) => { p.total = (p.total || 0) + d; } });
      watcher({ at: () => [0, 1, 20, Math.PI], range: 9, fov: .5, caught: () => setFlag('caught') });
      station({ id: 'plate', at: [-6, 12], r: 1.8, skill: 'climb', manual: true, when: () => true });
      lift = { t: 0, at(dt) { this.t += dt; return this.t > 3 ? null : [20 + this.t * 3, 1 + this.t * 2, -14, 0]; } };
      ix({ id: 'lift', at: [20, -14], r: 2, label: 'Ride', act: () => { lift.t = 0; ride(lift); } });
    }
  });
})();
