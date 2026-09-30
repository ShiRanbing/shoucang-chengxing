import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Use file:// or locally fulfilled requests to an extracted static build.
// Neither mode starts a listener or connects to external services.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const staticRoot = process.env.SCX_PREVIEW_ROOT && resolve(process.env.SCX_PREVIEW_ROOT);
const url = staticRoot ? 'http://guide-check.test/' : pathToFileURL(resolve(process.env.SCX_PREVIEW_FILE ?? 'deliverables/收藏成形-双击预览.html')).href;
const projectKey = 'shoucang-chengxing.project.v1', errors = [], passes = [];
async function configureNetwork(context) {
  await context.route(/^https?:/, async route => {
    const requestUrl = new URL(route.request().url());
    if (!staticRoot || requestUrl.origin !== 'http://guide-check.test') {
      errors.push(`外部请求：${requestUrl.href}`); return route.abort();
    }
    const path = resolve(staticRoot, '.' + decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname));
    if (!path.startsWith(staticRoot + sep)) return route.abort();
    try {
      return route.fulfill({ body: await readFile(path), contentType: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[extname(path)] });
    } catch { errors.push(`文件缺失：${path}`); return route.fulfill({ status: 404 }); }
  });
}
await mkdir('test-results', { recursive: true });
const saved = page => page.waitForFunction(() => document.querySelector('#save-status').textContent === '已保存到此浏览器');
const readProject = page => page.evaluate(key => localStorage.getItem(key), projectKey);
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const mobile = viewport.width < 760, label = mobile ? '手机' : '桌面';
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
    await configureNetwork(context);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    assert.equal(await page.locator('#welcome-guide').isVisible(), true);
    assert.equal(await page.locator('dialog[open]').count(), 0, '首访不弹出阻断对话框');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.community-card').count(), 22);
    await page.screenshot({ path: resolve(`test-results/guide-welcome-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    const untouched = await readProject(page);
    await page.locator('#open-guide').click();
    assert.equal(await page.locator('#guide-dialog').isVisible(), true);
    await page.locator('#guide-title').click();
    assert.equal(await page.locator('#guide-dialog').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#guide-dialog').isVisible(), false);
    assert.equal(await page.locator('#open-guide').evaluate(button => document.activeElement === button), true);
    await page.locator('#open-guide').click();
    await page.screenshot({ path: resolve(`test-results/guide-dialog-${mobile ? 'mobile' : 'desktop'}.png`) });
    await page.locator('#guide-dialog').evaluate(dialog => { dialog.scrollTop = dialog.scrollHeight; });
    const close = await page.locator('[data-close=guide-dialog][aria-label]').evaluate(button => {
      const box = button.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight && document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button;
    });
    assert.equal(close, true, '长导览滚动后关闭按钮可命中');
    if (mobile) await page.touchscreen.tap(2, viewport.height / 2); else await page.mouse.click(2, viewport.height / 2);
    assert.equal(await page.locator('#guide-dialog').isVisible(), false);
    assert.equal(await readProject(page), untouched);
    await page.locator('#welcome-guide [data-guide-city=上海]').click();
    assert.equal(await page.locator('#note-search').inputValue(), '上海');
    assert.equal(await page.locator('.community-card').count(), 6);
    assert.equal(await page.locator('#welcome-guide').isVisible(), false);
    assert.equal(await readProject(page), untouched, '开始引导只搜索，不创建或替换行程');
    await page.reload(); assert.equal(await page.locator('#welcome-guide').isVisible(), false);
    await page.locator('[data-search-city=上海]').click();
    await page.locator('#notes-grid [data-travel-note]').first().click(); await saved(page);
    await page.locator('#enter-trip').click(); await saved(page);
    assert.equal(await page.locator('#guide-stage').textContent(), '03');
    await page.screenshot({ path: resolve(`test-results/guide-workbench-${mobile ? 'mobile' : 'desktop'}.png`) });
    await page.locator('#guide-next-action').click(); await saved(page);
    assert.equal(await page.locator('#guide-stage').textContent(), '04');
    assert.ok(JSON.parse(await readProject(page)).stops.length > 0);
    await page.locator('#guide-next-action').click();
    assert.equal(await page.locator('.preview-pane').isVisible(), true);
    await page.waitForFunction(() => !document.querySelector('#export-png').disabled);
    const download = page.waitForEvent('download'); await page.locator('#export-png').click();
    const path = resolve(`test-results/guide-export-${mobile ? 'mobile' : 'desktop'}.png`);
    await (await download).saveAs(path);
    const bytes = await readFile(path); assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), 1440);
    await page.locator('[data-close=image-dialog]').click();
    const draft = await readProject(page);
    await page.locator('#open-guide').click();
    await page.locator('#guide-dialog [data-guide-city=杭州]').click();
    assert.equal(await page.locator('#note-search').inputValue(), '杭州');
    assert.equal(await readProject(page), draft, '重看导览、换城市搜索不改变旧草稿');
    await page.locator('#nav-workbench').click();
    if (mobile) await page.locator('[data-view=edit]').click();
    await page.locator('#dismiss-workbench-guide').click();
    await page.reload(); assert.equal(await page.locator('#workbench-guide').isVisible(), false);
    assert.equal(await readProject(page), draft);
    await page.locator('#open-guide').click(); assert.equal(await page.locator('#guide-dialog').isVisible(), true);
    passes.push(`${label}：首访非阻断、四步导览、Esc/遮罩/滚动关闭、焦点恢复、城市入口、关闭记忆、动态提示、收藏到PNG下载、旧草稿保护`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await configureNetwork(context);
  await context.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'QuotaExceededError'); }; });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(url); await page.locator('#dismiss-welcome-guide').click();
  assert.equal(await page.locator('#welcome-guide').isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#open-guide').click(); await page.locator('#guide-dialog [data-guide-city=杭州]').click();
  assert.equal(await page.locator('.community-card').count(), 10);
  assert.equal(await readProject(page), null);
  passes.push('360px窄屏无横向溢出；存储不可用仍能关闭、重看、使用城市入口');
  await context.close();
  assert.deepEqual(errors, []);
  await writeFile(resolve(`test-results/${staticRoot ? 'small-release-guide' : 'guide'}-report.json`), JSON.stringify({ checkedAt: new Date().toISOString(), method: staticRoot ? 'Edge 实际解压文件、本地请求拦截，未启动服务' : 'Edge file://，未启动服务', passes, errors }, null, 2));
  console.log(JSON.stringify({ passes, errors }, null, 2));
} finally { await browser.close(); }
