import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { sampleProject, makeStop } from '../public/js/model.js';

// Files are fulfilled directly inside the test browser. No HTTP listener or local server is started.
const root = resolve('dist'), output = resolve('test-results'), deliverables = resolve('deliverables');
await mkdir(output, { recursive: true }); await mkdir(deliverables, { recursive: true });
const origin = 'http://shoucang.test'; const key = 'shoucang-chengxing.project.v1';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const failures = [], requests = [], passes = [];
async function context(options = {}, preload = null, { failAssets = false, failStorage = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1, acceptDownloads: true, ...options });
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url()); requests.push(url.href);
    if (url.origin !== origin) { failures.push(`外部请求:${url.href}`); return route.abort(); }
    if (failAssets && /(?:-atlas\.png|\/place-[^/]+\.webp)$/.test(url.pathname)) return route.abort();
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + sep)) return route.fulfill({ status: 403 });
    try { return route.fulfill({ body: await readFile(path), contentType: mime[extname(path)] ?? 'application/octet-stream' }); }
    catch { failures.push(`资源缺失:${path}`); return route.fulfill({ status: 404, body: 'Missing' }); }
  });
  if (preload) await ctx.addInitScript(({ key, project }) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, JSON.stringify(project)); sessionStorage.setItem('seeded', '1'); } }, { key, project: preload });
  if (failStorage) await ctx.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'QuotaExceededError'); }; });
  const page = await ctx.newPage(); page.on('pageerror', error => failures.push(error.message)); await page.goto(origin + '/#workbench'); await page.waitForFunction(() => !document.querySelector('#enlarge-poster').disabled);
  return { ctx, page };
}
async function ready(page) { await page.waitForFunction(() => !document.querySelector('#export-png').disabled); }
async function saved(page) { await page.waitForFunction(() => document.querySelector('#save-status').textContent === '已保存到此浏览器'); }
async function state(page) { await saved(page); return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key); }
async function canvasFile(page, filename) { const data = await page.locator('#poster').evaluate(canvas => canvas.toDataURL('image/png').split(',')[1]); await writeFile(filename, Buffer.from(data, 'base64')); }
try {
  const { ctx, page } = await context();
  assert.equal(await page.locator('#export-png').isDisabled(), true);
  await page.getByRole('button', { name: '体验杭州示例', exact: true }).click(); await ready(page); await saved(page);
  assert.equal(await page.locator('.inspiration-card').count(), 8); assert.equal((await state(page)).stops.length, 3); passes.push('首次引导、示例载入、完整本地素材加载');
  await page.screenshot({ path: resolve(deliverables, '01-收藏工作台.png'), fullPage: true });
  await page.locator('[data-action=source]').first().click(); assert.equal(await page.locator('#source-dialog').isVisible(), true); assert.match(await page.locator('#source-author').textContent(), /Joan/); await page.locator('[data-close=source-dialog]').click(); passes.push('真实截图来源可查看');
  await page.locator('#add-inspiration').click(); await page.locator('[name=place]').fill('测试茶馆'); await page.locator('[name=reason]').fill('<img src=x onerror=alert(1)>'); await page.locator('[name=sourceUrl]').fill('https://www.xiaohongshu.com/explore/example'); await page.getByRole('button', { name: '保存这份心动', exact: true }).click();
  assert.equal(await page.locator('.inspiration-card').count(), 9); assert.equal(await page.locator('.card-reason img').count(), 0);
  await page.getByRole('button', { name: '加入测试茶馆', exact: true }).click(); await ready(page); assert.equal((await state(page)).stops.length, 4); passes.push('手动新增、来源链接、纯文本防注入、加入行程');
  await page.locator('#tab-itinerary').click(); await page.getByRole('button', { name: '上移测试茶馆', exact: true }).click();
  let p = await state(page); assert.equal(p.inspirations.find(x => x.id === p.stops[2].inspirationId).place, '测试茶馆');
  await page.getByRole('textbox', { name: '测试茶馆路书备注', exact: true }).fill(''); await saved(page); p = await state(page); assert.equal(p.stops[2].note, '');
  await page.locator('#project-title').fill('给自己的一天'); await page.locator('#project-date').fill('2026-10-01'); await page.locator('#project-date').blur(); await saved(page); await page.reload(); await ready(page); await page.locator('#tab-itinerary').click(); assert.equal(await page.locator('#project-title').inputValue(), '给自己的一天'); assert.equal(await page.getByRole('textbox', { name: '测试茶馆路书备注', exact: true }).inputValue(), ''); passes.push('调序、备注清空、标题日期编辑、刷新恢复');
  await page.locator('#arrange').click(); await page.locator('#confirm-no').click(); assert.equal((await state(page)).stops.length, 4);
  await page.locator('#arrange').click(); await page.locator('#confirm-yes').click(); await ready(page); assert.equal((await state(page)).stops.length, 3); passes.push('偏好整理与替换确认');
  await page.locator('#load-demo').click(); await page.locator('#confirm-yes').click(); await ready(page); await saved(page);
  for (const theme of ['watercolor', 'pencil', 'retro']) { await page.locator(`[data-theme=${theme}]`).click(); await ready(page); await canvasFile(page, resolve(deliverables, `路书-${theme}.png`)); }
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-png').click(); const dl = await downloadPromise; await dl.saveAs(resolve(output, 'download.png'));
  const png = await readFile(resolve(output, 'download.png')); assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1440); assert.equal(await page.locator('#image-dialog').isVisible(), true); assert.match(await page.locator('#open-image').getAttribute('href'), /^blob:/); await page.locator('[data-close=image-dialog]').click(); passes.push('三种主题、1080×1440 PNG真实下载、保存后备选入口');
  await page.locator('[data-theme=watercolor]').click(); await page.locator('#tab-itinerary').click(); await ready(page); await page.screenshot({ path: resolve(deliverables, '02-行程编辑.png'), fullPage: true });
  await page.locator('.project-menu summary').click(); const jsonPromise = page.waitForEvent('download'); await page.locator('#export-json').click(); const jsonDl = await jsonPromise; await jsonDl.saveAs(resolve(output, 'backup.json')); const backup = JSON.parse(await readFile(resolve(output, 'backup.json'), 'utf8')); assert.equal(backup.stops.length, 3);
  const beforeBad = await page.evaluate(key => localStorage.getItem(key), key); await page.locator('#json-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') }); await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('有效的 JSON')); assert.equal(await page.evaluate(key => localStorage.getItem(key), key), beforeBad);
  backup.title = '备份恢复成功'; await page.locator('#json-file').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) }); await page.locator('#confirm-yes').click(); await ready(page); assert.equal((await state(page)).title, '备份恢复成功'); passes.push('项目备份下载、合法恢复、非法文件不覆盖');
  // Missing/duplicate references and seven mandatory stops are covered by model tests; verify the visible six-stop bound.
  await page.locator('#tab-collections').click(); for (const button of await page.locator('.add-stop[aria-pressed=false]').all()) { if ((await state(page)).stops.length === 6) break; await button.click(); await ready(page); }
  await page.locator('.add-stop[aria-pressed=false]').first().click(); assert.equal((await state(page)).stops.length, 6); passes.push('六站上限');
  await ctx.close();

  // Visual matrices cover every count and maximum text length for all themes.
  for (const theme of ['watercolor', 'pencil', 'retro']) {
    const p = sampleProject(); p.theme = theme;
    const { ctx: c, page: pg } = await context({}, p);
    for (let n = 1; n <= 6; n++) {
      const current = sampleProject(); current.theme = theme; current.title = '杭州的这一天把每一个喜欢的瞬间都认真收藏在心里呀'; current.title = current.title.slice(0, 24);
      current.inspirations.forEach((item, i) => { item.place = `${i + 1}这是一份需要完整显示的二十字旅行地点名称`.slice(0, 20); item.reason = '把想去的地方写进今天的计划慢慢散步认真看风景留下属于自己的美好旅行记忆和心动瞬间'.slice(0, 40); });
      current.stops = current.inspirations.slice(0, n).map(x => makeStop(x.id));
      await pg.evaluate(({ key, current }) => localStorage.setItem(key, JSON.stringify(current)), { key, current }); await pg.reload(); await ready(pg); await canvasFile(pg, resolve(output, `${theme}-${n}-max.png`));
    }
    await c.close();
  } passes.push('三种主题×1—6站、最长标题/地点/备注共18张视觉样本');

  const { ctx: mobile, page: mp } = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, sampleProject());
  assert.equal(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await mp.locator('[data-view=preview]').click(); await ready(mp); assert.equal(await mp.locator('.preview-pane').isVisible(), true); await mp.screenshot({ path: resolve(deliverables, '03-手机预览.png'), fullPage: true });
  await mp.locator('[data-theme=pencil]').click(); await ready(mp); const md = mp.waitForEvent('download'); await mp.locator('#export-png').click(); await (await md).saveAs(resolve(output, 'mobile.png')); await mp.locator('[data-close=image-dialog]').click(); await mp.locator('[data-view=edit]').click(); assert.equal(await mp.locator('.editor-pane').isVisible(), true); await mobile.close(); passes.push('390px手机布局、编辑预览切换、图片导出');
  const { ctx: fallback, page: fp } = await context({}, sampleProject(), { failAssets: true }); await ready(fp); assert.match(await fp.locator('#stage-caption').textContent(), /通用图形/); await fallback.close(); passes.push('插画加载失败可继续渲染和导出');
  const { ctx: denied, page: dp } = await context({}, null, { failStorage: true }); await dp.locator('#welcome-demo').click(); await ready(dp); await dp.waitForFunction(() => document.querySelector('#save-status').textContent.includes('保存失败')); assert.equal(await dp.locator('.inspiration-card').count(), 8); await denied.close(); passes.push('存储不可用时仍可编辑并提示备份');
  assert.deepEqual(failures, []);
  const report = { checkedAt: new Date().toISOString(), browser: 'Microsoft Edge headless', method: 'Playwright route.fulfill；未启动HTTP服务', passes, failures, externalRequests: requests.filter(url => !url.startsWith(origin)), note: '真实手机系统保存行为及REDCowork发布需在对应环境验收。' };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
