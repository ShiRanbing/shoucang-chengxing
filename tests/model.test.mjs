import test from 'node:test';
import assert from 'node:assert/strict';
import { blankProject, sampleProject, arrangeProject, explainArrangement, validateProject, safeUrl, stopNote, makeStop, setTravelNote, notesForPlace, cityInspirations, switchCity } from '../public/js/model.js';
import { COMMUNITY_NOTES, TRAVEL_NOTES } from '../public/js/notes.js';

test('空白与真实素材示例均通过验证，来源引用完整', () => {
  assert.deepEqual(validateProject(blankProject()), blankProject());
  const p = sampleProject(); assert.deepEqual(validateProject(p), p); assert.equal(p.inspirations.length, 8); assert.ok(p.inspirations.every(x => x.sourceRef));
});
test('慢逛优先必去与兴趣，稳定保留同分顺序', () => {
  const p = sampleProject(); p.preferences.interests = ['coffee'];
  assert.deepEqual(arrangeProject(p).map(x => x.inspirationId), ['sample-1', 'sample-2', 'sample-3']);
  p.preferences.pace = 'compact'; assert.equal(arrangeProject(p).length, 5);
});
test('必去多于默认数量时全保留，超过六站则拒绝', () => {
  const p = sampleProject(); p.inspirations.forEach((x, i) => { x.mustVisit = i < 6; }); assert.equal(arrangeProject(p).length, 6);
  p.inspirations[6].mustVisit = true; assert.throws(() => arrangeProject(p), /超过六个/);
});
test('候选不足不补造，空候选得到空行程', () => {
  const p = sampleProject(); p.inspirations = p.inspirations.slice(0, 2); assert.equal(arrangeProject(p).length, 2);
  assert.deepEqual(arrangeProject(blankProject()), []);
});
test('重新整理保留已有停留和手写备注', () => {
  const p = sampleProject(); p.stops[0].note = '今天想慢一点'; p.stops[0].minutes = 120;
  const result = arrangeProject(p); assert.equal(result[0].note, '今天想慢一点'); assert.equal(result[0].minutes, 120);
});

test('整理解释按实际选中结果计数：必去与兴趣补入不重复', () => {
  const p = sampleProject(); p.preferences.interests = ['coffee']; p.inspirations[2].mustVisit = true;
  const result = arrangeProject(p), explanation = explainArrangement(p, result);
  assert.equal(explanation.summary, '保留了你标记的 2 个必去地点，根据茶咖偏好补入 1 站。');
  assert.match(explanation.detail, /慢慢来.*3 站/);
  p.inspirations[1].mustVisit = true;
  assert.equal(explainArrangement(p, arrangeProject(p)).summary, '保留了你标记的 3 个必去地点。');
});

test('只有实际匹配的类别进入解释，不把普通补位说成兴趣匹配', () => {
  const p = sampleProject(); p.preferences.interests = ['coffee', 'other'];
  const explanation = explainArrangement(p, arrangeProject(p));
  assert.equal(explanation.summary, '保留了你标记的 1 个必去地点，根据茶咖偏好补入 1 站，其余 1 站按收藏顺序选入。');
  assert.doesNotMatch(explanation.summary, /其他/);
  p.preferences.interests = ['other'];
  const unmatched = explainArrangement(p, arrangeProject(p));
  assert.equal(unmatched.summary, '保留了你标记的 1 个必去地点，其余 2 站按收藏顺序选入。');
  assert.match(unmatched.detail, /其余候选未匹配/);
  assert.doesNotMatch(unmatched.summary, /偏好补入/);
});

test('无必去、无兴趣和多兴趣均解释真实来源，不凭空增加计数', () => {
  const p = sampleProject(); p.inspirations.forEach(item => { item.mustVisit = false; });
  p.preferences.interests = [];
  let explanation = explainArrangement(p, arrangeProject(p));
  assert.equal(explanation.summary, '按收藏顺序选入 3 站。');
  assert.match(explanation.detail, /未选择兴趣标签/);
  p.preferences.interests = ['coffee', 'nature'];
  explanation = explainArrangement(p, arrangeProject(p));
  assert.equal(explanation.summary, '根据自然、茶咖偏好选入 3 站。');
  assert.doesNotMatch(explanation.summary, /必去|其余/);
});

