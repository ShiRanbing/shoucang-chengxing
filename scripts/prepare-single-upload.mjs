import { chromium } from 'playwright';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// A distinct transport artifact; never overwrite full-resolution source assets.
// Scene content is unchanged. Only image dimensions and web encoding are adjusted.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const assets = {}, records = [];
try {
  const page = await browser.newPage();
  for (const name of await readdir('dist/assets')) {
    if (!/\.(png|jpg|webp)$/.test(name)) continue;
    const input = await readFile(`dist/assets/${name}`), mime = name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.png') ? 'image/png' : 'image/webp';
    if (name.startsWith('source-')) {
      assets[name] = `data:${mime};base64,${input.toString('base64')}`;
      records.push({ name, originalBytes: input.length, bytes: input.length, unchanged: true });
      continue;
    }
    const width = name.startsWith('place-') ? 512 : name.startsWith('cover-') ? 640 : 768;
    const result = await page.evaluate(async ({ data, mime, width }) => {
      const source = new Image(); source.src = `data:${mime};base64,${data}`; await source.decode();
      const canvas = document.createElement('canvas'), ratio = Math.min(1, width / source.naturalWidth);
      canvas.width = Math.round(source.naturalWidth * ratio); canvas.height = Math.round(source.naturalHeight * ratio);
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const before = ctx.getImageData(0, 0, canvas.width, canvas.height).data, encoded = canvas.toDataURL('image/webp', .82);
      const check = new Image(); check.src = encoded; await check.decode(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(check, 0, 0);
      const after = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let alphaError = 0, colorError = 0, samples = 0;
      for (let i = 0; i < before.length; i += 4) {
        alphaError = Math.max(alphaError, Math.abs(before[i + 3] - after[i + 3]));
        if (before[i + 3] > 240) { for (let c = 0; c < 3; c++) colorError += Math.abs(before[i + c] - after[i + c]); samples += 3; }
      }
      return { encoded, width: canvas.width, height: canvas.height, alphaError, colorMAE: colorError / Math.max(1, samples) };
    }, { data: input.toString('base64'), mime, width });
    assert.equal(result.alphaError, 0, name + '透明度变化');
    assert.ok(result.colorMAE < 8, name + '编码颜色偏差过大');
    assets[name] = result.encoded;
    records.push({ name, originalBytes: input.length, bytes: Buffer.byteLength(result.encoded.split(',')[1], 'base64'), width: result.width, height: result.height, alphaError: result.alphaError, colorMAE: +result.colorMAE.toFixed(3) });
  }
  const original = await readFile('deliverables/收藏成形-双击预览.html', 'utf8');
  const marker = 'const LOCAL_ASSETS = ', start = original.indexOf(marker), end = original.indexOf(';\n', start);
  assert.ok(start > 0 && end > start);
  const expected = JSON.parse(original.slice(start + marker.length, end));
  assert.deepEqual(Object.keys(assets).sort(), Object.keys(expected).sort());
  assert.equal(Object.keys(assets).filter(name => name.startsWith('place-')).length, 42);
  assert.equal(Object.keys(assets).filter(name => name.startsWith('cover-')).length, 22);
  const release = 'SCX-FULL-20260930-SINGLE-01';
  const headComment = `<!-- 收藏成形完整发布版 ${release}。22篇笔记、两城、三种路书风格、42张景点图及使用导览。\n直接原样复制本文件为 index.html 提供静态预览。内嵌素材在文件末尾 scx-local-assets 中，无需读取或改写大段素材数据。 -->`;
  let output = original.slice(0, start) + "const LOCAL_ASSETS = JSON.parse(document.getElementById('scx-local-assets').textContent)" + original.slice(end);
  output = output.replace('<head>', `<head>\n${headComment}\n<meta name="scx-release" content="${release}">`);
  // Module execution is deferred until parsing finishes, so this data block is
  // available before the app starts. Keep the long data line out of the source head.
  output = output.replace('</body>', `<script id="scx-local-assets" type="application/json">\n${JSON.stringify(assets)}\n</script>\n</body>`);
  await writeFile('deliverables/scx-release.html', output);
  const report = { release, method: '备用单文件HTML；图片尺寸/编码压缩，原始源码、高清图片和来源截图保留', bytes: Buffer.byteLength(output), sizeMiB: +(Buffer.byteLength(output) / 1024 ** 2).toFixed(2), assetCount: records.length, records };
  await writeFile('deliverables/single-upload-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ release, sizeMiB: report.sizeMiB, bytes: report.bytes, assetCount: records.length, codeBeforeImages: true, maxColorMAE: Math.max(...records.map(item => item.colorMAE ?? 0)) }));
} finally { await browser.close(); }
