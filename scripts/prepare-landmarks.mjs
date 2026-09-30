import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { chromium } from 'playwright';
// Mechanical, loss-bounded web encoding. Each source was generated separately with imagegen.
const inputs = JSON.parse(await readFile('scripts/landmark-inputs.local.json', 'utf8'));
await mkdir('assets-staging/place-originals', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  for (const item of inputs) {
    const original = await readFile(item.sourcePath);
    await copyFile(item.sourcePath, `assets-staging/place-originals/${item.file.replace('.webp', '.png')}`);
    const result = await page.evaluate(async data => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'), ratio = Math.min(1, 768 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
      const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) transparent++;
      return { encoded: canvas.toDataURL('image/webp', .9).split(',')[1], width: canvas.width, height: canvas.height, transparent };
    }, original.toString('base64'));
    if (result.transparent < result.width * result.height * .03) throw new Error(`插画缺少透明留白：${item.file}`);
    await writeFile(`public/assets/${item.file}`, Buffer.from(result.encoded, 'base64'));
    console.log(`${item.file}: ${result.width}×${result.height}, ${Math.round(Buffer.byteLength(result.encoded, 'base64') / 1024)} KB`);
  }
} finally { await browser.close(); }
