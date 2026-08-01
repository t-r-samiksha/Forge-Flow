const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  await page.addInitScript(() => {
    window.localStorage.setItem('forge_user_id', 'verify-tool-agent-user');
  });

  // Drive through setup -> build (2 missions) -> ship for tool-agent.
  await page.goto('http://localhost:3000/setup/tool-agent', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);
  await page.click('button:has-text("I\'ve run these")');
  await page.waitForTimeout(800);

  for (let mission = 0; mission < 2; mission++) {
    // fill selects (skip placeholder "choose…" option -> pick last option)
    const selects = await page.$$('.slot select');
    for (const sel of selects) {
      await sel.selectOption({ index: 1 });
    }
    // fill text inputs inside slots
    const inputs = await page.$$('.slot input[type="text"]');
    for (const inp of inputs) {
      const placeholder = await inp.getAttribute('placeholder');
      await inp.fill(placeholder ? `test ${placeholder}`.slice(0, 24) : 'test-value');
    }
    await page.waitForTimeout(600);
    const btn = page.locator('button:has-text("Continue"), button:has-text("Ship the agent")');
    await btn.click();
    await page.waitForTimeout(900);
  }

  await page.waitForTimeout(1500);
  console.log('URL after ship click:', page.url());
  await page.screenshot({ path: '/tmp/ship_toolagent.png', fullPage: true });

  const panelLabel = await page.$eval('.impact-hd span', el => el.textContent).catch(() => 'NOT FOUND');
  const itemLabel = await page.$eval('.queue-lbl', el => el.textContent).catch(() => 'NOT FOUND');
  const queueNum = await page.$eval('.queue-num', el => el.textContent).catch(() => 'NOT FOUND');
  console.log('panelLabel:', panelLabel, '| itemLabel:', itemLabel, '| queueNum:', queueNum);

  await browser.close();
})();
