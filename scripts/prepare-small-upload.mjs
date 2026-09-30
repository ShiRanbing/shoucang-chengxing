import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, extname } from 'node:path';
import assert from 'node:assert/strict';

// Reuse the validated compact images without another lossy encode. Restore
// binary assets so neither the ZIP nor its extracted site needs base64 overhead.
const source = resolve('dist'), target = resolve('dist-small');
const html = await readFile('deliverables/scx-release.html', 'utf8');
const block = html.match(/<script id="scx-local-assets" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
assert.ok(block, '缺少已验证的内嵌素材');
const images = JSON.parse(block[1]), names = Object.keys(images), aliases = {}, records = [];
assert.equal(names.length, 74);
assert.deepEqual(names.sort(), (await readdir(resolve(source, 'assets'))).sort());
await mkdir(resolve(target, 'assets'), { recursive: true });
for (const [name, uri] of Object.entries(images)) {
  assert.equal(name.includes('/'), false); assert.equal(name.includes('\\'), false);
  const match = uri.match(/^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  assert.ok(match, `无效素材 ${name}`);
  const extension = { webp: '.webp', jpeg: '.jpg', png: '.png' }[match[1]];
  const filename = name.slice(0, -extname(name).length) + extension;
  const bytes = Buffer.from(match[2], 'base64');
  if (name !== filename) aliases[name] = filename;
  await writeFile(resolve(target, 'assets', filename), bytes);
  records.push({ logicalName: name, filename, bytes: bytes.length });
}
const release = 'SCX-FULL-20260930-ZIP10M-02';
for (const entry of await readdir(source, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const path = resolve(entry.parentPath ?? entry.path, entry.name);
  const rel = relative(source, path).replaceAll('\\', '/');
  if (rel.startsWith('assets/')) continue;
  let bytes = await readFile(path);
  if (rel === 'js/assets.js') {
    let code = bytes.toString('utf8');
    const lookup = 'return new URL(`../assets/${filename}`, import.meta.url).href;';
    assert.ok(code.includes(lookup));
    code = `// 压缩发布包使用真实图片扩展名，保留项目数据中的素材键。\nconst UPLOAD_ASSET_ALIASES = ${JSON.stringify(aliases)};\n` + code.replace(lookup, 'return new URL(`../assets/${UPLOAD_ASSET_ALIASES[filename] ?? filename}`, import.meta.url).href;');
    bytes = Buffer.from(code);
  } else if (rel === 'index.html') {
    const code = bytes.toString('utf8');
    assert.ok(code.includes('<head>'));
    bytes = Buffer.from(code.replace('<head>', `<head>\n<!-- 收藏成形完整正式版 ${release}：22篇笔记、两城、42幅景点插画、三种风格。 -->\n<meta name="scx-release" content="${release}">`));
  }
  const output = resolve(target, rel);
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes);
}
assert.equal(new Set(records.map(record => record.filename)).size, 74);
await writeFile('deliverables/small-upload-assets.json', JSON.stringify({ release, assetCount: records.length, aliases, records }, null, 2));
console.log(JSON.stringify({ release, assets: records.length, assetBytes: records.reduce((sum, item) => sum + item.bytes, 0), directory: target }));
