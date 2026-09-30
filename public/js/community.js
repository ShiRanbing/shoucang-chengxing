import { COMMUNITY_NOTES, TRAVEL_NOTES, PLACE_NAMES } from './notes.js';
import { assetUrl } from './assets.js';
import { icon } from './icons.js';

export function createCommunity({ getProject, node, toggleSaved, toggleTravel, enterTrip }) {
  let feed = 'all', tag = '全部', query = '', opened = null;
  const byId = id => document.getElementById(id);
  const tags = ['全部', '旅行', '美妆', '追星', '穿搭', '美甲', '手账', '家居'];
  function cover(note, index = 0) {
    const image = node('img', { class: 'note-cover-image', src: assetUrl(note.coverAsset), alt: `${note.title} · AI 创作封面`, loading: index < 6 ? 'eager' : 'lazy', decoding: 'async' });
    image.addEventListener('error', () => { image.hidden = true; }, { once: true });
    return node('div', { class: `note-cover photo-cover cover-${index % 3}` }, image, node('span', { class: 'cover-topic' }, note.city ? `${note.city} · ${note.tag}` : note.tag), node('div', { class: 'cover-copy' }, ...note.cover.map(text => node('span', {}, text))));
  }
  function buttons(note) {
    const state = getProject().community;
    const saved = state.savedNoteIds.includes(note.id), travel = state.travelNoteIds.includes(note.id);
    const save = node('button', { class: 'note-save', 'data-save-note': note.id, 'aria-pressed': saved, 'aria-label': `${saved ? '取消普通收藏' : '普通收藏'}：${note.title}` }, icon('bookmark'), saved ? '已收藏' : '收藏');
    save.addEventListener('click', () => toggleSaved(note.id));
    if (note.kind !== 'travel') return [save, node('span', { class: 'daily-save-hint' }, '留着慢慢看')];
    const trip = node('button', { class: 'note-travel', 'data-travel-note': note.id, 'aria-pressed': travel, 'aria-label': `${travel ? '取消旅行收藏' : '加入旅行收藏'}：${note.title}` }, icon(travel ? 'check' : 'travel'), '旅行收藏');
    trip.addEventListener('click', () => toggleTravel(note.id));
    return [save, trip];
  }
  function card(note, index) {
    const open = node('button', { class: 'note-open', 'data-open-note': note.id, 'aria-label': `阅读：${note.title}` }, cover(note, index), node('h3', {}, note.title));
    open.addEventListener('click', () => openNote(note.id));
    return node('article', { class: 'community-card', 'data-note-id': note.id, 'data-kind': note.kind, 'data-city': note.city }, open, node('p', { class: 'note-intro' }, note.intro), node('div', { class: 'note-byline' }, node('span', { class: 'editor-avatar', 'aria-hidden': 'true' }, '形'), node('span', {}, '收藏成形编辑部'), node('span', {}, note.kind === 'travel' ? `${note.places.length} 个地点` : note.tag)), node('div', { class: 'note-actions' }, ...buttons(note)));
  }
  function render() {
    const { community } = getProject();
    byId('saved-count').textContent = community.savedNoteIds.length;
    byId('travel-count').textContent = community.travelNoteIds.length;
    document.querySelectorAll('[data-feed]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.feed === feed)));
    document.querySelectorAll('[data-search-city]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.searchCity === query)));
    byId('clear-note-search').hidden = !query;
    byId('note-tags').replaceChildren(...tags.map(text => { const button = node('button', { 'aria-pressed': text === tag }, text); button.addEventListener('click', () => { tag = text; render(); }); return button; }));
    const notes = COMMUNITY_NOTES.filter(note => (feed === 'all' || community[feed === 'saved' ? 'savedNoteIds' : 'travelNoteIds'].includes(note.id)) && (tag === '全部' || (tag === '旅行' ? note.kind === 'travel' : note.tag === tag)) && [note.city, note.title, note.intro, note.tag, ...note.places.map(id => PLACE_NAMES[id])].join(' ').toLowerCase().includes(query.toLowerCase()));
    byId('feed-title').textContent = query ? `关于「${query}」的心动` : { all: '发现生活里的小美好', saved: '留着以后慢慢看', travel: '这次心动，下次出发' }[feed];
    byId('feed-count').textContent = `${notes.length} 篇灵感`;
    byId('notes-grid').replaceChildren(...notes.map(card));
    if (!notes.length) byId('notes-grid').append(node('div', { class: 'empty-state feed-empty' }, node('strong', {}, query || tag !== '全部' ? '这份灵感，还没收录' : feed === 'saved' ? '普通收藏，留住想再看的笔记' : '旅行收藏，等你放入第一份心动'), node('p', {}, '这次可以先探索杭州或上海。点击上方城市按钮，就能看到对应攻略。')));
    const count = community.travelNoteIds.length;
    const places = new Set(community.travelNoteIds.flatMap(id => TRAVEL_NOTES.find(note => note.id === id).places));
    const cities = [...new Set(community.travelNoteIds.map(id => TRAVEL_NOTES.find(note => note.id === id).city))];
    byId('dock-title').textContent = count ? `${count} 篇旅行收藏，${places.size} 个心动地点` : '把喜欢的，放进旅行收藏';
    byId('dock-description').textContent = cities.length > 1 ? '杭州与上海分开安排，切换城市时保留各自草稿。' : count ? '相同地点已合并，下一步挑选今天想去的。' : '普通收藏留着看，旅行收藏带进计划。';
    byId('enter-trip').disabled = !count;
    if (opened && byId('note-dialog').open) byId('note-dialog-actions').replaceChildren(...buttons(COMMUNITY_NOTES.find(note => note.id === opened)));
  }
  function openNote(id) {
    const note = COMMUNITY_NOTES.find(item => item.id === id); if (!note) return;
    opened = id; byId('note-dialog-title').textContent = note.title;
    byId('note-dialog-content').replaceChildren(cover(note), node('p', { class: 'note-detail-intro' }, note.intro), ...note.paragraphs.map(text => node('p', { class: 'note-paragraph' }, text)), note.kind === 'travel' ? node('div', { class: 'note-place-list' }, node('strong', {}, `${note.city} · 这篇笔记里的心动地点`), ...note.places.map(place => node('span', {}, PLACE_NAMES[place]))) : node('div', { class: 'daily-detail-hint' }, icon('bookmark'), '普通收藏，留住日常的灵感。'), node('p', { class: 'note-tip' }, `小提醒 · ${note.tip}`), node('p', { class: 'note-basis' }, `${note.basis} 封面由 AI 辅助创作，表达氛围，并非实景照片。`));
    byId('note-dialog-actions').replaceChildren(...buttons(note));
    if (!byId('note-dialog').open) byId('note-dialog').showModal();
  }
  function searchCity(city) { feed = 'all'; tag = '全部'; query = city; byId('note-search').value = city; render(); }
  document.querySelectorAll('[data-feed]').forEach(button => button.addEventListener('click', () => { feed = button.dataset.feed; tag = '全部'; query = ''; byId('note-search').value = ''; render(); }));
  document.querySelectorAll('[data-search-city]').forEach(button => button.addEventListener('click', () => searchCity(button.dataset.searchCity)));
  byId('clear-note-search').addEventListener('click', () => { query = ''; byId('note-search').value = ''; tag = '全部'; render(); byId('note-search').focus(); });
  byId('note-search').addEventListener('input', event => { query = event.target.value.trim(); tag = '全部'; render(); });
  byId('enter-trip').addEventListener('click', () => { const cities = [...new Set(getProject().community.travelNoteIds.map(id => TRAVEL_NOTES.find(note => note.id === id).city))]; enterTrip(cities.includes(query) ? query : cities.includes(getProject().city) ? getProject().city : cities[0]); });
  return { render, openNote, searchCity };
}
