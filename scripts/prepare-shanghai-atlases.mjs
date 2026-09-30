import { readFile, copyFile } from 'node:fs/promises';
const inputs = JSON.parse(await readFile('scripts/shanghai-atlas-inputs.local.json', 'utf8'));
for (const { theme, sourcePath } of inputs) {
  if (!['watercolor', 'pencil', 'retro'].includes(theme)) throw new Error('Unknown theme');
  await copyFile(sourcePath, `public/assets/shanghai-${theme}-atlas.png`);
  console.log(`Copied Shanghai ${theme} atlas`);
}
