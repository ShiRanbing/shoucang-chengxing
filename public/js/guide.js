// Guide preferences are separate from trip data: opening, skipping or replaying
// help must never create a trip, replace a draft, or change a collection.
export function createGuide({ getProject, searchCity, showDiscover, showPreview }) {
  const byId = id => document.getElementById(id), key = 'shoucang-chengxing.guide.v1';
  let preferences = { welcomeDismissed: false, tipsDismissed: false };
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored && typeof stored === 'object') preferences = { welcomeDismissed: stored.welcomeDismissed === true, tipsDismissed: stored.tipsDismissed === true };
  } catch { /* Help remains usable when storage is unavailable or invalid. */ }
  function remember(change) {
    Object.assign(preferences, change);
    try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Retain this session's choice. */ }
    refresh();
  }
  function startCity(city) {
    if (!['杭州', '上海'].includes(city)) return;
    byId('guide-dialog').close(); remember({ welcomeDismissed: true });
    searchCity(city); showDiscover(); byId('note-search').focus({ preventScroll: true });
  }
  function open() {
    document.querySelector('.project-menu').open = false;
    const dialog = byId('guide-dialog');
    if (!dialog.open) { dialog.showModal(); dialog.scrollTop = 0; }
  }
  function refresh() {
    byId('welcome-guide').hidden = preferences.welcomeDismissed;
    byId('workbench-guide').hidden = preferences.tipsDismissed;
    const project = getProject(), count = project.inspirations.filter(item => item.city === project.city).length;
    const stage = project.stops.length ? 4 : count ? 3 : 1;
    byId('guide-stage').textContent = String(stage).padStart(2, '0');
    byId('guide-next-title').textContent = stage === 4 ? '这一天成形了，挑个喜欢的风格吧' : stage === 3 ? `${count} 个心动地点，挑出今天想去的` : '先收下一份旅行心动';
    byId('guide-next-description').textContent = stage === 4 ? `已选 ${project.stops.length} 站。可以在「我的行程」调顺序和备注，再保存成图片。` : stage === 3 ? '点「加入行程」选地点，或按当前偏好整理第一版。最多 6 站，之后都能再改。' : '去发现页搜索杭州或上海，点笔记的「旅行收藏」，地点就会出现在这里。';
    byId('guide-next-action').textContent = stage === 4 ? '去看看路书 →' : stage === 3 ? '按偏好整理第一版 →' : `去看看${project.city} →`;
  }
  byId('open-guide').addEventListener('click', open);
  byId('welcome-guide-details').addEventListener('click', open);
  byId('dismiss-welcome-guide').addEventListener('click', () => { remember({ welcomeDismissed: true }); byId('open-guide').focus({ preventScroll: true }); });
  byId('dismiss-workbench-guide').addEventListener('click', () => { remember({ tipsDismissed: true }); byId('open-guide').focus({ preventScroll: true }); });
  document.querySelectorAll('[data-guide-city]').forEach(button => button.addEventListener('click', () => startCity(button.dataset.guideCity)));
  byId('guide-next-action').addEventListener('click', () => {
    const project = getProject();
    if (project.stops.length) showPreview();
    else if (project.inspirations.some(item => item.city === project.city)) byId('arrange').click();
    else startCity(project.city);
  });
  refresh();
  return { refresh };
}
