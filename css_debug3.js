const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.localStorage.setItem('forge_theme', 'dark');
  });
  await page.goto('http://localhost:3000/campaigns', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    // isolate: test bg-panel/border-line-2 on a plain div vs a button
    const div = document.createElement('div');
    div.className = 'bg-panel border border-line-2 text-dim';
    div.textContent = 'test-div';
    document.body.appendChild(div);
    const divCs = getComputedStyle(div);

    const btn = document.createElement('button');
    btn.className = 'bg-panel border border-line-2 text-dim';
    btn.textContent = 'test-btn';
    document.body.appendChild(btn);
    const btnCs = getComputedStyle(btn);

    return {
      div: { bg: divCs.backgroundColor, border: divCs.borderColor, color: divCs.color },
      btn: { bg: btnCs.backgroundColor, border: btnCs.borderColor, color: btnCs.color },
    };
  });
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
