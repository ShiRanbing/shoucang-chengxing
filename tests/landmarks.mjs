import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { sampleProject, makeStop } from '../public/js/model.js';
import { SHANGHAI_PLACES } from '../public/js/notes.js';
import { LANDMARKS, landmarkFilename } from '../public/js/landmarks.js';

const root = resolve('dist'), output = resolve('test-results'), origin = 'http://landmarks.test';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const failures = [], passes = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
try {
  for (const format of ['static', 'portable']) for (const theme of ['watercolor', 'pencil', 'retro']) for (const group of ['杭州前六站', '杭州后两站', '上海六站']) {
    const project = sampleProject(); project.theme = theme;
    if (group === '上海六站') { project.city = '上海'; project.title = '在上海，收藏一日心动'; project.inspirations = structuredClone(SHANGHAI_PLACES); }
    const selected = group === '杭州后两站' ? project.inspirations.slice(6) : project.inspirations.slice(0, 6);
    project.stops = selected.map(item => makeStop(item.id));
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.route(/^https?:/, async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || format !== 'static') { failures.push(`外部请求：${url.href}`); return route.abort(); }
      const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(root + sep)) return route.fulfill({ status: 403 });
      try { return route.fulfill({ body: await readFile(path), contentType: mime[extname(path)] }); }
      catch { failures.push(`资源缺失：${path}`); return route.fulfill({ status: 404, body: 'Missing' }); }
    });
    await context.addInitScript(project => {
      localStorage.setItem('shoucang-chengxing.project.v1', JSON.stringify(project));
      window.posterImageSources = [];
      const clear = CanvasRenderingContext2D.prototype.clearRect, draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.clearRect = function(...args) { if (this.canvas.id === 'poster') window.posterImageSources = []; return clear.apply(this, args); };
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) { if (this.canvas.id === 'poster') window.posterImageSources.push(image.src); return draw.call(this, image, ...args); };
    }, project);
    const page = await context.newPage(); page.on('pageerror', error => failures.push(error.message));
    await page.goto(format === 'static' ? origin + '/#workbench' : pathToFileURL(resolve('deliverables/收藏成形-双击预览.html')).href + '#workbench');
    await page.waitForFunction(() => !document.querySelector('#export-png').disabled);
    const cards = page.locator('.place-art');
    assert.equal(await cards.count(), project.inspirations.length);
    await cards.evaluateAll(images => Promise.all(images.map(image => image.decode())));
    assert.equal(await cards.evaluateAll(images => new Set(images.map(image => image.src)).size), project.inspirations.length);
    for (const item of selected) {
      const file = landmarkFilename(item, theme);
      assert.equal(await page.locator(`[data-artwork="${file}"]`).evaluate(image => window.posterImageSources.includes(image.src)), true, `${format}/${theme}/${item.place} 的卡片与画布素材必须一致`);
    }
    assert.equal(await page.locator('#stage-caption').textContent(), '换个顺序，添一句心情。每一次修改，都会留在画里。');
    const png = await page.locator('#poster').evaluate(canvas => canvas.toDataURL('image/png').split(',')[1]);
    const bytes = Buffer.from(png, 'base64'); assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), 1440);
    if (format === 'static') await writeFile(resolve(output, `landmarks-${group}-${theme}.png`), bytes);
    passes.push(`${format} / ${theme} / ${group}：独立插画加载、卡片与Canvas一致、PNG尺寸正确`);
    await context.close();
  }
  // A contact sheet made from the shipped images supports visual review of all 42 local assets.
  const page = await browser.newPage({ viewport: { width: 1540, height: 820 }, deviceScaleFactor: 1 });
  for (const theme of ['watercolor', 'pencil', 'retro']) {
    const images = await Promise.all(LANDMARKS.map(async item => ({ name: item.name, data: (await readFile(resolve(root, 'assets', landmarkFilename({ place: item.name, city: item.city }, theme)))).toString('base64') })));
    await page.setContent(`<html lang="zh-CN"><style>body{margin:0;padding:25px;background:#fffdf6;color:#3c594c;font:16px 'Microsoft YaHei',sans-serif}h1{font-size:23px;margin:0 0 18px}main{display:grid;grid-template-columns:repeat(7,1fr);gap:16px}figure{margin:0;text-align:center}img{width:100%;height:265px;object-fit:contain}figcaption{font-size:15px}</style><h1>收藏成形 · ${theme} · 14个地点独立插画</h1><main>${images.map(item => `<figure><img src="data:image/webp;base64,${item.data}"><figcaption>${item.name}</figcaption></figure>`).join('')}</main></html>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: resolve(output, `landmark-gallery-${theme}.png`), fullPage: true });
  }
  assert.deepEqual(failures, []);
} finally {
  await writeFile(resolve(output, 'landmark-report.json'), JSON.stringify({ passes, failures }, null, 2));
  await browser.close();
}
console.log(`${passes.length}组景点插画浏览器检查通过，无外部请求。`);
