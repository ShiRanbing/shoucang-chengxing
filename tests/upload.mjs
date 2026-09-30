import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { sampleProject, makeStop } from '../public/js/model.js';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const origin = 'http://upload-check.test', root = resolve(process.env.SCX_UPLOAD_ROOT ?? 'dist-upload');
const errors = [], passes = [], key = 'shoucang-chengxing.project.v1';
const portableFile = process.env.SCX_UPLOAD_HTML ?? 'deliverables/scx-upload.html';
const outputPrefix = process.env.SCX_UPLOAD_ROOT ? 'small-release' : process.env.SCX_UPLOAD_HTML ? 'single-release' : 'upload';
try {
  for (const portable of process.env.SCX_UPLOAD_ROOT ? [false] : process.env.SCX_UPLOAD_HTML ? [true] : [false, true]) {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    await context.route(/^https?:/, async route => {
      const url = new URL(route.request().url());
      if (portable || url.origin !== origin) { errors.push(`外部请求：${url.href}`); return route.abort(); }
      const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + sep)) return route.abort();
      try { return route.fulfill({ body: await readFile(file), contentType: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[extname(file)] }); }
      catch { errors.push(`文件缺失：${file}`); return route.fulfill({ status: 404 }); }
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(portable ? pathToFileURL(resolve(portableFile)).href : origin);
    if (process.env.SCX_UPLOAD_ROOT) {
      const manifest = JSON.parse(await readFile('deliverables/small-upload-assets.json', 'utf8'));
      assert.equal(await page.locator('meta[name=scx-release]').getAttribute('content'), manifest.release);
      const decoded = await page.evaluate(async records => Promise.all(records.map(async item => {
        const image = new Image(); image.src = './assets/' + item.filename; await image.decode();
        return { name: item.filename, width: image.naturalWidth, height: image.naturalHeight };
      })), manifest.records);
      assert.equal(decoded.length, 74); assert.ok(decoded.every(image => image.width > 0 && image.height > 0));
      passes.push('实际ZIP解压目录：版本标识正确；74个独立素材解码成功');
    }
    if (await page.locator('#scx-local-assets').count()) {
      const manifest = await page.locator('#scx-local-assets').evaluate(async element => {
        const map = JSON.parse(element.textContent);
        return Promise.all(Object.entries(map).map(async ([name, src]) => { const image = new Image(); image.src = src; await image.decode(); return { name, width: image.naturalWidth, height: image.naturalHeight }; }));
      });
      assert.equal(manifest.length, 74); assert.ok(manifest.every(image => image.width > 0 && image.height > 0));
      assert.equal(new Set(manifest.filter(image => image.name.startsWith('place-')).map(image => image.name)).size, 42);
      assert.equal(await page.locator('meta[name=scx-release]').getAttribute('content'), 'SCX-FULL-20260930-SINGLE-01');
      passes.push('单文件标识正确；74个内嵌素材全部解码成功，包含42幅独立景点插画');
    }
    assert.equal(await page.locator('.community-card').count(), 22);
    assert.equal(await page.locator('#welcome-guide').isVisible(), true);
    await page.locator('#nav-workbench').click(); await page.locator('#welcome-demo').click();
    await page.waitForFunction(() => !document.querySelector('#export-png').disabled && document.querySelector('#save-status').textContent === '已保存到此浏览器');
    const knownArt = await page.locator('.place-art').evaluateAll(images => Promise.all(images.map(async image => { await image.decode(); return image.naturalWidth > 0; })));
    assert.ok(knownArt.every(Boolean));
    const example = await page.locator('#poster').evaluate(canvas => canvas.toDataURL('image/png').split(',')[1]);
    await writeFile(`test-results/${outputPrefix}-example.png`, Buffer.from(example, 'base64'));
    for (const city of ['杭州', '上海']) for (const theme of ['watercolor', 'pencil', 'retro']) {
      const project = sampleProject(); project.city = city; project.theme = theme;
      project.inspirations = project.inspirations.slice(0, 6).map((item, i) => ({ ...item, city, place: `我的自选地点${i + 1}`, category: ['nature', 'street', 'culture', 'food', 'coffee', 'other'][i] }));
      project.stops = project.inspirations.map(item => makeStop(item.id));
      await page.evaluate(({ key, project }) => localStorage.setItem(key, JSON.stringify(project)), { key, project });
      await page.reload(); await page.waitForFunction(() => !document.querySelector('#export-png').disabled);
      assert.doesNotMatch(await page.locator('#stage-caption').textContent(), /未加载/);
      const download = page.waitForEvent('download'); await page.locator('#export-png').click();
      const file = resolve(`test-results/${outputPrefix}-${portable ? 'single' : 'static'}-${city === '杭州' ? 'hz' : 'sh'}-${theme}.png`);
      await (await download).saveAs(file); const bytes = await readFile(file);
      assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), 1440);
      await page.locator('[data-close=image-dialog]').click();
    }
    passes.push(`${portable ? '单文件HTML' : '轻量多文件网站'}：22篇笔记、首访导览、独立景点图、两城三风格备用图集及6次PNG实际下载正常`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`test-results/${outputPrefix}-report.json`, JSON.stringify({ portableFile, passes, errors }, null, 2));
  console.log(JSON.stringify({ passes, errors }, null, 2));
} finally { await browser.close(); }
