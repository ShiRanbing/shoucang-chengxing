import { CATEGORIES, LIMITS, THEMES, CITIES, cityInspirations, switchCity, allStops, uid, blankProject, sampleProject, makeStop, arrangeProject, explainArrangement, validateProject, safeUrl, stopNote, setTravelNote, notesForPlace } from './model.js';
import { loadAtlas, loadPosterAssets, assetUrl, atlasFilename } from './assets.js';
import { landmarkFilename } from './landmarks.js';
import { renderPoster } from './renderer.js';
import { SOURCES } from './sources.js';
import { TRAVEL_NOTES } from './notes.js';
import { createCommunity } from './community.js';
import { icon } from './icons.js';
import { createGuide } from './guide.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'shoucang-chengxing.project.v1';
let project, tab = 'collections', saveTimer, toastTimer, renderVersion = 0, posterReady = false, imageUrl = null;
let storageWarning = '', arrangement = null, confirmation = null, guideUI;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  project = raw ? validateProject(JSON.parse(raw)) : blankProject();
  $('welcome-card').hidden = !!raw;
  if (raw) $('save-status').textContent = '已保存到此浏览器';
} catch { project = blankProject(); storageWarning = '上次草稿无法读取，原始存储尚未覆盖；可以导入项目备份。'; }

function node(tag, attrs = {}, ...children) {
  const result = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) { if (value !== undefined && value !== null) { if (key === 'class') result.className = value; else if (key === 'text') result.textContent = value; else if (key === 'disabled') result.disabled = value; else result.setAttribute(key, String(value)); } }
  for (const child of children) if (child !== undefined && child !== null) result.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return result;
}
function action(text, op, id, className = 'text-button', extra = {}) { return node('button', { type: 'button', class: className, 'data-action': op, 'data-id': id, ...extra }, text); }
function notify(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4300); }
function confirmAction(title, message, yes = '确认') {
  if (confirmation) return Promise.resolve(false);
  $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-yes').textContent = yes;
  $('confirm-dialog').showModal();
  return new Promise(resolve => { confirmation = resolve; $('confirm-no').focus(); });
}
function finishConfirm(value) { $('confirm-dialog').close(); const resolve = confirmation; confirmation = null; resolve?.(value); }
$('confirm-no').addEventListener('click', () => finishConfirm(false));
$('confirm-yes').addEventListener('click', () => finishConfirm(true));
$('confirm-dialog').addEventListener('cancel', event => { event.preventDefault(); finishConfirm(false); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
// Read-only overlays support light dismissal. Editing and confirmation dialogs
// keep their explicit actions so an outside tap cannot discard a form.
for (const dialog of document.querySelectorAll('#image-dialog, #source-dialog, #note-dialog, #about-dialog, #guide-dialog')) {
  let backdropPointer = null;
  const isBackdrop = event => {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  dialog.addEventListener('pointerdown', event => { backdropPointer = event.isPrimary && event.button === 0 && isBackdrop(event) ? event.pointerId : null; });
  dialog.addEventListener('pointercancel', () => { backdropPointer = null; });
  dialog.addEventListener('click', event => {
    const startedOutside = backdropPointer !== null && (event.pointerId === undefined || event.pointerId === backdropPointer);
    backdropPointer = null;
    if (startedOutside && isBackdrop(event)) dialog.close();
  });
  dialog.addEventListener('close', () => { backdropPointer = null; });
}

function saveNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); $('save-status').textContent = '已保存到此浏览器'; storageWarning = ''; }
  catch { $('save-status').textContent = '保存失败，请备份 JSON'; if (!storageWarning) notify('浏览器无法保存草稿，当前编辑仍保留，请在项目菜单备份 JSON。'); storageWarning = 'save'; }
}
function saveSoon() { $('save-status').textContent = '正在保存…'; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 500); }
function arrangementSignature() {
  // Reordering stops, changing the artwork or editing notes does not change
  // why these places were selected. Changing candidates or preferences does.
  return JSON.stringify([project.city, project.preferences.pace, [...project.preferences.interests].sort(), cityInspirations(project).map(item => [item.id, item.category, item.mustVisit]), project.stops.map(stop => stop.inspirationId).sort()]);
}
function changed(full = true) {
  if (arrangement && arrangement.signature !== arrangementSignature()) arrangement = null;
  $('welcome-card').hidden = true; saveSoon(); if (full) { renderEditor(); communityUI.render(); } renderPreview();
}
window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });

