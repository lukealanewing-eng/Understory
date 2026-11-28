module.exports = (ch) => {
  const board = `(()=>{ const q=[...document.querySelectorAll('#sheetCard .clueq')]; const w=['gord','tessa','lyle'].filter(k=>k!==R.culprit); q[0].querySelector('button[data-o="'+w[0]+'"]').click(); q[0].querySelector('button[data-o="'+w[1]+'"]').click(); q[0].querySelector('button[data-o="'+R.culprit+'"]').click(); q[1].querySelector('button[data-o="0"]').click(); q[1].querySelector('button[data-o="1"]').click(); q[2].querySelector('button[data-o="2"]').click(); })()`;
  const sight = `(()=>{ $('#sightGo').click(); $('#pkB').querySelectorAll('button')[R.bear].click(); $('#pkS').querySelectorAll('button')[R.sta].click(); $('#sightGo').click(); })()`;
  const sim = "for(let i=0;i<400;i++){ LV.tick(.05, i*.05); updateNPCs(.05,i*.05); tickStations(.05,i*.05); } 1";
  const at = (id) => ({ js: `placePlayer(STN.${id}.p[0],STN.${id}.p[2]);1` });
  const s = ['npc_hobart', 'stakes', 'cam', 'notice', 'wetland', { expect: 'S.clues.length===4' }, { shot: 'a' }, 'npc_hobart', { expect: 'S.st===1' }, 'npc_gord', 'npc_tessa', 'npc_lyle', 'scent', 'call', 'paper', { expect: "['f_nose','f_ears','f_paper'].every(flag)" }, { js: "__go('npc_hobart')", sheetJs: board }, { wait: 1500 }, { js: '__drain()' }, { expect: 'S.st===2' }];
  if (ch === 'vinca') s.push({ js: 'placePlayer(-30,-42); senseCD=0; doSense(); 1' }, { wait: 300 }, 'card'); else s.push('cardAsk');
  s.push({ expect: "has('card')" }, 'view', { expect: "flag('photos')" }, 'leapOut', { wait: 1600 }); if (ch === 'deer') s.push('plug', { shot: 'b' });
  s.push({ js: '__drain()' }, { expect: "flag('drained')" });
  if (ch === 'vinca') s.push({ js: 'placePlayer(62,34); senseCD=0; doSense(); 1' }, { wait: 300 }, 'pin'); else s.push('pinAsk');
  s.push({ expect: "flag('pin')" });
  if (ch === 'deer') s.push('cap', at('cap'), { js: sim }, { wait: 400 }, { js: "__go('sightCap')", sheetJs: sight });
  if (ch === 'vinca') s.push(at('pin'), { js: sim }, { wait: 400 }, { shot: 'c' }, { js: "__go('sightPin')", sheetJs: sight });
  if (ch === 'golfer') s.push(at('sight'), { js: sim }, { wait: 400 }, { shot: 'c' }, { js: "__go('sight')", sheetJs: sight });
  s.push({ wait: 1200 }, { js: '__drain()' }, { expect: 'S.st===3' });
  if (ch === 'deer') s.push('leapIn', { wait: 1600 });
  s.push(at({ deer: 'cross', vinca: 'feet', golfer: 'mic' }[ch]), { js: sim }, { wait: 1500 }, { shot: 'd' }, { js: '__drain()' }, { wait: 1500 }, { js: '__drain()' }, { wait: 1500 }, { js: '__drain()' }, { wait: 1500 }, { js: '__drain()' }, { wait: 1500 }, { js: '__drain()' }, { wait: 1500 }, { expect: "flag('done')&&S.st===4" }, (ch === 'golfer' ? { js: "__go('ace'); new Promise(r=>{ const t=setInterval(()=>{ const m=$('#thM'); if(!sheetOpen){clearInterval(t);r(1);return;} const x=parseFloat(m.style.left)+3; if(x>46&&x<54) $('#thGo').click(); },8); })", sheet: false } : 'ace'), 'bench', 'bed', 'record', 'discs', 'plans', { expect: 'S.disc.length===6' }, { shot: 'e' });
  return s;
};