test('不足默认站数和必去超过默认数量时说明原因，空候选不虚构结果', () => {
  const p = sampleProject(); p.inspirations = p.inspirations.slice(0, 2); p.preferences.pace = 'compact';
  assert.match(explainArrangement(p, arrangeProject(p)).detail, /当前杭州只有 2 个候选，已全部纳入/);
  const many = sampleProject(); many.inspirations.forEach((item, index) => { item.mustVisit = index < 5; });
  const explanation = explainArrangement(many, arrangeProject(many));
  assert.equal(explanation.summary, '保留了你标记的 5 个必去地点。');
  assert.match(explanation.detail, /必去地点超过默认 3 站，已全部保留/);
  assert.equal(explainArrangement(blankProject(), []).summary, '还没有可整理的地点。');
});

test('整理说明排除其他城市的必去和兴趣，使用实际本城结果', () => {
  let p = setTravelNote(blankProject(), 'sh-wukang', true);
  p = setTravelNote(p, 'hill-afternoon', true);
  p.inspirations.filter(item => item.city === '杭州').forEach(item => { item.mustVisit = true; });
  const explanation = explainArrangement(p, arrangeProject(p));
  assert.doesNotMatch(explanation.summary, /必去/);
  assert.match(explanation.detail, /当前上海只有 2 个候选/);
});
test('空备注与未自定义有区别，允许主动清空', () => {
  const p = sampleProject(), stop = p.stops[0], item = p.inspirations[0];
  assert.equal(stopNote(stop, item), item.reason); stop.note = ''; assert.equal(stopNote(stop, item), '');
});
test('链接只允许完整的 http/https，拒绝脚本和嵌入凭据', () => {
  assert.equal(safeUrl('https://www.xiaohongshu.com/explore/example'), 'https://www.xiaohongshu.com/explore/example');
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', '//example.com', 'https://u:p@example.com']) assert.throws(() => safeUrl(url));
  assert.throws(() => validateProject({ ...sampleProject(), inspirations: [{ ...sampleProject().inspirations[0], sourceUrl: undefined }] }));
});
test('拒绝坏版本、无效日期与超长标题', () => {
  for (const patch of [{ schemaVersion: 2 }, { date: '2026-02-30' }, { date: 'bad' }, { title: '字'.repeat(25) }, { theme: '__proto__' }]) assert.throws(() => validateProject({ ...sampleProject(), ...patch }));
});
test('拒绝重复ID、悬空和重复引用、超过六站', () => {
  let p = sampleProject(); p.inspirations[1].id = p.inspirations[0].id; assert.throws(() => validateProject(p));
  p = sampleProject(); p.stops[0].inspirationId = 'missing'; assert.throws(() => validateProject(p));
  p = sampleProject(); p.stops[1].inspirationId = p.stops[0].inspirationId; assert.throws(() => validateProject(p));
  p = sampleProject(); p.stops = p.inspirations.slice(0, 7).map(x => makeStop(x.id)); assert.throws(() => validateProject(p));
});
test('拒绝负数、小数、字符串和非有限停留分钟数', () => {
  for (const minutes of [-1, 1.5, '45', Infinity, 721]) { const p = sampleProject(); p.stops[0].minutes = minutes; assert.throws(() => validateProject(p)); }
});
test('JSON往返等价；未知字段被移除，任意素材路径不可注入', () => {
  const p = sampleProject(); p.remoteAsset = 'https://evil.example/a.png';
  const normalized = validateProject(JSON.parse(JSON.stringify(p))); assert.equal(normalized.remoteAsset, undefined);
  p.inspirations[0].sourceRef = '../../somewhere'; assert.throws(() => validateProject(p));
});

test('旅行收藏按地点去重；普通收藏独立且不产生候选地点', () => {
  let p = blankProject(); p.community.savedNoteIds = ['hill-afternoon'];
  assert.equal(p.inspirations.length, 0);
  p = setTravelNote(p, 'hill-afternoon', true);
  p = setTravelNote(p, 'tea-time', true);
  assert.equal(p.inspirations.length, 3); assert.equal(p.stops.length, 0);
  assert.equal(notesForPlace(p, 'community:sample-1').length, 2);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
});