function setTab(next) {
  tab = next;
  for (const name of ['collections', 'itinerary']) { const active = name === next; $(`tab-${name}`).setAttribute('aria-selected', String(active)); $(`tab-${name}`).tabIndex = active ? 0 : -1; $(`${name}-panel`).hidden = !active; }
}
for (const name of ['collections', 'itinerary']) $(`tab-${name}`).addEventListener('click', () => setTab(name));
document.querySelector('.editor-tabs').addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'collections' : event.key === 'End' ? 'itinerary' : tab === 'collections' ? 'itinerary' : 'collections'; setTab(next); $(`tab-${next}`).focus(); } });

function inspirationCard(item) {
  const included = project.stops.some(stop => stop.inspirationId === item.id);
  const fallbackArt = () => {
    const fallback = node('div', { class: 'art-crop ' + item.category, 'aria-hidden': 'true' });
    fallback.style.backgroundImage = `url("${assetUrl(atlasFilename(project.theme, item.city))}")`;
    return fallback;
  };
  const filename = landmarkFilename(item, project.theme);
  const art = filename ? node('img', { class: 'place-art', src: assetUrl(filename), alt: `${item.place}手绘插画`, 'data-artwork': filename, decoding: 'async' }) : fallbackArt();
  if (filename) art.addEventListener('error', () => art.replaceWith(fallbackArt()), { once: true });
  const preview = node('div', { class: 'card-art' }, art, action(item.mustVisit ? '★ 必去' : '☆ 必去', 'must', item.id, 'must-button', { 'aria-pressed': item.mustVisit, 'aria-label': `${item.mustVisit ? '取消' : '标记'}${item.place}必去` }), node('span', { class: 'card-category' }, CATEGORIES[item.category]));
  const source = item.sourceUrl ? node('a', { class: 'source-button', href: item.sourceUrl, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `查看${item.place}的原笔记` }, '↗ 原笔记') : item.sourceRef ? action('查看来源', 'source', item.id, 'source-button') : node('span', { class: 'source-button' }, item.isExample ? '示例灵感' : '我的灵感');
  const related = notesForPlace(project, item.id);
  const origin = related.length ? node('div', { class: 'community-origin' }, node('span', {}, `来自 ${related.length} 篇旅行收藏`), ...related.map(note => action(note.title, 'community-note', note.id))) : null;
  return node('article', { class: `inspiration-card${included ? ' selected' : ''}`, 'data-inspiration-id': item.id }, preview,
    node('div', { class: 'card-body' },
      node('div', { class: 'card-title-row' }, node('h3', {}, item.place), action('✎', 'edit', item.id, 'text-button edit-card', { 'aria-label': `编辑${item.place}` })),
      node('p', { class: 'card-reason' }, item.reason || '还没有写下理由，等你添一句心动。'),
      origin,
      node('div', { class: 'card-bottom' }, source, action(included ? '✓ 已加入' : '＋ 加入行程', 'toggle-stop', item.id, 'add-stop', { 'aria-pressed': included, 'aria-label': `${included ? '移出' : '加入'}${item.place}` })),
    ));
}
function stopCard(stop, index) {
  const item = project.inspirations.find(x => x.id === stop.inspirationId);
  const duration = node('input', { type: 'number', value: stop.minutes || '', min: '0', max: '720', step: '1', placeholder: '留白', 'data-stop-minutes': stop.id, 'aria-label': `${item.place}停留分钟数` });
  const note = node('textarea', { rows: '2', maxlength: String(LIMITS.note), 'data-stop-note': stop.id, placeholder: '写下一句自己的期待', 'aria-label': `${item.place}路书备注` }); note.value = stopNote(stop, item);
  const source = item.sourceUrl ? node('a', { class: 'source-button', href: item.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, '↗ 查看原笔记') : item.sourceRef ? action('查看来源截图', 'source', item.id, 'source-button') : node('span', {}, item.isExample ? '来自示例灵感' : '来自我的灵感');
  return node('article', { class: 'stop-card', 'data-stop-id': stop.id },
    node('div', { class: 'stop-head' }, node('span', { class: 'stop-number' }, String(index + 1).padStart(2, '0')), node('h3', {}, item.place),
      node('div', { class: 'stop-controls' }, action('↑', 'up', stop.id, '', { 'aria-label': `上移${item.place}`, disabled: index === 0 }), action('↓', 'down', stop.id, '', { 'aria-label': `下移${item.place}`, disabled: index === project.stops.length - 1 }), action('×', 'remove-stop', stop.id, '', { 'aria-label': `移除${item.place}` }))),
    node('div', { class: 'stop-fields' }, node('label', {}, '停留 / 分钟', duration), node('label', {}, '写在路书上的话', node('span', { 'data-note-count': stop.id }, `${note.value.length}/40`), note)),
    node('div', { class: 'stop-source' }, source, action('编辑收藏', 'edit', item.id), action('使用心动理由', 'reset-note', stop.id)));
}
function renderEditor() {
  const candidates = cityInspirations(project);
  $('collection-count').textContent = candidates.length; $('stop-count').textContent = project.stops.length;
  $('city-switch').replaceChildren(...CITIES.map(city => action(`${city} · ${project.inspirations.filter(item => item.city === city).length} 份灵感`, 'city', city, '', { 'aria-pressed': project.city === city })));
  $('city-context').textContent = `正在安排${project.city}的一天 · 切换城市会保留各自草稿`;
  $('nav-trip-count').textContent = project.stops.length;
  const cityNotes = TRAVEL_NOTES.filter(note => note.city === project.city && project.community.travelNoteIds.includes(note.id));
  $('collection-hint').textContent = cityNotes.length ? `${cityNotes.length} 篇${project.city}旅行收藏的地点已带入。挑选今天想去的。` : candidates.some(x => x.sourceRef) ? '地点整理自原帖截图，心动理由为可编辑示例。' : '从发现页加入旅行收藏，或手动添加自己的灵感。';
  $('collection-list').replaceChildren(...candidates.map(inspirationCard));
  if (!candidates.length) $('collection-list').append(node('div', { class: 'empty-state' }, node('strong', {}, `${project.city}的第一份心动，会是哪里？`), node('p', {}, '去发现页收藏喜欢的旅行笔记，也可以手动添加。'), action('去发现灵感', 'discover', '', 'outline small')));
  $('stop-list').replaceChildren(...project.stops.map(stopCard));
  if (!project.stops.length) $('stop-list').append(node('div', { class: 'empty-state' }, node('strong', {}, '这一天，等你来安排'), node('p', {}, '从收藏加入地点，或按偏好整理一份初始行程。'), action('去看看收藏', 'collections', '', 'outline small')));
  $('project-title').value = project.title; $('title-count').textContent = `${project.title.length}/24`; $('project-date').value = project.date;
  renderSummary();
  document.querySelectorAll('[data-pace]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pace === project.preferences.pace)));
  $('interest-chips').replaceChildren(...Object.entries(CATEGORIES).map(([id, label]) => action(label, 'interest', id, '', { 'aria-pressed': project.preferences.interests.includes(id) })));
  document.querySelectorAll('[data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === project.theme)));
  $('arrange').disabled = !candidates.length;
  $('arrange-reason').textContent = arrangement ? '整理理由已显示在行程上方，可继续调整顺序和备注。' : '优先保留必去，再匹配你的兴趣。地点顺序可继续调整。';
  $('arrangement-result').hidden = !arrangement;
  $('arrangement-summary').textContent = arrangement?.summary ?? '';
  $('arrangement-detail').textContent = arrangement?.detail ?? '';
  $('arrangement-count').textContent = arrangement ? `${project.stops.length} 站心动` : '';
  setTab(tab);
  guideUI?.refresh();
}
function renderSummary() { const total = project.stops.reduce((sum, stop) => sum + stop.minutes, 0); $('trip-summary').textContent = project.stops.length ? `${project.stops.length} / 6 站 · 已填写停留 ${total} 分钟 · 不含交通时间` : ''; }
async function renderPreview() {
  const version = ++renderVersion; posterReady = false; $('export-png').disabled = true; $('enlarge-poster').disabled = true;
  const assets = await loadPosterAssets(project);
  if (version !== renderVersion) return;
  const description = renderPoster($('poster'), project, assets);
  $('poster-description').textContent = description;
  $('poster').setAttribute('aria-label', `${project.title || '我的路书'}。${description || '尚未添加地点。'}`);
  $('stage-caption').textContent = assets.hasFallback ? '部分插画未加载，已用通用图形替代；仍可保存路书。' : project.stops.length ? '换个顺序，添一句心情。每一次修改，都会留在画里。' : '从左侧添加地点，你的路书会在这里慢慢成形。';
  posterReady = true; $('export-png').disabled = !project.stops.length; $('enlarge-poster').disabled = false;
}

function openInspiration(id) {
  if (!id && project.inspirations.length >= LIMITS.collections) return notify('一份项目最多保存60份灵感，请先整理现有收藏。');
  const item = project.inspirations.find(x => x.id === id), form = $('inspiration-form'); form.reset();
  for (const key of ['id', 'place', 'category', 'reason', 'sourceUrl', 'excerpt']) if (item) form.elements.namedItem(key).value = item[key];
  $('form-error').textContent = ''; $('inspiration-dialog-title').textContent = item ? '再看看这份心动' : '收下一份旅行心动';
  $('delete-inspiration')?.remove();
  $('community-delete-hint')?.remove();
  if (item && id.startsWith('community:')) { form.querySelector('.dialog-actions').before(node('p', { id: 'community-delete-hint', class: 'community-delete-hint' }, '这个地点来自旅行收藏。今天不想去可以移出行程；取消对应笔记的旅行收藏后，候选地点会同步移除。')); }
  else if (item) { const button = action('删除这份灵感', 'delete-inspiration', id, 'text-button'); button.id = 'delete-inspiration'; form.querySelector('.dialog-actions').prepend(button); }
  $('inspiration-dialog').showModal(); form.elements.namedItem('place').focus();
}
$('inspiration-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget), id = data.get('id');
  try {
    const old = project.inspirations.find(x => x.id === id);
    const item = { id: old?.id ?? uid(), city: old?.city ?? project.city, place: data.get('place').trim(), category: data.get('category'), reason: data.get('reason').trim(), sourceUrl: safeUrl(data.get('sourceUrl').trim()), excerpt: data.get('excerpt').trim(), mustVisit: old?.mustVisit ?? false, isExample: old?.isExample ?? false, sourceRef: old?.sourceRef ?? '' };
    if (!item.place) throw new Error('请填写一个想去的地点。');
    // Editing an example retains its provenance; creating a new card is always personal input.
    const next = { ...project, inspirations: old ? project.inspirations.map(x => x.id === id ? item : x) : [...project.inspirations, item] };
    project = validateProject(next); $('inspiration-dialog').close(); changed(); notify(old ? '这份心动已更新。' : '已收好这份心动，可以把它加入行程。');
  } catch (error) { $('form-error').textContent = error.message; }
});
$('add-inspiration').addEventListener('click', () => openInspiration());

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const { action: op, id } = button.dataset;
  if (op === 'city') { project = switchCity(project, id); arrangement = null; changed(); notify(`已切换到${id}，另一座城市的草稿已保留。`); return; }
  if (op === 'discover') return setPage('discover');
  if (op === 'community-note') return communityUI.openNote(id);
  if (op === 'new') return openInspiration();
  if (op === 'source') {
    const item = project.inspirations.find(x => x.id === id), source = item && SOURCES[item.sourceRef]; if (!source) return;
    $('source-title').textContent = source.title; $('source-author').textContent = `原作者：${source.author} · 用户提供的截图`;
    $('source-summary').textContent = source.summary;
    $('source-images').replaceChildren(...source.images.map(file => node('img', { src: assetUrl(file), alt: `${source.author}的原帖截图`, loading: 'lazy' })));
    $('source-dialog').showModal(); return;
  }
  if (op === 'edit') return openInspiration(id);
  if (op === 'collections') return setTab('collections');
  if (op === 'delete-inspiration') {
    $('inspiration-dialog').close();
    const inTrip = project.stops.some(x => x.inspirationId === id);
    if (!(await confirmAction('删除这份灵感？', inTrip ? '对应的行程站点也会一起移除。' : '删除后将不再出现在当前收藏中。', '删除'))) return openInspiration(id);
    project.inspirations = project.inspirations.filter(x => x.id !== id); project.stops = project.stops.filter(x => x.inspirationId !== id); changed(); return;
  }
  if (op === 'must') { const item = project.inspirations.find(x => x.id === id); if (item) item.mustVisit = !item.mustVisit; }
  if (op === 'interest') { const values = project.preferences.interests; project.preferences.interests = values.includes(id) ? values.filter(x => x !== id) : [...values, id]; }
  if (op === 'toggle-stop') {
    if (!cityInspirations(project).some(item => item.id === id)) return notify('请先切换到这个地点所在的城市。');
    const found = project.stops.find(x => x.inspirationId === id);
    if (found) project.stops = project.stops.filter(x => x.id !== found.id);
    else { if (project.stops.length >= 6) return notify('一张路书最多六站，先移出一站再添加吧。'); project.stops.push(makeStop(id)); notify('已加入行程，路书也更新了。'); }
  }
  if (op === 'remove-stop') project.stops = project.stops.filter(x => x.id !== id);
  if (op === 'up' || op === 'down') { const index = project.stops.findIndex(x => x.id === id), target = index + (op === 'up' ? -1 : 1); if (index >= 0 && target >= 0 && target < project.stops.length) [project.stops[index], project.stops[target]] = [project.stops[target], project.stops[index]]; }
  if (op === 'reset-note') { const stop = project.stops.find(x => x.id === id); if (stop) stop.note = null; }
  changed();
});
document.querySelectorAll('[data-pace]').forEach(button => button.addEventListener('click', () => { project.preferences.pace = button.dataset.pace; changed(); }));
document.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => { project.theme = button.dataset.theme; changed(); }));
$('arrange').addEventListener('click', async () => {
  try {
    const result = arrangeProject(project);
    if (project.stops.length && !(await confirmAction('按当前偏好重新整理？', '将替换行程中的地点和顺序；保留地点已有的停留时间和备注。', '重新整理'))) return;
    project.stops = result;
    arrangement = { ...explainArrangement(project, result), signature: arrangementSignature() };
    changed(); setTab('itinerary');
    $('arrangement-result').scrollIntoView({ block: 'nearest', behavior: 'instant' });
    notify(`已整理 ${result.length} 站，看看它们为什么被选中。`);
  } catch (error) { notify(error.message); }
});
$('project-title').addEventListener('input', event => { project.title = event.target.value.slice(0, LIMITS.title); $('title-count').textContent = `${project.title.length}/24`; changed(false); });
$('project-date').addEventListener('change', event => { if (!event.target.checkValidity()) { event.target.reportValidity(); return; } project.date = event.target.value; changed(false); });
$('stop-list').addEventListener('input', event => {
  const noteId = event.target.dataset.stopNote;
  if (noteId) { const stop = project.stops.find(x => x.id === noteId); if (stop) { stop.note = event.target.value.slice(0, LIMITS.note); const counter = [...document.querySelectorAll('[data-note-count]')].find(x => x.dataset.noteCount === noteId); if (counter) counter.textContent = `${stop.note.length}/40`; changed(false); } }
});
$('stop-list').addEventListener('change', event => {
  const id = event.target.dataset.stopMinutes; if (!id) return;
  const minutes = event.target.value === '' ? 0 : Number(event.target.value);
  const stop = project.stops.find(x => x.id === id); if (!stop) return;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 720) { event.target.value = stop.minutes || ''; return notify('停留时间请填写0—720分钟的整数。'); }
  stop.minutes = minutes; renderSummary(); changed(false);
});

