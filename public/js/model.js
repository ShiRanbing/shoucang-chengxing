import { SOURCES } from './sources.js';
import { TRAVEL_NOTES, TRAVEL_NOTE_IDS, NOTE_IDS, SHANGHAI_PLACES } from './notes.js';
export const CATEGORIES = { nature: '自然', street: '街巷', culture: '人文', food: '美食', coffee: '茶咖', other: '其他' };
export const THEMES = ['watercolor', 'pencil', 'retro'];
export const CITIES = ['杭州', '上海'];
export const LIMITS = { title: 24, place: 20, reason: 40, note: 40, excerpt: 300, collections: 60, stops: 6 };
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function blankProject() { return { schemaVersion: 1, city: '杭州', otherTrips: {}, title: '把心动写进下一程', date: '', theme: 'watercolor', preferences: { pace: 'slow', interests: ['nature', 'coffee'] }, inspirations: [], stops: [], community: { savedNoteIds: [], travelNoteIds: [] } }; }
export function sampleProject() {
  const p = blankProject(); p.title = '在杭州，偷得半日闲';
  const rows = [
    ['满觉陇', 'nature', '想走进山野，给自己一个不赶路的下午。', '据用户提供的 Joan 笔记整理：满觉陇适合半日漫步，作者分享了茶馆、登高和猫猫寺等停留点。', true, 'manjuelong'],
    ['白鹤栖茶', 'coffee', '坐下来喝一杯茶，把发呆也写进行程。', '据 Joan 笔记整理：作者提到台阶旁的白鹤栖茶，并分享休息、喝茶和拍照体验。', false, 'manjuelong'],
    ['猫猫寺 MIAOSY', 'culture', '留一点时间，看看猫咪和可爱的小物。', '据 Joan 笔记整理：作者从山顶继续前往猫猫寺，提到文创与茶点。具体消费及开放信息需另行确认。', false, 'manjuelong'],
    ['西湖', 'nature', '把一阵湖风，留给慢慢喜欢这座城的我。', '据努努学习笔记整理：作者将西湖列为个人推荐，并提到可以选择不同的沿湖散步区域。', false, 'places'],
    ['茅家埠', 'nature', '想选一段安静的湖边，走走停停。', '据努努学习笔记整理：作者在西湖游览建议中提到茅家埠，偏好这里的风景与游览感受。', false, 'places'],
    ['大宋蟹略·西湖庭院店', 'food', '想把江南庭院和一顿好饭放在同一站。', '据幼儿园最皮笔记整理：作者分享大宋蟹略西湖庭院景观店的曲水流觞、茶百戏和餐饮体验。', false, 'dining'],
    ['拱宸桥', 'culture', '去桥边看看水，给这次出发留张照片。', '据努努学习笔记整理：拱宸桥出现在作者个人推荐的杭州景点中。此卡仅保留地点灵感。', false, 'places'],
    ['河坊街', 'street', '如果顺路，就逛逛街巷里的小店。', '据努努学习笔记整理：作者对河坊街的个人建议是顺路游览。是否加入由自己的偏好决定。', false, 'places'],
  ];
  p.inspirations = rows.map(([place, category, reason, excerpt, mustVisit, sourceRef], i) => ({ id: `sample-${i + 1}`, city: '杭州', place, category, reason, excerpt, mustVisit, sourceRef, sourceUrl: '', isExample: true }));
  p.stops = ['sample-1', 'sample-2', 'sample-3'].map(id => makeStop(id));
  return p;
}
export function makeStop(inspirationId) { return { id: uid(), inspirationId, minutes: 45, note: null }; }
export function cityInspirations(project) { return project.inspirations.filter(item => (item.city ?? '杭州') === (project.city ?? '杭州')); }
export function allStops(project) { return [...project.stops, ...Object.values(project.otherTrips ?? {}).flatMap(trip => trip.stops)]; }
export function switchCity(project, city) {
  if (!CITIES.includes(city)) throw new Error('暂时支持杭州和上海。');
  if (project.city === city) return project;
  const next = structuredClone(project);
  const target = next.otherTrips[city] ?? { title: `在${city}，收藏一日心动`, date: '', stops: [] };
  next.otherTrips[next.city] = { title: next.title, date: next.date, stops: next.stops };
  delete next.otherTrips[city];
  Object.assign(next, target, { city });
  return next;
}
export function notesForPlace(project, inspirationId) {
  if (!inspirationId.startsWith('community:')) return [];
  const placeId = inspirationId.slice('community:'.length);
  return TRAVEL_NOTES.filter(note => project.community.travelNoteIds.includes(note.id) && note.places.includes(placeId));
}
export function setTravelNote(project, noteId, selected) {
  if (!TRAVEL_NOTE_IDS.includes(noteId)) throw new Error('这篇笔记不存在。');
  const next = structuredClone(project);
  next.community.travelNoteIds = selected ? [...new Set([...next.community.travelNoteIds, noteId])] : next.community.travelNoteIds.filter(id => id !== noteId);
  const wanted = new Set(next.community.travelNoteIds.flatMap(id => TRAVEL_NOTES.find(note => note.id === id).places));
  const old = new Map(next.inspirations.map(item => [item.id, item]));
  next.inspirations = next.inspirations.filter(item => !item.id.startsWith('community:') || wanted.has(item.id.slice('community:'.length)));
  for (const placeId of wanted) {
    const id = `community:${placeId}`;
    if (!old.has(id)) {
      const base = [...sampleProject().inspirations, ...SHANGHAI_PLACES].find(item => item.id === placeId);
      next.inspirations.push({ ...base, id, mustVisit: false });
    }
  }
  const kept = new Set(next.inspirations.map(item => item.id));
  next.stops = next.stops.filter(stop => kept.has(stop.inspirationId));
  for (const trip of Object.values(next.otherTrips)) trip.stops = trip.stops.filter(stop => kept.has(stop.inspirationId));
  if (next.inspirations.length > LIMITS.collections) throw new Error('收藏灵感已满，请先整理已有地点。');
  // The first travel collection picks the city without replacing an existing day.
  if (selected && !project.community.travelNoteIds.length && !allStops(project).length) return switchCity(next, TRAVEL_NOTES.find(note => note.id === noteId).city);
  return next;
}
export function stopNote(stop, inspiration) { return stop.note === null ? inspiration.reason : stop.note; }
export function safeUrl(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 2048) throw new Error('笔记链接格式不正确。');
  try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(); return url.href; }
  catch { throw new Error('请填写以 https:// 或 http:// 开头的有效链接。'); }
}
export function arrangeProject(project) {
  const candidates = cityInspirations(project);
  const mandatory = candidates.filter(x => x.mustVisit);
  if (mandatory.length > LIMITS.stops) throw new Error('必去地点超过六个，请先减少必去标记。');
  const desired = Math.max(mandatory.length, project.preferences.pace === 'slow' ? 3 : 5);
  const sorted = candidates.map((item, index) => ({ item, index })).sort((a, b) => Number(b.item.mustVisit) - Number(a.item.mustVisit) || Number(project.preferences.interests.includes(b.item.category)) - Number(project.preferences.interests.includes(a.item.category)) || a.index - b.index);
  const old = new Map(project.stops.map(stop => [stop.inspirationId, stop]));
  return sorted.slice(0, desired).map(({ item }) => old.get(item.id) ?? makeStop(item.id));
}
// Explain the selected result; a mandatory place must not also count as an
// interest-based addition. Only candidates from the current city participate.
export function explainArrangement(project, stops) {
  const candidates = cityInspirations(project), selectedIds = new Set(stops.map(stop => stop.inspirationId));
  const selected = candidates.filter(item => selectedIds.has(item.id));
  if (!selected.length) return { summary: '还没有可整理的地点。', detail: '先收藏几个想去的地方吧。' };
  const mandatory = selected.filter(item => item.mustVisit);
  const optional = selected.filter(item => !item.mustVisit);
  const matched = optional.filter(item => project.preferences.interests.includes(item.category));
  const matchedLabels = Object.entries(CATEGORIES).filter(([category]) => matched.some(item => item.category === category)).map(([, label]) => label);
  const remaining = optional.length - matched.length, parts = [];
  if (mandatory.length) parts.push(`保留了你标记的 ${mandatory.length} 个必去地点`);
  if (matched.length) parts.push(`根据${matchedLabels.join('、')}偏好${mandatory.length ? '补入' : '选入'} ${matched.length} 站`);
  if (remaining) parts.push(parts.length ? `其余 ${remaining} 站按收藏顺序选入` : `按收藏顺序选入 ${remaining} 站`);
  const defaultCount = project.preferences.pace === 'slow' ? 3 : 5;
  const desired = Math.max(mandatory.length, defaultCount), details = [];
  if (!project.preferences.interests.length) details.push('未选择兴趣标签。');
  else if (remaining && !matched.length) details.push(mandatory.length ? '其余候选未匹配你的兴趣标签。' : '当前候选未匹配你的兴趣标签。');
  if (mandatory.length > defaultCount) details.push(`必去地点超过默认 ${defaultCount} 站，已全部保留。`);
  else if (selected.length < desired) details.push(`当前${project.city}只有 ${candidates.length} 个候选，已全部纳入。`);
  else details.push(`按「${project.preferences.pace === 'slow' ? '慢慢来' : '多看看'}」整理 ${selected.length} 站。`);
  details.push('同等条件按收藏顺序选择，游览顺序仍可调整。');
  return { summary: parts.join('，') + '。', detail: details.join('') };
}
function record(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式不正确。`); return value; }
function string(value, max, label, required = false) { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label}缺失或超出长度限制。`); return value; }
function uniqueId(value, set, label) { string(value, 100, label, true); if (set.has(value)) throw new Error(`${label}重复。`); set.add(value); return value; }
export function validateProject(input) {
  const p = record(input, '项目');
  if (p.schemaVersion !== 1) throw new Error('暂不支持这个项目版本，请导入收藏成形 v1 项目。');
  const city = p.city ?? '杭州';
  if (!CITIES.includes(city)) throw new Error('项目城市不受支持。');
  const title = string(p.title, LIMITS.title, '标题');
  const date = string(p.date, 10, '日期');
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2000-01-01' || date > '2100-12-31' || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('日期格式不正确。');
  if (!THEMES.includes(p.theme)) throw new Error('路书风格不受支持。');
  const prefs = record(p.preferences, '偏好');
  if (!['slow', 'compact'].includes(prefs.pace) || !Array.isArray(prefs.interests) || prefs.interests.length > 6 || prefs.interests.some(x => !Object.hasOwn(CATEGORIES, x))) throw new Error('旅行偏好格式不正确。');
  if (!Array.isArray(p.inspirations) || p.inspirations.length > LIMITS.collections || !Array.isArray(p.stops) || p.stops.length > LIMITS.stops) throw new Error('项目最多包含60份灵感、6个行程地点。');
  const ids = new Set();
  const inspirations = p.inspirations.map(raw => {
    const item = record(raw, '收藏');
    const id = uniqueId(item.id, ids, '收藏ID');
    if (!Object.hasOwn(CATEGORIES, item.category) || typeof item.mustVisit !== 'boolean' || typeof item.isExample !== 'boolean') throw new Error('收藏类别或标记格式不正确。');
    const sourceRef = item.sourceRef ?? '';
    if (sourceRef !== '' && (typeof sourceRef !== 'string' || !Object.hasOwn(SOURCES, sourceRef))) throw new Error('收藏的素材来源标记不正确。');
    const itemCity = item.city ?? (id.startsWith('community:sh-') ? '上海' : '杭州');
    if (!CITIES.includes(itemCity) || (id.startsWith('community:') && itemCity !== (id.startsWith('community:sh-') ? '上海' : '杭州'))) throw new Error('收藏地点的城市不正确。');
    return { id, city: itemCity, place: string(item.place, LIMITS.place, '地点', true), category: item.category, sourceUrl: safeUrl(item.sourceUrl), excerpt: string(item.excerpt, LIMITS.excerpt, '摘录'), reason: string(item.reason, LIMITS.reason, '心动理由'), mustVisit: item.mustVisit, isExample: item.isExample, sourceRef };
  });
  const stopIds = new Set(), referenced = new Set();
  function checkStops(items, tripCity) {
    if (!Array.isArray(items) || items.length > LIMITS.stops) throw new Error('每座城市的路书最多六站。');
    return items.map(raw => {
    const stop = record(raw, '行程');
    const id = uniqueId(stop.id, stopIds, '站点ID');
    if (!ids.has(stop.inspirationId) || referenced.has(stop.inspirationId)) throw new Error('行程存在缺失或重复的收藏引用。');
    if (inspirations.find(item => item.id === stop.inspirationId).city !== tripCity) throw new Error('同一天的行程不能混入另一座城市的地点。');
    referenced.add(stop.inspirationId);
    if (!Number.isInteger(stop.minutes) || stop.minutes < 0 || stop.minutes > 720) throw new Error('停留时间应为0—720分钟的整数。');
    if (stop.note !== null) string(stop.note, LIMITS.note, '路书备注');
    return { id, inspirationId: stop.inspirationId, minutes: stop.minutes, note: stop.note };
    });
  }
  const stops = checkStops(p.stops, city);
  const otherTrips = {};
  for (const [tripCity, raw] of Object.entries(record(p.otherTrips ?? {}, '城市草稿'))) {
    if (!CITIES.includes(tripCity) || tripCity === city) throw new Error('城市草稿不正确。');
    const trip = record(raw, '行程草稿');
    const tripTitle = string(trip.title, LIMITS.title, '草稿标题'), tripDate = string(trip.date, 10, '草稿日期');
    if (tripDate && (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || tripDate < '2000-01-01' || tripDate > '2100-12-31' || !Number.isFinite(Date.parse(tripDate)) || new Date(tripDate).toISOString().slice(0, 10) !== tripDate)) throw new Error('草稿日期格式不正确。');
    otherTrips[tripCity] = { title: tripTitle, date: tripDate, stops: checkStops(trip.stops, tripCity) };
  }
  const community = p.community === undefined ? { savedNoteIds: [], travelNoteIds: [] } : record(p.community, '社区收藏');
  for (const key of ['savedNoteIds', 'travelNoteIds']) {
    const allowed = key === 'savedNoteIds' ? NOTE_IDS : TRAVEL_NOTE_IDS;
    if (!Array.isArray(community[key]) || community[key].length > allowed.length || community[key].some(id => !allowed.includes(id)) || new Set(community[key]).size !== community[key].length) throw new Error('社区收藏的笔记引用不正确。');
  }
  const expected = new Set(community.travelNoteIds.flatMap(id => TRAVEL_NOTES.find(note => note.id === id).places).map(id => `community:${id}`));
  const actual = inspirations.filter(item => item.id.startsWith('community:')).map(item => item.id);
  if (actual.length !== expected.size || actual.some(id => !expected.has(id))) throw new Error('旅行收藏与地点关联不一致。');
  return { schemaVersion: 1, city, otherTrips, title, date, theme: p.theme, preferences: { pace: prefs.pace, interests: [...new Set(prefs.interests)] }, inspirations, stops, community: { savedNoteIds: [...community.savedNoteIds], travelNoteIds: [...community.travelNoteIds] } };
}
