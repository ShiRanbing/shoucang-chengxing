import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';

// Exercise the actual ZIP extraction. Local request fulfillment uses no server.
const root = resolve('test-results/scx-under-10mb-extracted');
const origin = 'http://arrangement-check.test', errors = [], passes = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const projectKey = 'shoucang-chengxing.project.v1';
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const mobile = viewport.width < 760;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
    await context.route(/^https?:/, async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { errors.push(`外部请求：${url.href}`); return route.abort(); }
      const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(root + sep)) return route.abort();
      try { return route.fulfill({ body: await readFile(path), contentType: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[extname(path)] }); }
      catch { errors.push(`文件缺失：${path}`); return route.fulfill({ status: 404 }); }
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    assert.equal(await page.locator('meta[name=scx-release]').getAttribute('content'), 'SCX-FULL-20260930-ZIP10M-02');
    await page.locator('#nav-workbench').click(); await page.locator('#welcome-demo').click();
    const result = page.locator('#arrangement-result');
    assert.equal(await result.isVisible(), false, '手工或示例行程不冒称刚刚按偏好整理');
    await page.locator('[data-action=must][data-id=sample-3]').click();
    await page.locator('[data-action=interest][data-id=nature]').click();
    async function arrange() {
      await page.locator('#arrange').click(); await page.locator('#confirm-yes').click();
      await page.waitForFunction(() => !document.querySelector('#arrangement-result').hidden);
    }
    await arrange();
    const summary = await page.locator('#arrangement-summary').textContent();
    assert.equal(summary, '保留了你标记的 2 个必去地点，根据茶咖偏好补入 1 站。');
    assert.equal(await page.locator('.stop-card').count(), 3);
    assert.equal(await page.locator('#arrangement-count').textContent(), '3 站心动');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const bounds = await result.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
    await page.screenshot({ path: `test-results/arrangement-${mobile ? 'mobile' : 'desktop'}.png` });
    await page.locator('[data-stop-note]').first().fill('今天多留一点时间给自己');
    await page.locator('[data-stop-minutes]').first().fill('80');
    await page.locator('[data-stop-minutes]').first().press('Tab');
    await page.locator('[data-action=down]').first().click();
    assert.equal(await page.locator('#arrangement-summary').textContent(), summary, '改备注、时长和顺序保留选点解释');
    if (mobile) await page.locator('[data-view=preview]').click();
    await page.locator('[data-theme=pencil]').click();
    await page.waitForFunction(() => !document.querySelector('#export-png').disabled);
    const pending = page.waitForEvent('download'); await page.locator('#export-png').click();
    const path = resolve(`test-results/arrangement-${mobile ? 'mobile' : 'desktop'}-export.png`);
    await (await pending).saveAs(path);
    const png = await readFile(path); assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1440);
    await page.locator('[data-close=image-dialog]').click();
    if (mobile) await page.locator('[data-view=edit]').click();
    assert.equal(await page.locator('#arrangement-summary').textContent(), summary, '风格切换与导出不改变解释');
    await page.locator('#arrange').click(); await page.locator('#confirm-no').click();
    assert.equal(await page.locator('#arrangement-summary').textContent(), summary, '取消重新整理保留原说明');
    await page.locator('[data-action=remove-stop]').first().click();
    assert.equal(await result.isVisible(), false, '增删站点立即清除旧解释');
    await arrange();
    await page.locator('[data-action=interest][data-id=coffee]').click();
    assert.equal(await result.isVisible(), false, '偏好变化后不展示旧结果');
    await arrange();
    assert.match(await page.locator('#arrangement-detail').textContent(), /未选择兴趣标签/);
    assert.doesNotMatch(await page.locator('#arrangement-summary').textContent(), /偏好补入/);
    await page.locator('#tab-collections').click();
    await page.locator('[data-action=must][data-id=sample-3]').click();
    await page.locator('#tab-itinerary').click();
    assert.equal(await result.isVisible(), false, '必去标记变化清除旧说明');
    await arrange();
    await page.locator('[data-pace=compact]').click();
    assert.equal(await result.isVisible(), false, '节奏变化清除旧说明');
    await arrange();
    assert.equal(await page.locator('#arrangement-count').textContent(), '5 站心动');
    await page.locator('[data-action=city][data-id=上海]').click();
    assert.equal(await result.isVisible(), false, '切城不沿用另一城的说明');
    await page.locator('[data-action=city][data-id=杭州]').click();
    await arrange();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent === '已保存到此浏览器');
    const saved = await page.evaluate(key => localStorage.getItem(key), projectKey);
    await page.reload();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), projectKey), saved);
    await page.locator('#tab-itinerary').click();
    assert.equal(await result.isVisible(), false, '恢复草稿不把既有行程冒称本次整理结果');
    passes.push(`${mobile ? '手机' : '桌面'}：实际整理解释、编辑/风格保持、取消保护、增删/偏好/必去/节奏/城市失效处理、刷新草稿与PNG导出通过`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile('test-results/arrangement-report.json', JSON.stringify({ passes, errors }, null, 2));
  console.log(JSON.stringify({ passes, errors }, null, 2));
} finally { await browser.close(); }
