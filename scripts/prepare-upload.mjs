import { chromium } from 'playwright';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import assert from 'node:assert/strict';

// Mechanical upload encoding only. Keep original assets and all dimensions;
// create a sibling distribution, leaving public/ and the normal deliverables intact.
const source = resolve('dist'), target = resolve('dist-upload');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const assets = {}, records = [];
try {
  const page = await browser.newPage();
  for (const file of await readdir(source, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const path = resolve(file.parentPath ?? file.path, file.name);
    const relative = path.slice(source.length + 1).replaceAll('\\', '/');
    let name = relative, bytes = await readFile(path);
    if (relative.endsWith('-atlas.png')) {
      const encoded = await page.evaluate(async data => {
        const original = new Image(); original.src = `data:image/png;base64,${data}`; await original.decode();
        const canvas = document.createElement('canvas'); canvas.width = original.naturalWidth; canvas.height = original.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(original, 0, 0);
        const before = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const output = canvas.toDataURL('image/webp', .9), check = new Image(); check.src = output; await check.decode();
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(check, 0, 0);
        const after = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let alphaError = 0, colorError = 0, samples = 0;
        for (let i = 0; i < before.length; i += 4) {
          alphaError = Math.max(alphaError, Math.abs(before[i + 3] - after[i + 3]));
          if (before[i + 3] > 240) { for (let c = 0; c < 3; c++) colorError += Math.abs(before[i + c] - after[i + c]); samples += 3; }
        }
        return { encoded: output.split(',')[1], width: check.naturalWidth, height: check.naturalHeight, alphaError, colorMAE: colorError / Math.max(1, samples) };
      }, bytes.toString('base64'));
      assert.equal(encoded.alphaError, 0, relative + '透明度必须保留');
      assert.ok(encoded.colorMAE < 8, relative + '图集颜色偏差过大');
      name = relative.replace(/\.png$/, '.webp');
      const originalBytes = bytes.length; bytes = Buffer.from(encoded.encoded, 'base64');
      records.push({ file: name, originalBytes, bytes: bytes.length, width: encoded.width, height: encoded.height, alphaError: encoded.alphaError, colorMAE: +encoded.colorMAE.toFixed(3) });
    } else if (relative === 'js/assets.js') {
      const code = bytes.toString('utf8'); assert.ok(code.includes('-atlas.png'));
      bytes = Buffer.from(code.replaceAll('-atlas.png', '-atlas.webp'));
    }
    const output = resolve(target, name); await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes);
    if (name.startsWith('assets/')) {
      const ext = extname(name).slice(1), mime = ext === 'jpg' ? 'jpeg' : ext;
      assets[name.slice(7)] = `data:image/${mime};base64,${bytes.toString('base64')}`;
    }
  }
  assert.equal(records.length, 6);
  const originalHtml = await readFile('deliverables/收藏成形-双击预览.html', 'utf8');
  const marker = 'const LOCAL_ASSETS = ', start = originalHtml.indexOf(marker), end = originalHtml.indexOf(';\n', start);
  assert.ok(start > 0 && end > start);
  const portable = originalHtml.slice(0, start + marker.length) + JSON.stringify(assets) + originalHtml.slice(end).replaceAll('-atlas.png', '-atlas.webp');
  await writeFile('deliverables/scx-upload.html', portable);
  await writeFile('deliverables/upload-encoding-report.json', JSON.stringify({ method: '只转换6张备用图集为WebP；原尺寸、透明度与其余文件保留', records, portableBytes: Buffer.byteLength(portable) }, null, 2));
  console.log(JSON.stringify({ atlasBeforeMiB: +(records.reduce((s, x) => s + x.originalBytes, 0) / 1024 ** 2).toFixed(2), atlasAfterMiB: +(records.reduce((s, x) => s + x.bytes, 0) / 1024 ** 2).toFixed(2), portableMiB: +(Buffer.byteLength(portable) / 1024 ** 2).toFixed(2), maxColorMAE: Math.max(...records.map(x => x.colorMAE)) }));
} finally { await browser.close(); }