async function replaceProject(next, label) {
  if ((project.inspirations.length || project.stops.length) && !(await confirmAction(label, '将替换当前项目。想保留已有内容，可先在项目菜单备份 JSON。', '替换当前项目'))) return;
  clearTimeout(saveTimer); project = next; arrangement = null; changed(); setTab('collections'); setPage('workbench');
}
$('load-demo').addEventListener('click', () => replaceProject(sampleProject(), '载入杭州示例？'));
$('welcome-demo').addEventListener('click', () => replaceProject(sampleProject(), '载入杭州示例？'));
$('new-project').addEventListener('click', () => { document.querySelector('.project-menu').open = false; replaceProject(blankProject(), '新建空白路书？'); });
$('welcome-blank').addEventListener('click', () => { $('welcome-card').hidden = true; setTab('collections'); openInspiration(); });
$('about-project').addEventListener('click', () => { document.querySelector('.project-menu').open = false; $('about-dialog').showModal(); });
function download(blob, filename) { const url = URL.createObjectURL(blob); const a = node('a', { href: url, download: filename }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
const filename = () => (project.title.trim() || '收藏成形').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
$('export-json').addEventListener('click', () => { document.querySelector('.project-menu').open = false; download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${filename()}.json`); notify('已导出项目备份，可在其他浏览器中导入。'); });
$('import-json').addEventListener('click', () => { document.querySelector('.project-menu').open = false; $('json-file').click(); });
$('json-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  try { if (file.size > 1024 * 1024) throw new Error('项目文件过大，请选择1MB以内的 JSON 备份。'); const next = validateProject(JSON.parse(await file.text())); await replaceProject(next, '导入这份路书？'); }
  catch (error) { notify(error instanceof SyntaxError ? '文件不是有效的 JSON，当前项目没有改变。' : error.message); }
});
async function showImage(downloadFirst) {
  if (!posterReady || (downloadFirst && !project.stops.length)) return;
  try {
    const blob = await new Promise((resolve, reject) => $('poster').toBlob(result => result ? resolve(result) : reject(new Error('图片导出失败，请重试。')), 'image/png'));
    if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = URL.createObjectURL(blob);
    $('export-image').src = imageUrl; $('download-again').href = imageUrl; $('download-again').download = `${filename()}.png`; $('open-image').href = imageUrl;
    if (downloadFirst) download(blob, `${filename()}.png`);
    $('image-dialog').showModal();
  } catch (error) { notify(error.message || '当前浏览器无法导出，请换个浏览器重试。'); }
}
$('export-png').addEventListener('click', () => showImage(true));
$('enlarge-poster').addEventListener('click', () => showImage(false));
$('image-dialog').addEventListener('close', () => { if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; $('export-image').removeAttribute('src'); $('download-again').removeAttribute('href'); $('open-image').removeAttribute('href'); } });
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { $('workspace').dataset.view = button.dataset.view; document.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', String(x === button))); window.scrollTo({ top: 0, behavior: 'instant' }); }));
document.addEventListener('click', event => { const menu = document.querySelector('.project-menu'); if (!menu.contains(event.target)) menu.open = false; });

function setPage(page, updateHash = true) {
  const discover = page !== 'workbench';
  document.body.dataset.page = discover ? 'discover' : 'workbench';
  $('discover-page').hidden = !discover; $('workspace').hidden = discover; $('workbench-mobile-nav').hidden = discover;
  $('nav-discover').setAttribute('aria-pressed', String(discover)); $('nav-workbench').setAttribute('aria-pressed', String(!discover));
  if (updateHash && location.hash !== `#${page}`) location.hash = page;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
$('nav-discover').addEventListener('click', () => setPage('discover'));
$('nav-workbench').addEventListener('click', () => setPage('workbench'));
$('brand-home').addEventListener('click', event => { event.preventDefault(); setPage('discover'); });
window.addEventListener('hashchange', () => setPage(location.hash === '#workbench' ? 'workbench' : 'discover', false));
const communityUI = createCommunity({
  getProject: () => project, node,
  toggleSaved(id) {
    const saved = project.community.savedNoteIds;
    project.community.savedNoteIds = saved.includes(id) ? saved.filter(value => value !== id) : [...saved, id];
    changed(); notify(project.community.savedNoteIds.includes(id) ? '已普通收藏，留着以后慢慢看。' : '已取消普通收藏，旅行收藏不受影响。');
  },
  async toggleTravel(id) {
    const selected = !project.community.travelNoteIds.includes(id);
    let base = project;
    if (selected && !project.community.travelNoteIds.length && project.inspirations.some(item => !item.id.startsWith('community:'))) {
      if (!(await confirmAction('用旅行收藏开启一份新路书？', '当前工作台已有草稿。继续会替换原有地点和行程；需要保留的话，请先在项目菜单备份 JSON。普通收藏会保留。', '开启新路书'))) return;
      base = blankProject(); base.community.savedNoteIds = [...project.community.savedNoteIds];
    }
    try {
      const next = setTravelNote(base, id, selected);
      const removed = allStops(project).filter(stop => !allStops(next).some(item => item.id === stop.id));
      if (!selected && removed.length && !(await confirmAction('取消这篇旅行收藏？', `有 ${removed.length} 个当天行程地点仅来自这篇笔记，将同步移除。其他笔记仍包含的地点会保留。`, '取消旅行收藏'))) return;
      project = next; arrangement = null; changed();
      const count = TRAVEL_NOTES.find(note => note.id === id).places.length;
      notify(selected ? `已加入旅行收藏 · 这篇包含 ${count} 个地点，相同地点自动合并。` : '已取消旅行收藏，候选地点已同步更新。');
    } catch (error) { notify(error.message); }
  },
  enterTrip(city) {
    if (city) { project = switchCity(project, city); changed(); }
    setPage('workbench'); setTab('collections');
    $('workspace').dataset.view = 'edit';
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === 'edit')));
    notify('旅行收藏已变成候选地点，选出今天最想去的几站吧。');
  },
});
guideUI = createGuide({
  getProject: () => project,
  searchCity: city => communityUI.searchCity(city),
  showDiscover: () => setPage('discover'),
  showPreview: () => {
    document.querySelector('[data-view=preview]').click();
    document.querySelector('.preview-toolbar').scrollIntoView({ block: 'start', behavior: 'instant' });
    document.querySelector('[data-theme][aria-pressed=true]').focus({ preventScroll: true });
  },
});
document.querySelectorAll('[data-icon]').forEach(element => element.replaceChildren(icon(element.dataset.icon)));
renderEditor(); renderPreview(); communityUI.render();
setPage(location.hash === '#workbench' ? 'workbench' : 'discover', false);
// Warm all local styles after the first paint; this makes later theme switches immediate.
Promise.allSettled(THEMES.map(theme => loadAtlas(theme, project.city)));
if (storageWarning) notify(storageWarning);
