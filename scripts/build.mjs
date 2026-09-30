import { cp, mkdir, readdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sampleProject } from '../public/js/model.js';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await mkdir('deliverables', { recursive: true });
await writeFile('deliverables/杭州示例项目.json', JSON.stringify(sampleProject(), null, 2));
// A self-contained review copy can be opened directly without starting a local server.
// Production remains the modular static bundle above.
const assetData = {};
for (const file of await readdir('public/assets')) {
  if (!/\.(png|jpg|webp)$/.test(file)) continue;
  const mime = file.endsWith('.jpg') ? 'jpeg' : file.split('.').at(-1);
  assetData[file] = `data:image/${mime};base64,${(await readFile(`public/assets/${file}`)).toString('base64')}`;
}
let js = `const LOCAL_ASSETS = ${JSON.stringify(assetData)};\n`;
for (const file of ['sources', 'notes', 'model', 'landmarks', 'assets', 'renderer', 'icons', 'community', 'guide', 'app']) {
  let content = await readFile(`public/js/${file}.js`, 'utf8');
  content = content.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  if (file === 'assets') content = content.replace('return new URL(`../assets/${filename}`, import.meta.url).href;', 'return LOCAL_ASSETS[filename];');
  js += content + '\n';
}
const css = await readFile('public/styles.css', 'utf8');
let html = await readFile('public/index.html', 'utf8');
// The self-contained copy works with file:// and must not show the deployment-entry guard.
html = html.replace(/\s*<!-- LOCAL_ENTRY_(GUARD|GUIDE)_START -->[\s\S]*?<!-- LOCAL_ENTRY_\1_END -->/g, '');
html = html.replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${css}</style>`).replace('<script type="module" src="./js/app.js"></script>', () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
await writeFile('deliverables/收藏成形-双击预览.html', html);
const files = await readdir('dist', { recursive: true });
console.log(`已构建 ${files.length} 个目录/文件：${resolve('dist')}`);
