// Renders the PNG app icons from inline SVG. Run once with: node scripts/make-icons.cjs
// Needs Playwright (not a project dependency) and a Japanese font on the machine.
const { chromium } = require('playwright');
const path = require('node:path');

const svg = (maskable) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${maskable ? 0 : 96}" fill="#111417"/>
  <text x="256" y="262" font-size="${maskable ? 230 : 300}" font-weight="700" text-anchor="middle"
        dominant-baseline="central" fill="#7fc8a9"
        font-family="'Noto Sans JP','Noto Sans CJK JP','IPAGothic',sans-serif">語</text>
</svg>`;

(async () => {
  const browser = await chromium.launch();
  const out = path.join(__dirname, '..', 'public', 'icons');
  for (const [name, size, maskable] of [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true],
  ]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg(maskable).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</div></body>`,
    );
    await page.screenshot({ path: path.join(out, name), omitBackground: true });
    await page.close();
  }
  await browser.close();
})();
