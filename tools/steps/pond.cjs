module.exports = (ch) => {
  const board = `(()=>{ document.querySelectorAll('#sheetCard .clueq').forEach((el,i)=>{ el.querySelectorAll('button')[0].click(); el.querySelectorAll('button')[[1,1,2][i]].click(); }); })()`;
  const wheels = `(()=>{ const w=[...document.querySelectorAll('#sheetCard .wheel')]; w[0].click(); w[0].click(); for(const k of R.order) w.find(b=>b.dataset.k===k).click(); })()`;
  const s = ['npc_lou', 'sheen', 'npc_priya', 'sign', { expect: "S.clues.includes('sheen')&&S.clues.includes('notebook')&&S.clues.includes('sign')" }];
  s.push(ch === 'frog' ? 'gapOut' : 'gapOut', { wait: 1500 }); if (ch === 'frog') s.push('washout', 'npc_rick', 'gapIn', { wait: 1500 });
  s.push(ch === 'turtle' ? 'drain' : 'drainUp', { expect: "S.clues.length===5" }, { shot: 'a' }, { js: "__go('npc_lou')", sheetJs: board }, { wait: 1500 }, { expect: 'S.st===2' });
  // receipts
  if (ch === 'duck') s.push({ js: "placePlayer(34,6); doSense(); 1" }, { wait: 300 }, 'bottle'); else s.push('bottle2');
  s.push(ch === 'turtle' ? 'tag' : 'tagUp'); if (ch === 'frog') s.push('gapOut', { wait: 1500 }, 'ticket', 'gapIn', { wait: 1500 }); else s.push('gapOut');
  s.push({ expect: "['bottle','tag','ticket'].every(has)" }, 'bucket', { expect: "flag('bucket')" }, 'npc_priya', { wait: 1500 });
  const sim = "for(let i=0;i<300;i++){ LV.tick(.05, i*.05); updateNPCs(.05,i*.05); } [NPCS.priya.g.position.x.toFixed(1), NPCS.priya.g.position.z.toFixed(1)].join()";
  if (ch === 'duck') s.push({ js: "placePlayer(20,42); 1" }, { js: sim }, { js: "placePlayer(42,36); 1" }, { js: sim }, { shot: 'b' }, { js: "placePlayer(41.5,17); 1" }, { js: sim }, { wait: 800 });
  s.push({ wait: 500 }, { js: '__drain()' }, { expect: 'S.st===3' });
  // shutoff
  if (ch === 'frog') s.push('gapOut', { wait: 1500 }, 'card', { js: "placePlayer(STN.breaker.p[0],STN.breaker.p[2]);1" }, { wait: 6000 }, { shot: 'c' }, { js: "__go('wheelsBrk')", sheetJs: wheels });
  if (ch === 'duck') s.push({ js: "placePlayer(STN.buoy.p[0],STN.buoy.p[2]);1" }, { wait: 6000 }, { shot: 'c' }, { js: "__go('wheelsUp')", sheetJs: wheels });
  if (ch === 'turtle') s.push({ js: "placePlayer(STN.wheel.p[0],STN.wheel.p[2],STN.wheel.p[1]+.3);player.under=true;1" }, { wait: 6000 }, { shot: 'c' }, { js: "__go('wheels')", sheetJs: wheels });
  s.push({ wait: 1500 }, { js: '__drain()' }, { expect: "flag('shut')&&S.st===4" }, { wait: 3000 }, 'npc_lou', { wait: 3000 }, { js: '__drain()' }, { wait: 1500 }, { js: '__drain()' }, { wait: 1500 }, { js: '__drain()' }, { wait: 1500 }, { expect: "flag('done')" }, { shot: 'd' });
  return s;
};
