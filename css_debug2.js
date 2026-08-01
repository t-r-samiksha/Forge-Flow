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
    const rootStyle = getComputedStyle(document.documentElement);
    const varsToCheck = ['--color-panel-rgb', '--color-line-2-rgb', '--color-dim-rgb', '--color-void-rgb'];
    const varValues = {};
    for (const v of varsToCheck) varValues[v] = rootStyle.getPropertyValue(v);

    const btn = document.querySelector('header button');
    const btnCs = btn ? getComputedStyle(btn) : null;
    const headerCs = getComputedStyle(document.querySelector('header'));

    return {
      dataTheme: document.documentElement.getAttribute('data-theme'),
      varValues,
      btnBorderColor: btnCs && btnCs.borderColor,
      btnBackgroundColor: btnCs && btnCs.backgroundColor,
      btnColor: btnCs && btnCs.color,
      headerColor: headerCs.color,
      htmlTag: document.documentElement.outerHTML.slice(0, 200),
    };
  });
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
