import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Reproduce scrolling the exported image directly in the offline review copy.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], passes = [];
await mkdir('test-results', { recursive: true });
async function assertReachableClose(page, id) {
  const dialog = page.locator(`#${id}`);
  await dialog.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const result = await dialog.evaluate(element => {
    const button = element.querySelector('.dialog-top [data-close]');
    const box = button.getBoundingClientRect(), modal = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { scrolled: element.scrollTop > 0, visible: box.top >= Math.max(0, modal.top) && box.bottom <= Math.min(innerHeight, modal.bottom), clickable: button === hit || button.contains(hit) };
  });
  assert.equal(result.scrolled, true, `${id} should reproduce a long scrolled dialog`);
  assert.equal(result.visible, true, `${id} close button must remain inside the visible dialog`);
  assert.equal(result.clickable, true, `${id} close button must remain unobstructed`);
}
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 650 }]) {
    const mobile = viewport.width < 760;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
    await context.route(/^https?:/, route => { errors.push(`Unexpected network: ${route.request().url()}`); return route.abort(); });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(resolve('deliverables/收藏成形-双击预览.html')).href);
    await page.locator('#nav-workbench').click(); await page.locator('#welcome-demo').click();
    if (mobile) await page.locator('[data-view=preview]').click();
    await page.waitForFunction(() => !document.querySelector('#enlarge-poster').disabled);
    const openImage = async () => {
      await page.locator('#enlarge-poster').click();
      await page.waitForFunction(() => document.querySelector('#image-dialog').open && document.querySelector('#export-image').complete && document.querySelector('#export-image').naturalWidth > 0);
    };
    const outside = { x: 4, y: viewport.height / 2 };
    await openImage(); await assertReachableClose(page, 'image-dialog');
    await page.screenshot({ path: resolve(`test-results/dialog-scrolled-${mobile ? 'mobile' : 'desktop'}.png`) });
    await page.locator('[data-close=image-dialog]').click();
    await page.waitForFunction(() => !document.querySelector('#image-dialog').open && !document.querySelector('#export-image').hasAttribute('src'));
    await openImage(); await assertReachableClose(page, 'image-dialog');
    const box = await page.locator('#image-dialog').boundingBox();
    await page.mouse.click(box.x + 8, box.y + box.height / 2); // Inside dialog padding, not backdrop.
    assert.equal(await page.locator('#image-dialog').isVisible(), true);
    await page.locator('#export-image').click({ position: { x: 50, y: 220 } });
    assert.equal(await page.locator('#image-dialog').isVisible(), true);
    const image = await page.locator('#export-image').boundingBox();
    await page.mouse.move(image.x + 30, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(outside.x, outside.y); await page.mouse.up();
    assert.equal(await page.locator('#image-dialog').isVisible(), true, 'Dragging from content must not dismiss');
    await page.locator('#download-again').scrollIntoViewIfNeeded();
    const downloaded = page.waitForEvent('download'); await page.locator('#download-again').click();
    await downloaded; assert.equal(await page.locator('#image-dialog').isVisible(), true);
    if (mobile) await page.touchscreen.tap(outside.x, outside.y); else await page.mouse.click(outside.x, outside.y);
    await page.waitForFunction(() => !document.querySelector('#image-dialog').open && !document.querySelector('#export-image').hasAttribute('src'));
    assert.equal(await page.locator('#enlarge-poster').evaluate(element => document.activeElement === element), true);
    await openImage(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#image-dialog').isVisible(), false);
    if (mobile) await page.locator('[data-view=edit]').click();
    await page.locator('[data-action=source]').first().click();
    await page.locator('#source-images img').first().evaluate(image => image.decode());
    await assertReachableClose(page, 'source-dialog'); await page.mouse.click(outside.x, outside.y);
    assert.equal(await page.locator('#source-dialog').isVisible(), false);
    await page.setViewportSize({ width: viewport.width, height: 520 });
    await page.locator('#nav-discover').click(); await page.locator('[data-open-note=hill-afternoon]').click();
    await assertReachableClose(page, 'note-dialog'); await page.mouse.click(outside.x, outside.y);
    assert.equal(await page.locator('#note-dialog').isVisible(), false);
    passes.push(`${mobile ? '390px手机' : '桌面'}：长图、来源、笔记滚动后可关闭；点击/轻触灰色区域退出；内容、下载及从内向外拖动不会误关；Esc与焦点恢复正常`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  const report = { checkedAt: new Date().toISOString(), method: 'Edge file://，未启动服务', passes, errors };
  await writeFile('test-results/dialog-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
