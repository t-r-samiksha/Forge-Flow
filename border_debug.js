const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 400 } });
  await page.addInitScript(() => {
    window.localStorage.setItem('forge_user_id', 'border-debug-user');
    window.localStorage.setItem('forge_theme', 'dark');
  });
  await page.goto('http://localhost:3000/campaigns', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/border_debug.png', fullPage: false });

  const info = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')];
    return btns.map(b => {
      const cs = getComputedStyle(b);
      return {
        text: b.textContent.trim().slice(0, 20),
        borderColor: cs.borderColor,
        borderWidth: cs.borderWidth,
        borderStyle: cs.borderStyle,
        outline: cs.outline,
        backgroundColor: cs.backgroundColor,
        className: b.className,
      };
    });
  });
  console.log(JSON.stringify(info, null, 2));

  const rootDataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const rootColorScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  console.log('data-theme:', rootDataTheme, '| color-scheme:', rootColorScheme);

  await browser.close();
})();
