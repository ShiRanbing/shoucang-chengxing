import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
// Mechanical web encoding only; artwork is generated individually with imagegen.
const inputs = JSON.parse(await readFile('scripts/cover-inputs.local.json', 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  for (const item of inputs) {
    const data = (await readFile(item.sourcePath)).toString('base64');
    const encoded = await page.evaluate(async data => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'), ratio = Math.min(1, 800 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
      const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .84).split(',')[1];
    }, data);
    await writeFile(`public/assets/${item.file}`, Buffer.from(encoded, 'base64'));
    console.log(`${item.file}: ${Math.round(Buffer.byteLength(encoded, 'base64') / 1024)} KB`);
  }
} finally { await browser.close(); }
