// usage: node play.js url out.png "js to eval after start" [w h]
const { chromium } = require('playwright');
(async () => { const [url, out, js, w, h] = process.argv.slice(2); const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const p = await b.newPage({ viewport: { width: +(w || 1280), height: +(h || 720) } });
  p.on('console', m => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/deprecated|ReadPixels|fonts.g/.test(t)) console.log('[' + m.type() + ']', t.slice(0, 500)); }); p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300), (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  await p.goto(url); await p.waitForFunction('window.ready', null, { timeout: 60000 }).catch(e => console.log('no ready'));
  if (js) { const r = await p.evaluate(js).catch(e => 'EVAL ERR ' + e.message); if (r !== undefined) console.log('=>', JSON.stringify(r)); }
  await p.waitForTimeout(+(process.env.WAIT || 1500)); await p.screenshot({ path: out }); await b.close(); })();
