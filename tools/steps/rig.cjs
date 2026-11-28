module.exports = (ch) => {
  const board = `(()=>{ document.querySelectorAll('#sheetCard .clueq').forEach((el,i)=>{ const b=el.querySelectorAll('button'); b[(([1,R.k,1][i])+1)%4].click(); b[[1,R.k,1][i]].click(); }); })()`;
  const dials = `(()=>{ document.querySelector('#dlGo').click(); R.combo.forEach((v,i)=>{ const b=document.querySelector('#sheetCard button[data-d="'+i+'"][data-s="1"]'); for(let k=0;k<v;k++) b.click(); }); document.querySelector('#dlGo').click(); })()`;
  const sim = "for(let i=0;i<400;i++){ tickStations(.05,i*.05); LV.tick(.05, i*.05); updateNPCs(.05,i*.05); } [NPCS.rov.g.position.x.toFixed(1), NPCS.rov.g.position.z.toFixed(1), Object.keys(S.hold).join()].join()";
  const stn = (id) => ({ js: `(()=>{ const s=STN[${id}]; placePlayer(s.p[0],s.p[2],s.p[1]); return s.id })()` });
  const s = ['npc_chorus', 'bleach', 'beacon', 'npc_vesper', 'tags', 'water', 'lines', { expect: 'S.clues.length===6' }, { shot: 'a' }, { js: "__go('npc_chorus')", sheetJs: board }, { wait: 1500 }, { js: '__drain()' }, { expect: 'S.st===2' }];
  if (ch === 'angler') s.push('npc_rov', { expect: "flag('follow')" }, { js: "placePlayer(BEAC0[0],BEAC0[1]-10,6);1".replace(/BEAC0/g, '[4,20]') }, { js: sim }, { shot: 'b' }, { js: "(()=>{ const w=[[-48,-18],[4,-54],[50,-12]][R.k]; placePlayer(w[0]*.5,w[1]*.5,6); })()" }, { js: sim }, { js: "(()=>{ const w=[[-48,-18],[4,-54],[50,-12]][R.k]; placePlayer(w[0]+3,w[1]+3,6); })()" }, { js: sim }, { wait: 600 }, { js: '__drain()' });
  if (ch === 'isopod') s.push(stn("'bc'"), { wait: 1500 }, { expect: "held('bc')" }, { shot: 'b' }, 'lureB', { wait: 2500 }, { js: '__drain()' });
  if (ch === 'dumbo') s.push(stn("'h'+R.k"), { wait: 1500 }, { expect: "held('h'+R.k)" }, { shot: 'b' }, { js: "__go('lureH'+R.k)" }, { wait: 2500 }, { js: '__drain()' });
  s.push({ wait: 800 }, { js: '__drain()' }, { expect: "flag('seen')&&S.st===3" });
  s.push(stn(`({angler:'dl',dumbo:'dm',isopod:'da'})['${ch}']+R.k`), { wait: 1500 }, { js: 'doSense(); 1' }, { wait: 400 }, { shot: 'c' }, { js: "IX.find(o=>o.id==='tree'+R.k).act(); 1", sheetJs: dials }, { wait: 1500 }, { js: '__drain()' }, { expect: "flag('shut')&&S.st===4" });
  s.push('npc_chorus', { wait: 2500 }, { js: '__drain()' }, { wait: 1500 }, { js: '__drain()' }, { wait: 1500 }, { js: '__drain()' }, { wait: 1500 }, { expect: "flag('done')" }, { shot: 'd' });
  return s;
};
