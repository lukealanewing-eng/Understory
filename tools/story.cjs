// Scripted playthrough: node story.js <lv> <char> <stepsFile.js> [shotPrefix]
// stepsFile exports an array of steps: 'ixId' (go there and act) | {js:'...'} | {shot:'name'} | {wait:ms} | {expect:'js expr'}
const { chromium } = require('playwright'); const path = require('path');
(async () => { const [lv, ch, file, pre] = process.argv.slice(2); const steps = require(path.resolve(file))(ch);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); let errs = 0;
  p.on('console', m => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/deprecated|ReadPixels|fonts.g|GPU stall/.test(t)) { errs++; console.log('[' + m.type() + ']', t.slice(0, 400)); } }); p.on('pageerror', e => { errs++; console.log('[pageerror]', e.message.slice(0, 300), (e.stack || '').split('\n').slice(1, 4).join(' | ')); });
  await p.goto(`http://localhost:8123/stories.html?lv=${lv}`); await p.waitForFunction('window.ready', null, { timeout: 60000 });
  await p.evaluate(`window.__NOADAPT=1; window.__log=[]; const _t=toast; toast=(h,ms)=>{__log.push(h.replace(/<[^>]+>/g,''));_t(h,ms)};
    window.__drain=()=>{ let n=0; if(sheetOpen&&!cardOpen) return 'sheet'; while((Dlg.on||cardOpen)&&n++<400){ if(cardOpen){ const c=$('#chap'); if(c.onclick){ const f=c.onclick; performance.now=((o)=>()=>o()+1e6)(performance.now.bind(performance)); f(); } return 'card'; } if(sheetOpen) return 'sheet'; if(Dlg.node&&Dlg.node.c){ const bs=$('#dlgCh').querySelectorAll('button'); bs[Math.floor(Math.random()*bs.length)].click(); } else { if(Dlg.typing){__log.push('  '+$('#dlgName').textContent+': '+Dlg.full);} Dlg.typing=false; Dlg.lock=0; Dlg.hold=false; dlgNext(); } } return sheetOpen ? 'sheet' : n; };
    window.__go=(id)=>{ const o=IX.find(o=>o.id===id); if(!o) return 'NO IX '+id; if(!ixLive(o)) return 'NOT LIVE '+id; const y=ixY(o); placePlayer(o.p[0]+.3,o.p[2]+.3, o.p[1]===null&&!o.float? undefined : y); if(CH().dive&&y<waterY()-1) player.under=true; o.act(o); return 'ok '+id; };
    beginGame({S:freshState(12345),char:'${ch}'}); 1`);
  for (const s of steps) { let r;
    if (typeof s === 'string') { r = await p.evaluate(`__go(${JSON.stringify(s)})`); if (!/^ok/.test(r)) { errs++; console.log('!!', r); } }
    else if (s.js) { r = await p.evaluate(s.js).catch(e => { errs++; return 'EVAL ERR ' + e.message; }); if (typeof r === 'string' && /ERR/.test(r)) console.log('!!', r); }
    else if (s.shot) { await p.waitForTimeout(700); await p.screenshot({ path: `${pre || 'st'}_${s.shot}.png` }); continue; }
    else if (s.wait) { await p.waitForTimeout(s.wait); continue; }
    else if (s.expect) { r = await p.evaluate(s.expect); if (!r) { errs++; console.log('!! EXPECT FAILED:', s.expect); } continue; }
    for (let i = 0; i < 30; i++) { await p.waitForTimeout(120); const d = await p.evaluate('busy ? "busy" : __drain()'); if (d === 0 || d === 'sheet') { if (d === 'sheet' && s.sheet !== false) { await p.evaluate(s.sheetJs || 'closeSheet()'); await p.waitForTimeout(1100); continue; } break; } if (d === 'card' || d === 'busy') await p.waitForTimeout(800); } }
  const log = await p.evaluate('__log'); if (process.env.LOG) console.log(log.join('\n')); console.log(`${lv}/${ch}: done, errors=${errs}, stage=${await p.evaluate('S.st')}, flags=${await p.evaluate('Object.keys(S.f).join(",")')}`); await b.close(); })();
