const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/campaigns', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const varsToCheck = ['--color-panel-rgb', '--color-line-2-rgb', '--color-dim-rgb', '--color-void-rgb'];
    const varValues = {};
    for (const v of varsToCheck) varValues[v] = rootStyle.getPropertyValue(v);

    // Find the actual CSS rule text for .bg-panel and .border-line-2
    let panelRule = null, lineRule = null;
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of rules) {
        if (!rule.selectorText) continue;
        if (rule.selectorText === '.bg-panel' && !panelRule) panelRule = rule.cssText;
        if (rule.selectorText === '.border-line-2' && !lineRule) lineRule = rule.cssText;
      }
    }
    return { varValues, panelRule, lineRule };
  });
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
