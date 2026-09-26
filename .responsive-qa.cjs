const { chromium } = require('C:/Users/looknam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const sample of [
      { name: 'iphone', width: 896, height: 414, mobile: true },
      { name: 'iphone-small', width: 667, height: 375, mobile: true },
      { name: 'ipad', width: 1024, height: 768, mobile: true },
      { name: 'desktop', width: 1365, height: 768, mobile: false },
    ]) {
      const context = await browser.newContext({ viewport: { width: sample.width, height: sample.height }, deviceScaleFactor: 1, isMobile: sample.mobile, hasTouch: sample.mobile });
      const host = await context.newPage();
      await host.goto('http://localhost:39001/');
      await host.locator('#name').fill('Host');
      await host.waitForTimeout(150);
      await host.locator('#create').click();
      await host.waitForFunction(() => document.querySelector('#lobby-code')?.textContent?.length === 6);
      const code = await host.locator('#lobby-code').textContent();
      const guests = [];
      for (let i = 0; i < (sample.name === 'iphone-small' ? 3 : 1); i++) {
        const guest = await context.newPage();
        guests.push(guest);
        await guest.goto('http://localhost:39001/');
        await guest.locator('#name').fill(`Guest ${i + 1}`);
        await guest.locator('#room-code').fill(code);
        await guest.waitForTimeout(150);
        await guest.locator('#join').click();
      }
      await host.locator('#start').waitFor({ state: 'visible' });
      await host.waitForFunction(() => !document.querySelector('#start').disabled);
      await host.locator('#start').click();
      await host.locator('#hud').waitFor({ state: 'visible' });
      await host.waitForTimeout(500);
      const info = await host.evaluate(() => {
        const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
        return { viewport: { width: innerWidth, height: innerHeight }, app: box('#app'), playerStrip: box('#player-strip'), weather: box('.weather-panel'), aim: box('.aim-panel'), items: box('.item-panel'), fire: box('#fire'), dpad: box('#touch-dpad'), dpadVisible: !document.querySelector('#touch-dpad').classList.contains('hidden'), controlHint: getComputedStyle(document.querySelector('#control-hint')).display };
      });
      await host.screenshot({ path: `D:/workshop/skyward_salvage/.responsive-${sample.name}.png` });
      console.log(sample.name, JSON.stringify(info));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
