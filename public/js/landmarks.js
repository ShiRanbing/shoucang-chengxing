// One local illustration per known place and theme. No remote inference or URL generation.
export const LANDMARKS = [
  {
    "key": "manjuelong",
    "id": "sample-1",
    "name": "满觉陇",
    "city": "杭州",
    "aliases": []
  },
  {
    "key": "baihe-tea",
    "id": "sample-2",
    "name": "白鹤栖茶",
    "city": "杭州",
    "aliases": []
  },
  {
    "key": "miaosy",
    "id": "sample-3",
    "name": "猫猫寺 MIAOSY",
    "city": "杭州",
    "aliases": [
      "猫猫寺"
    ]
  },
  {
    "key": "west-lake",
    "id": "sample-4",
    "name": "西湖",
    "city": "杭州",
    "aliases": [
      "西湖景区"
    ]
  },
  {
    "key": "maojiabu",
    "id": "sample-5",
    "name": "茅家埠",
    "city": "杭州",
    "aliases": []
  },
  {
    "key": "dasong-crab",
    "id": "sample-6",
    "name": "大宋蟹略·西湖庭院店",
    "city": "杭州",
    "aliases": [
      "大宋蟹略西湖庭院店",
      "大宋蟹略·西湖庭院景观店"
    ]
  },
  {
    "key": "gongchen-bridge",
    "id": "sample-7",
    "name": "拱宸桥",
    "city": "杭州",
    "aliases": []
  },
  {
    "key": "hefang-street",
    "id": "sample-8",
    "name": "河坊街",
    "city": "杭州",
    "aliases": []
  },
  {
    "key": "the-bund",
    "id": "sh-1",
    "name": "外滩",
    "city": "上海",
    "aliases": []
  },
  {
    "key": "wukang-road",
    "id": "sh-2",
    "name": "武康路",
    "city": "上海",
    "aliases": []
  },
  {
    "key": "anfu-road",
    "id": "sh-3",
    "name": "安福路",
    "city": "上海",
    "aliases": []
  },
  {
    "key": "yuyuan-garden",
    "id": "sh-4",
    "name": "豫园",
    "city": "上海",
    "aliases": []
  },
  {
    "key": "yuyuan-coffee",
    "id": "sh-5",
    "name": "愚园路茶咖漫步",
    "city": "上海",
    "aliases": [
      "愚园路"
    ]
  },
  {
    "key": "xuhui-riverside",
    "id": "sh-6",
    "name": "徐汇滨江",
    "city": "上海",
    "aliases": []
  }
];
function normalizeLandmarkName(value) { return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·•・]/gu, ''); }
export function landmarkFor(item) {
  const city = item.city ?? '杭州', name = normalizeLandmarkName(item.place);
  return LANDMARKS.find(landmark => landmark.city === city && [landmark.name, ...landmark.aliases].some(alias => name === normalizeLandmarkName(alias) || name === normalizeLandmarkName(city + alias))) ?? null;
}
export function landmarkFilename(item, theme) {
  if (!['watercolor', 'pencil', 'retro'].includes(theme)) return null;
  const landmark = landmarkFor(item);
  return landmark ? `place-${landmark.key}-${theme}.webp` : null;
}
