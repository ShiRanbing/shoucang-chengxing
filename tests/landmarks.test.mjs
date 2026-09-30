import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LANDMARKS, landmarkFor, landmarkFilename } from '../public/js/landmarks.js';
import { sampleProject, setTravelNote, blankProject } from '../public/js/model.js';
import { SHANGHAI_PLACES, TRAVEL_NOTES } from '../public/js/notes.js';

test('全部内置地点使用独立配图，旧示例与旅行收藏的地点映射一致', () => {
  const items = [...sampleProject().inspirations, ...SHANGHAI_PLACES];
  assert.equal(LANDMARKS.length, 14);
  assert.equal(new Set(items.map(item => landmarkFilename(item, 'watercolor'))).size, 14);
  for (const item of items) assert.ok(landmarkFor(item), item.place);
  let project = blankProject();
  for (const note of TRAVEL_NOTES) project = setTravelNote(project, note.id, true);
  assert.equal(project.inspirations.length, 14);
  for (const item of project.inspirations) assert.equal(landmarkFilename(item, 'pencil'), landmarkFilename(items.find(original => original.id === item.id.replace('community:', '')), 'pencil'));
});

test('手动输入的已知地点可匹配；改名、未知地点与同名跨城不错误复用', () => {
  assert.equal(landmarkFor({ place: ' 杭州 猫猫寺 MIAOSY ', city: '杭州' }).key, 'miaosy');
  assert.equal(landmarkFor({ place: '猫猫寺', city: '杭州' }).key, 'miaosy');
  assert.equal(landmarkFor({ place: '西湖景区' }).key, 'west-lake');
  assert.equal(landmarkFor({ place: '西湖', city: '上海' }), null);
  assert.equal(landmarkFor({ id: 'sample-4', place: '新的小山坡', city: '杭州' }), null);
  assert.equal(landmarkFor({ place: '西湖旁边的餐馆', city: '杭州' }), null);
  assert.equal(landmarkFilename({ place: '西湖' }, '../../secret'), null);
  assert.equal(landmarkFilename({ place: 'https://remote.example/picture.png' }, 'watercolor'), null);
});

test('三种风格的42张景点图全部随包提供，内容不重复', async () => {
  const hashes = new Set();
  for (const landmark of LANDMARKS) for (const theme of ['watercolor', 'pencil', 'retro']) {
    const file = landmarkFilename({ place: landmark.name, city: landmark.city }, theme);
    const bytes = await readFile(new URL(`../public/assets/${file}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', file);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', file);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, 42);
});
