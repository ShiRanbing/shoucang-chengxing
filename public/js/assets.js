import { landmarkFilename } from './landmarks.js';
export const CATEGORY_ORDER = ['nature', 'street', 'culture', 'food', 'coffee', 'other'];
const cache = new Map();
export function assetUrl(filename) { return new URL(`../assets/${filename}`, import.meta.url).href; }
export function atlasFilename(theme, city = '杭州') { return `${city === '上海' ? 'shanghai-' : ''}${theme}-atlas.png`; }
export async function loadAtlas(theme, city = '杭州') {
  return loadImage(atlasFilename(theme, city));
}
function loadImage(key) {
  if (cache.has(key)) return cache.get(key);
  const promise = new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 12000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = assetUrl(key);
  });
  cache.set(key, promise);
  return promise;
}
export async function loadPosterAssets(project) {
  const items = project.stops.map(stop => project.inspirations.find(item => item.id === stop.inspirationId)).filter(Boolean);
  const filenames = [...new Set(items.map(item => landmarkFilename(item, project.theme)).filter(Boolean))];
  const [atlas, ...images] = await Promise.all([loadAtlas(project.theme, project.city), ...filenames.map(loadImage)]);
  const illustrations = new Map(filenames.map((filename, index) => [filename, images[index]]));
  const missing = filenames.filter(filename => !illustrations.get(filename));
  const needsAtlas = !items.length || items.some(item => !landmarkFilename(item, project.theme)) || missing.length > 0;
  return { atlas, illustrations, theme: project.theme, hasFallback: missing.length > 0 || (needsAtlas && !atlas) };
}
export function paintPlaceAsset(ctx, assets, item, x, y, size) {
  const image = assets.illustrations.get(landmarkFilename(item, assets.theme));
  if (!image) { paintAsset(ctx, assets.atlas, item.category, x, y, size); return; }
  // Keep the full landmark silhouette. The same source file is used in the inspiration card.
  const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  ctx.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
}
export function paintAsset(ctx, atlas, category, x, y, size) {
  if (!atlas) {
    ctx.save(); ctx.strokeStyle = '#a0ac91'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x + size * .22, y + size * .2, size * .56, size * .6, 20); ctx.stroke();
    ctx.font = `${size * .13}px serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#819175'; ctx.fillText('✧', x + size / 2, y + size * .54); ctx.restore();
    return;
  }
  const index = Math.max(0, CATEGORY_ORDER.indexOf(category));
  const sw = atlas.naturalWidth / 2, sh = atlas.naturalHeight / 3;
  ctx.save();
  // Multiply integrates the pencil atlas's paper into the poster without modifying the source art.
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(atlas, index % 2 * sw, Math.floor(index / 2) * sh, sw, sh, x, y, size, size);
  ctx.restore();
}
