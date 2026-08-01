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
    return {
      htmlVar: getComputedStyle(document.documentElement).getPropertyValue('--color-panel-rgb'),
      bodyVar: getComputedStyle(document.body).getPropertyValue('--color-panel-rgb'),
      headerVar: getComputedStyle(document.querySelector('header')).getPropertyValue('--color-panel-rgb'),
      // also check what the div sees right where it's inserted
      bodyChildrenCount: document.body.children.length,
      bodyClassName: document.body.className,
      bodyStyleAttr: document.body.getAttribute('style'),
    };
  });
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