test('取消重叠笔记保留地点、手工修改和当天行程，取消最后来源才移除', () => {
  let p = setTravelNote(blankProject(), 'hill-afternoon', true);
  p = setTravelNote(p, 'tea-time', true);
  p.inspirations[0].reason = '我的山间散步'; p.stops = [makeStop('community:sample-1')]; p.stops[0].note = '不赶时间';
  p = setTravelNote(p, 'hill-afternoon', false);
  assert.equal(p.inspirations.length, 2); assert.equal(p.stops.length, 1);
  assert.equal(p.inspirations[0].reason, '我的山间散步'); assert.equal(p.stops[0].note, '不赶时间');
  p = setTravelNote(p, 'tea-time', false); assert.equal(p.inspirations.length, 0); assert.equal(p.stops.length, 0);
});

test('旧项目无损迁移；非法笔记、重复引用和不一致地点不能导入', () => {
  const p = sampleProject(); delete p.community;
  assert.deepEqual(validateProject(p).community, { savedNoteIds: [], travelNoteIds: [] });
  const bad = blankProject(); bad.community.travelNoteIds = ['not-a-note']; assert.throws(() => validateProject(bad));
  bad.community.travelNoteIds = ['hill-afternoon']; assert.throws(() => validateProject(bad), /关联不一致/);
  bad.community.travelNoteIds = []; bad.community.savedNoteIds = ['tea-time', 'tea-time']; assert.throws(() => validateProject(bad));
});

test('混合社区有22篇独立封面，杭州10篇、上海6篇、日常6篇', () => {
  assert.equal(COMMUNITY_NOTES.length, 22);
  assert.equal(new Set(COMMUNITY_NOTES.map(note => note.coverAsset)).size, 22);
  assert.equal(TRAVEL_NOTES.filter(note => note.city === '杭州').length, 10);
  assert.equal(TRAVEL_NOTES.filter(note => note.city === '上海').length, 6);
  assert.equal(COMMUNITY_NOTES.filter(note => note.kind === 'daily').length, 6);
  const p = blankProject(); p.community.savedNoteIds = ['daily-makeup', 'daily-concert'];
  assert.deepEqual(validateProject(p), p); assert.equal(p.inspirations.length, 0);
  assert.throws(() => setTravelNote(p, 'daily-makeup', true));
  p.community.travelNoteIds = ['daily-makeup']; assert.throws(() => validateProject(p));
});

test('上海首收藏自动切换；两城候选和当天行程隔离，切换保留备注', () => {
  let p = setTravelNote(blankProject(), 'sh-wukang', true);
  assert.equal(p.city, '上海'); assert.equal(cityInspirations(p).length, 2);
  p.stops = arrangeProject(p); p.stops[0].note = '慢慢看树影'; p.title = '我的上海散步';
  p = setTravelNote(p, 'hill-afternoon', true); assert.equal(arrangeProject(p).length, 2);
  p = switchCity(p, '杭州'); assert.equal(p.stops.length, 0); assert.equal(cityInspirations(p).length, 3);
  p.stops = arrangeProject(p); p.stops[0].minutes = 80;
  p = validateProject(JSON.parse(JSON.stringify(p)));
  p = switchCity(p, '上海'); assert.equal(p.stops[0].note, '慢慢看树影'); assert.equal(p.title, '我的上海散步');
  assert.equal(p.otherTrips['杭州'].stops[0].minutes, 80);
  p = setTravelNote(p, 'hill-afternoon', false); assert.equal(p.otherTrips['杭州'].stops.length, 0);
  assert.equal(p.stops.length, 2); assert.deepEqual(validateProject(p), p);
});

test('拒绝跨城站点、篡改城市、非法城市草稿；迁移旧杭州项目', () => {
  let p = setTravelNote(blankProject(), 'sh-bund', true);
  p = setTravelNote(p, 'hill-afternoon', true);
  p.stops = [makeStop('community:sample-1')]; assert.throws(() => validateProject(p), /另一座城市/);
  p.stops = []; p.inspirations[0].city = '杭州'; assert.throws(() => validateProject(p), /城市/);
  p = sampleProject(); delete p.city; delete p.otherTrips; p.inspirations.forEach(item => delete item.city);
  const migrated = validateProject(p); assert.equal(migrated.city, '杭州'); assert.equal(migrated.stops.length, 3);
  migrated.otherTrips = { '上海': { title: '标题', date: '2026-02-30', stops: [] } }; assert.throws(() => validateProject(migrated), /日期/);
});
