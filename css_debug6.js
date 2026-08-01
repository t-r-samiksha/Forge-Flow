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
    const tests = {};

    // Test 1: simplest possible nested var, no opacity indirection
    const d1 = document.createElement('div');
    d1.style.cssText = 'background-color: rgb(var(--color-panel-rgb));';
    document.body.appendChild(d1);
    tests.simpleNestedVar = getComputedStyle(d1).backgroundColor;

    // Test 2: with the opacity var indirection exactly like Tailwind
    const d2 = document.createElement('div');
    d2.style.cssText = '--tw-bg-opacity: 1; background-color: rgb(var(--color-panel-rgb) / var(--tw-bg-opacity, 1));';
    document.body.appendChild(d2);
    tests.withOpacityVar = getComputedStyle(d2).backgroundColor;

    // Test 3: hardcode the rgb triplet directly (bypass --color-panel-rgb)
    const d3 = document.createElement('div');
    d3.style.cssText = '--tw-bg-opacity: 1; background-color: rgb(16 16 24 / var(--tw-bg-opacity, 1));';
    document.body.appendChild(d3);
    tests.hardcodedTripletSpaceSyntax = getComputedStyle(d3).backgroundColor;

    // Test 4: comma syntax instead of space syntax for the rgb triplet var
    const d4 = document.createElement('div');
    d4.style.cssText = '--tw-bg-opacity: 1; background-color: rgb(var(--color-panel-rgb) / var(--tw-bg-opacity, 1));';
    document.body.appendChild(d4);
    tests.checkPanelRgbRawValue = getComputedStyle(d4).getPropertyValue('--color-panel-rgb');

    return tests;
  });
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
