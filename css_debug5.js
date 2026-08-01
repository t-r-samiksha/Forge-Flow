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
    const matches = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (rule.selectorText === '.bg-panel') {
          matches.push({ href: sheet.href, index: i, cssText: rule.cssText });
        }
      }
    }
    return matches;
  });
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
