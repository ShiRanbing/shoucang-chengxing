import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { sampleProject, makeStop } from '../public/js/model.js';

// Exercise the production renderer with browser-measured glyph bounds, not copies of its layout formulas.
const root = resolve('dist'), output = resolve('test-results'), origin = 'http://poster-layout.test';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], checks = [];
const mime = { '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp' };
const overlap = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { errors.push(`外部请求：${url.href}`); return route.abort(); }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html><meta charset="utf-8"><canvas width="1080" height="1440" id="poster"></canvas></html>' });
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep)) return route.fulfill({ status: 403 });
    try { return route.fulfill({ body: await readFile(path), contentType: mime[extname(path)] }); }
    catch { errors.push(`资源缺失：${path}`); return route.fulfill({ status: 404, body: 'Missing' }); }
  });
  await page.goto(origin);
  for (const theme of ['watercolor', 'pencil', 'retro']) for (let count = 1; count <= 6; count++) for (const variant of ['normal', 'long', 'mixed']) {
    const project = sampleProject(); project.theme = theme;
    if (variant !== 'normal') {
      project.title = '把每一个心动的地方都认真收藏在这次出发的旅途之中'.slice(0, 24);
      project.inspirations.forEach((item, index) => {
        if (variant === 'mixed' && index % 2 === 0) { item.reason = ''; return; }
        item.place = `${index + 1}这是一份需要完整显示的二十字旅行地点名称`.slice(0, 20);
        item.reason = '给自己一个不赶路的下午慢慢地看风景认真感受城市街角里的每一个细小而温柔的心动瞬间'.slice(0, 40);
      });
    }
    project.stops = project.inspirations.slice(0, count).map((item, i) => ({ ...makeStop(item.id), minutes: [45, 720, 0, 120, 5, 90][i] }));
    const result = await page.evaluate(async project => {
      const { renderPoster } = await import('/js/renderer.js'), { loadPosterAssets } = await import('/js/assets.js');
      const canvas = document.querySelector('#poster'), ctx = canvas.getContext('2d'), texts = [], images = [];
      const fillText = ctx.fillText.bind(ctx), drawImage = ctx.drawImage.bind(ctx);
      const bounds = (left, top, right, bottom) => {
        const matrix = ctx.getTransform();
        const points = [[left, top], [right, top], [left, bottom], [right, bottom]].map(([x, y]) => matrix.transformPoint({ x, y }));
        return { left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) };
      };
      ctx.fillText = (text, x, y, ...rest) => {
        const metric = ctx.measureText(text);
        texts.push({ text, ...bounds(x - metric.actualBoundingBoxLeft, y - metric.actualBoundingBoxAscent, x + metric.actualBoundingBoxRight, y + metric.actualBoundingBoxDescent) });
        return fillText(text, x, y, ...rest);
      };
      ctx.drawImage = (image, ...args) => {
        const [x, y, width, height] = args.slice(-4); images.push(bounds(x, y, x + width, y + height));
        return drawImage(image, ...args);
      };
      try {
        const before = JSON.stringify(project), assets = await loadPosterAssets(project);
        const description = renderPoster(canvas, project, assets);
        return { texts, images, unchanged: before === JSON.stringify(project), description, png: canvas.toDataURL('image/png').split(',')[1] };
      } finally { ctx.fillText = fillText; ctx.drawImage = drawImage; }
    }, project);
    const label = `${theme}-${count}-${variant}`;
    assert.equal(result.unchanged, true, label);
    assert.equal(result.images.length, count, label);
    const durations = result.texts.filter(item => /^(\d+ min|随心停留)$/.test(item.text));
    assert.equal(durations.length, count, `${label} 每站停留标签均应显示`);
    for (const text of result.texts) {
      assert.ok(text.left >= 26 && text.right <= 1054 && text.top >= 26 && text.bottom <= 1414, `${label} 文字越过纸张留白：${text.text}`);
      for (const image of result.images) assert.equal(overlap(text, image), false, `${label} 插画遮挡文字：${text.text}`);
    }
    for (let i = 0; i < result.texts.length; i++) for (let j = i + 1; j < result.texts.length; j++) {
      assert.equal(overlap(result.texts[i], result.texts[j]), false, `${label} 文字相交：${result.texts[i].text} / ${result.texts[j].text}`);
    }
    const bytes = Buffer.from(result.png, 'base64'); assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), 1440);
    await writeFile(resolve(output, `layout-${label}.png`), bytes);
    checks.push({ theme, count, variant, durations: durations.map(item => item.text) });
  }
  const example = sampleProject();
  example.stops = ['sample-1', 'sample-2', 'sample-4'].map(id => makeStop(id));
  const examplePng = await page.evaluate(async project => {
    const { renderPoster } = await import('/js/renderer.js'), { loadPosterAssets } = await import('/js/assets.js');
    const canvas = document.querySelector('#poster'); renderPoster(canvas, project, await loadPosterAssets(project));
    return canvas.toDataURL('image/png').split(',')[1];
  }, example);
  await writeFile(resolve('deliverables/路书-布局优化示例.png'), Buffer.from(examplePng, 'base64'));
  // Review sheets use screenshots of actual output files; no image content is edited.
  await page.setViewportSize({ width: 1620, height: 830 });
  for (const theme of ['watercolor', 'pencil', 'retro']) for (const variant of ['normal', 'long']) {
    const examples = await Promise.all(Array.from({ length: 6 }, (_, i) => readFile(resolve(output, `layout-${theme}-${i + 1}-${variant}.png`))));
    await page.setContent(`<html lang="zh-CN"><style>body{margin:0;padding:20px;background:#e6e5db;color:#355949;font:18px sans-serif}h1{font-size:21px}main{display:flex;gap:10px}figure{margin:0;width:250px}img{width:250px;display:block}figcaption{text-align:center;padding:10px}</style><h1>${theme} · ${variant} · 1—6站布局</h1><main>${examples.map((file, i) => `<figure><img src="data:image/png;base64,${file.toString('base64')}"><figcaption>${i + 1}站</figcaption></figure>`).join('')}</main></html>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: resolve(output, `layout-overview-${theme}-${variant}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(resolve(output, 'poster-layout-report.json'), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
console.log(`${checks.length}组路书布局检查通过：文字/插画互不相交、0—720分钟标签完整、尺寸正确。`);
