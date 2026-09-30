import { paintAsset, paintPlaceAsset } from './assets.js';
import { stopNote } from './model.js';
export const PALETTES = {
  watercolor: { paper: '#fffdf6', ink: '#3c594c', secondary: '#848b73', accent: '#b97959', line: '#c2c9ab', tint: '#e8ecdf', ticket: '#f5eddf', label: '把收藏，写成这一天', font: '"STKaiti", "KaiTi", "Kaiti SC", serif' },
  pencil: { paper: '#fffdf8', ink: '#48617a', secondary: '#7f876c', accent: '#ce795c', line: '#b4c29c', tint: '#edf0dc', ticket: '#f9e9d6', label: '今天，沿着喜欢出发', font: '"STKaiti", "KaiTi", "Kaiti SC", serif' },
  retro: { paper: '#f6eacf', ink: '#254846', secondary: '#807557', accent: '#aa542f', line: '#b9a579', tint: '#e7d6a9', ticket: '#e9d6aa', label: '一日漫游 · 旅行典藏', font: '"SimSun", "Songti SC", serif' },
};
export function wrapText(ctx, text, width) {
  const lines = []; let line = '';
  // Compact accidental whitespace from pasted notes so imported line breaks cannot overflow a cell.
  for (const char of String(text).replace(/\s+/gu, ' ').trim()) { const next = line + char; if (line && ctx.measureText(next).width > width) { lines.push(line); line = char; } else line = next; }
  if (line) lines.push(line); return lines;
}
function line(ctx, x1, y1, x2, y2, color, dash = []) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore(); }
function sparkle(ctx, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(0, -size); ctx.quadraticCurveTo(1, -1, size * .65, 0); ctx.quadraticCurveTo(1, 1, 0, size); ctx.quadraticCurveTo(-1, 1, -size * .65, 0); ctx.quadraticCurveTo(-1, -1, 0, -size); ctx.closePath(); ctx.stroke(); ctx.restore();
}
function sprig(ctx, x, y, scale, palette) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.strokeStyle = palette.ink; ctx.fillStyle = palette.line; ctx.lineWidth = 1.3; ctx.globalAlpha = .6;
  ctx.beginPath(); ctx.moveTo(-25, 20); ctx.quadraticCurveTo(4, 0, 27, -23); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const px = -17 + i * 11, py = 14 - i * 9, side = i % 2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px - 13, py + side * 19, px + 6, py + side * 20); ctx.quadraticCurveTo(px + 10, py + side * 6, px, py); ctx.fill();
  }
  ctx.restore();
}
function paperFrame(ctx, palette, theme) {
  const retro = theme === 'retro'; ctx.save();
  ctx.strokeStyle = retro ? palette.ink : palette.line; ctx.lineWidth = retro ? 4 : 1; ctx.globalAlpha = retro ? 1 : .65;
  if (theme === 'pencil') ctx.setLineDash([4, 7]);
  ctx.strokeRect(26, 26, 1028, 1388);
  ctx.setLineDash([]);
  if (retro) { ctx.lineWidth = 1; ctx.strokeRect(35, 35, 1010, 1370); }
  // Corner details stay inside the paper margin and outside every text block.
  ctx.globalAlpha = .8; ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.5;
  for (const [x, y, sx, sy] of [[43, 43, 1, 1], [1037, 43, -1, 1], [43, 1397, 1, -1], [1037, 1397, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * 21); ctx.lineTo(x, y); ctx.lineTo(x + sx * 21, y); ctx.stroke();
  }
  ctx.restore();
  if (theme === 'watercolor') sprig(ctx, 112, 85, .85, palette);
  if (theme === 'pencil') { sparkle(ctx, 104, 81, 16, palette.accent); sparkle(ctx, 129, 96, 7, palette.line); }
  if (retro) {
    ctx.save(); ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(114, 86, 22, Math.PI, 0); ctx.moveTo(82, 91); ctx.lineTo(146, 91); ctx.moveTo(91, 98); ctx.lineTo(137, 98); ctx.stroke(); ctx.restore();
  }
}
function cityStamp(ctx, city, palette, retro) {
  ctx.save(); ctx.translate(955, 84); ctx.rotate(.09); ctx.strokeStyle = palette.accent; ctx.lineWidth = 1; ctx.fillStyle = palette.paper;
  ctx.beginPath(); ctx.roundRect(-44, -26, 88, 52, retro ? 0 : 4); ctx.fill(); ctx.stroke();
  ctx.setLineDash([2, 3]); ctx.strokeRect(-39, -21, 78, 42); ctx.setLineDash([]);
  ctx.fillStyle = palette.accent; ctx.font = `21px ${palette.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(city, 0, 0);
  ctx.restore();
}
function artBackdrop(ctx, station, palette, theme) {
  const { imageX: x, imageY: y, size } = station, cx = x + size / 2, cy = y + size / 2;
  ctx.save();
  if (theme === 'watercolor') {
    const wash = ctx.createRadialGradient(cx, cy, size * .1, cx, cy, size * .53);
    wash.addColorStop(0, palette.tint); wash.addColorStop(.7, palette.tint + '99'); wash.addColorStop(1, palette.tint + '00');
    ctx.fillStyle = wash; ctx.fillRect(x - 8, y - 8, size + 16, size + 16);
  } else if (theme === 'pencil') {
    ctx.globalAlpha = .65; ctx.fillStyle = palette.tint;
    ctx.beginPath(); ctx.ellipse(cx, cy + size * .06, size * .48, size * .43, -.08, 0, Math.PI * 2); ctx.fill(); ctx.clip();
    ctx.strokeStyle = palette.line; ctx.lineWidth = .8; ctx.globalAlpha = .3;
    for (let offset = -size; offset < size * 2; offset += 12) { ctx.beginPath(); ctx.moveTo(x + offset, y); ctx.lineTo(x + offset - size, y + size); ctx.stroke(); }
  } else {
    ctx.fillStyle = palette.tint; ctx.globalAlpha = .5;
    ctx.beginPath(); ctx.roundRect(x + size * .04, y + size * .04, size * .92, size * .92, [size * .46, size * .46, 2, 2]); ctx.fill();
    ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}
function numberBadge(ctx, n, x, y, palette, retro) {
  ctx.save(); ctx.fillStyle = retro ? palette.accent : palette.ticket; ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, 21, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = retro ? palette.paper : palette.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'italic 21px Georgia, serif'; ctx.fillText(String(n).padStart(2, '0'), x, y + 1); ctx.restore();
}
function durationLabel(stop) { return stop.minutes ? `${stop.minutes} min` : '随心停留'; }
function durationWidth(ctx, stop) {
  ctx.save(); ctx.font = '18px "Microsoft YaHei", sans-serif';
  const width = Math.ceil(ctx.measureText(durationLabel(stop)).width) + 46;
  ctx.restore(); return width;
}
function stationHeader(ctx, station, palette, retro) {
  const { badgeX, badgeY, pillWidth, stop, index } = station;
  numberBadge(ctx, index + 1, badgeX, badgeY, palette, retro);
  const x = badgeX + 36, y = badgeY - 17;
  ctx.save(); ctx.fillStyle = palette.paper; ctx.fillRect(x, y, pillWidth, 34);
  // A flat caption strip feels like printed stationery rather than a UI button.
  ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 2, y + 5); ctx.lineTo(x + 2, y + 29); ctx.stroke();
  ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x + 17, badgeY, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 17, badgeY - 3.5); ctx.lineTo(x + 17, badgeY); ctx.lineTo(x + 20, badgeY + 1.5); ctx.stroke();
  ctx.fillStyle = palette.accent; ctx.font = '18px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(durationLabel(stop), x + 30, badgeY + .5); ctx.restore();
}
function route(ctx, stations, palette) {
  ctx.save(); ctx.strokeStyle = palette.line; ctx.lineWidth = 1.7; ctx.setLineDash([3, 9]); ctx.lineCap = 'round';
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1], b = stations[i]; ctx.beginPath();
    if (a.row === b.row) {
      const forward = b.badgeX > a.badgeX;
      const start = forward ? a.badgeX + 36 + a.pillWidth + 14 : a.badgeX - 32;
      const end = forward ? b.badgeX - 32 : b.badgeX + 36 + b.pillWidth + 14;
      const bend = forward ? 55 : -55;
      ctx.moveTo(start, a.badgeY); ctx.bezierCurveTo(start + bend, a.badgeY - 20, end - bend, b.badgeY - 20, end, b.badgeY);
    } else {
      // Continue the snake along the outside margin, avoiding a branch at the previous badge.
      const right = a.badgeX > 540, gutter = right ? 1018 : 62;
      const start = right ? a.badgeX + 36 + a.pillWidth + 14 : a.badgeX - 31;
      const end = right ? b.badgeX + 36 + b.pillWidth + 14 : b.badgeX - 31;
      ctx.moveTo(start, a.badgeY);
      ctx.bezierCurveTo(gutter + (right ? -24 : 24), a.badgeY, gutter, a.badgeY + 8, gutter, a.badgeY + 38);
      ctx.lineTo(gutter, b.badgeY - 42);
      ctx.quadraticCurveTo(gutter, b.badgeY, end, b.badgeY);
    }
    ctx.stroke();
  }
  ctx.restore();
}
function measureCaption(ctx, item, stop, palette, width, nameSize, noteSize) {
  const nameFont = `bold ${nameSize}px ${palette.font}`, noteFont = `${noteSize}px "Microsoft YaHei", sans-serif`;
  ctx.font = nameFont; const nameLines = wrapText(ctx, item.place, width);
  ctx.font = noteFont; const noteLines = wrapText(ctx, stopNote(stop, item), width);
  const nameLine = nameSize + 8, noteLine = noteSize + 8;
  return { nameFont, noteFont, nameLines, noteLines, nameLine, noteLine, nameHeight: nameLines.length * nameLine, noteHeight: noteLines.length * noteLine };
}
function drawCaption(ctx, caption, x, top, palette, { align = 'center', gap = 10 } = {}) {
  ctx.save(); ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillStyle = palette.ink; ctx.font = caption.nameFont;
  caption.nameLines.forEach((text, i) => ctx.fillText(text, x, top + i * caption.nameLine));
  ctx.fillStyle = palette.secondary; ctx.font = caption.noteFont;
  caption.noteLines.forEach((text, i) => ctx.fillText(text, x, top + caption.nameHeight + gap + i * caption.noteLine));
  ctx.restore();
}
function layoutStations(ctx, records, palette, top) {
  const n = records.length, rows = n <= 2 ? n : Math.ceil(n / 2), rowGap = n >= 5 ? 24 : 32;
  const rowHeight = (1282 - top - rowGap * (rows - 1)) / rows;
  const stations = records.map(({ stop, item }, index) => {
    const row = n <= 2 ? index : Math.floor(index / 2), col = n <= 2 ? 0 : (row % 2 ? 1 - index % 2 : index % 2);
    const x = n <= 2 ? 84 : 84 + col * 500, y = top + row * (rowHeight + rowGap), width = n <= 2 ? 912 : 412;
    const compact = n >= 5, pillWidth = durationWidth(ctx, stop);
    const headerX = n <= 2 ? x + 24 : x + width / 2 - (57 + pillWidth) / 2 + 21;
    const station = { stop, item, index, row, col, x, y, width, rowHeight, pillWidth, badgeX: headerX, badgeY: y + 23 };
    if (n === 1) {
      const caption = measureCaption(ctx, item, stop, palette, 820, 42, 23);
      const size = Math.min(620, rowHeight - 64 - 22 - caption.nameHeight - 14 - caption.noteHeight - 18);
      return { ...station, badgeX: 540 - (57 + pillWidth) / 2 + 21, caption, imageX: 540 - size / 2, imageY: y + 64, size, textX: 540, textY: y + 64 + size + 22, noteGap: 14 };
    }
    if (n === 2) {
      const caption = measureCaption(ctx, item, stop, palette, 432, 34, 22), size = Math.min(350, rowHeight - 70);
      const copyHeight = caption.nameHeight + 14 + caption.noteHeight;
      return { ...station, badgeX: 110 + size / 2 - (57 + pillWidth) / 2 + 21, caption, imageX: 110, imageY: y + 56, size, textX: 518, textY: y + 56 + (size - copyHeight) / 2, align: 'left', noteGap: 14 };
    }
    const caption = measureCaption(ctx, item, stop, palette, 402, compact ? 25 : 32, compact ? 17 : 20);
    const nameGap = compact ? 8 : 14, noteGap = compact ? 8 : 10, headerHeight = compact ? 48 : 56;
    const size = Math.min(compact ? 168 : 290, rowHeight - headerHeight - nameGap - caption.nameHeight - noteGap - caption.noteHeight - 10);
    return { ...station, caption, imageX: x + (width - size) / 2, imageY: y + headerHeight, size, textX: x + width / 2, textY: y + headerHeight + size + nameGap, noteGap };
  });
  // Both columns in a row share an image size and name baseline, even with uneven copy.
  if (n >= 3) for (let row = 0; row < rows; row++) {
    const peers = stations.filter(station => station.row === row), size = Math.min(...peers.map(station => station.size));
    for (const station of peers) {
      station.size = size; station.imageX = station.x + (station.width - size) / 2;
      station.textY = station.imageY + size + (n >= 5 ? 8 : 14);
    }
  }
  return stations;
}
function personalNote(ctx, station, palette, theme) {
  const cx = station.col ? 290 : 790, cy = station.y + station.rowHeight * .53, retro = theme === 'retro';
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(retro ? -.025 : -.055);
  ctx.fillStyle = palette.paper; ctx.shadowColor = '#394d3912'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; ctx.fillRect(-162, -85, 324, 177);
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.strokeRect(-162, -85, 324, 177);
  // Translucent tape and ruled lines are drawn locally so exports stay self-contained.
  ctx.save(); ctx.translate(0, -87); ctx.rotate(.065); ctx.globalAlpha = .8; ctx.fillStyle = palette.tint; ctx.fillRect(-48, -11, 96, 23);
  if (theme === 'pencil') {
    ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.globalAlpha = .6;
    for (let x = -44; x <= 44; x += 8) { ctx.beginPath(); ctx.moveTo(x, -11); ctx.lineTo(x, 12); ctx.stroke(); }
    for (const y of [-5, 3, 11]) { ctx.beginPath(); ctx.moveTo(-48, y); ctx.lineTo(48, y); ctx.stroke(); }
  }
  ctx.restore();
  ctx.textAlign = 'center'; ctx.fillStyle = palette.accent; ctx.font = `16px ${palette.font}`; ctx.fillText('写给这一天', 0, -43);
  ctx.globalAlpha = .5; line(ctx, -123, 15, 123, 15, palette.line); line(ctx, -123, 55, 123, 55, palette.line); ctx.globalAlpha = 1;
  ctx.fillStyle = palette.ink; ctx.font = `27px ${palette.font}`; ctx.fillText('不必赶路，', 0, 5); ctx.fillText('喜欢就多停一会儿。', 0, 45);
  ctx.restore();
}
export function renderPoster(canvas, project, assets) {
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  const p = PALETTES[project.theme], retro = project.theme === 'retro';
  const records = project.stops.map(stop => ({ stop, item: project.inspirations.find(x => x.id === stop.inspirationId) })).filter(x => x.item);
  ctx.clearRect(0, 0, 1080, 1440); ctx.fillStyle = p.paper; ctx.fillRect(0, 0, 1080, 1440);
  ctx.save();
  // Deterministic fine paper grain: geometric decoration only, no remote textures.
  for (let i = 0; i < 3500; i++) { const x = (i * 239 + i * i * 13) % 1080, y = (i * 401 + i * i * 7) % 1440; ctx.fillStyle = `rgba(110,99,60,${.018 + (i % 4) * .006})`; ctx.fillRect(x, y, 1, 1); }
  ctx.restore();
  paperFrame(ctx, p, project.theme); cityStamp(ctx, project.city ?? '杭州', p, retro);
  ctx.textAlign = 'center'; ctx.fillStyle = p.secondary; ctx.font = '17px "Microsoft YaHei", sans-serif'; ctx.letterSpacing = '4px'; ctx.fillText(p.label, 540, 89); ctx.letterSpacing = '0px';
  ctx.fillStyle = p.ink; ctx.font = `${retro ? 'bold ' : ''}64px ${p.font}`;
  const title = project.title.trim() || '把心动写进下一程';
  const titleLines = wrapText(ctx, title, 860);
  titleLines.forEach((text, i) => ctx.fillText(text, 540, titleLines.length > 1 ? 165 + i * 76 : 185));
  const metaY = titleLines.length > 1 ? 290 : 252;
  ctx.font = '20px "Microsoft YaHei", sans-serif'; ctx.fillStyle = p.secondary;
  const meta = [project.city ?? '杭州', project.date ? project.date.replaceAll('-', ' / ') : '找一个喜欢的日子', records.length ? `${records.length} 站心动` : '等一个出发的理由', project.preferences.pace === 'slow' ? '慢慢逛' : '多看看'].join('   ·   ');
  ctx.fillText(meta, 540, metaY);
  line(ctx, 402, metaY + 32, 514, metaY + 32, p.line); line(ctx, 566, metaY + 32, 678, metaY + 32, p.line);
  sparkle(ctx, 540, metaY + 32, 8, p.accent);
  if (!records.length) {
    paintAsset(ctx, assets.atlas, 'nature', 210, 370, 660);
    ctx.fillStyle = p.ink; ctx.font = `38px ${p.font}`; ctx.fillText('想去的地方，会慢慢成为故事。', 540, 1110);
    ctx.fillStyle = p.secondary; ctx.font = '22px "Microsoft YaHei", sans-serif'; ctx.fillText('添加第一份灵感，开启你的手绘路书', 540, 1170);
  } else {
    const n = records.length, stations = layoutStations(ctx, records, p, metaY + 78);
    route(ctx, stations, p);
    for (const station of stations) {
      artBackdrop(ctx, station, p, project.theme);
      paintPlaceAsset(ctx, assets, station.item, station.imageX, station.imageY, station.size);
      drawCaption(ctx, station.caption, station.textX, station.textY, p, { align: station.align ?? 'center', gap: station.noteGap });
      stationHeader(ctx, station, p, retro);
    }
    if (n === 3 || n === 5) {
      personalNote(ctx, stations.at(-1), p, project.theme);
    }
  }
  ctx.textAlign = 'center'; line(ctx, 125, 1330, 478, 1330, p.line); line(ctx, 602, 1330, 955, 1330, p.line);
  ctx.fillStyle = p.accent; ctx.font = `16px ${p.font}`; ctx.fillText('今 日 珍 藏', 540, 1336);
  ctx.fillStyle = p.ink; ctx.font = `25px ${p.font}`; ctx.fillText('把那些「下次一定」，留给这次出发。', 540, 1371);
  ctx.fillStyle = p.secondary; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText(`${records.some(x => x.item.isExample) ? '含演示内容 · ' : ''}地点顺序示意  /  插画为风格化表达`, 540, 1400);
  return records.map(({ stop, item }, i) => `${i + 1}. ${item.place}，${stop.minutes ? `停留${stop.minutes}分钟` : '随心停留'}，${stopNote(stop, item)}`).join('；');
}
