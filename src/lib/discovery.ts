/** 首页「今天看什么」的人工策展。没有评分、热度和海报。 */

export type DiscoveryMoodId = 'easy' | 'mystery' | 'action' | 'warm';

export interface DiscoveryMood {
  id: DiscoveryMoodId;
  label: string;
}

export interface DiscoveryPick {
  id: string;
  title: string;
  /** 策展时记下的公映或首播年份，不是接口回传。 */
  year?: number;
  kind: '电影' | '剧集';
  moods: DiscoveryMoodId[];
  /** 编辑理由，不是热度或评分。 */
  reason: string;
}

export const DISCOVERY_PAGE_SIZE = 6;

export const DISCOVERY_MOODS: DiscoveryMood[] = [
  { id: 'easy', label: '轻松下饭' },
  { id: 'mystery', label: '悬疑烧脑' },
  { id: 'action', label: '爽快动作' },
  { id: 'warm', label: '温暖治愈' },
];

export const CATALOG: DiscoveryPick[] = [
  { id: 'reply1988', title: '请回答1988', year: 2015, kind: '剧集', moods: ['easy', 'warm'], reason: '邻里串门吃饭，节奏慢，适合不想费脑的晚上。' },
  { id: 'wulin', title: '武林外传', year: 2006, kind: '剧集', moods: ['easy'], reason: '客栈里的日常，对白密，剧情不烧脑。' },
  { id: 'family', title: '家有儿女', year: 2005, kind: '剧集', moods: ['easy'], reason: '家庭情景喜剧，一集一个小事。' },
  { id: 'charlotte', title: '夏洛特烦恼', year: 2015, kind: '电影', moods: ['easy'], reason: '穿越回中学的闹剧，故事线单一。' },
  { id: 'hello-mr-billionaire', title: '西虹市首富', year: 2018, kind: '电影', moods: ['easy'], reason: '花钱任务推动情节，笑点直给。' },
  { id: 'god-of-cookery', title: '食神', year: 1996, kind: '电影', moods: ['easy'], reason: '围绕做饭和比赛，看的时候适合吃饭。' },
  { id: 'king-of-comedy', title: '喜剧之王', year: 1999, kind: '电影', moods: ['easy'], reason: '跑龙套的几段日子，篇幅不长。' },
  { id: 'chinese-odyssey', title: '大话西游之大圣娶亲', year: 1995, kind: '电影', moods: ['easy'], reason: '台词熟，可以当背景看。' },
  { id: '3-idiots', title: '三傻大闹宝莱坞', year: 2009, kind: '电影', moods: ['easy'], reason: '校园笑话多，主线并不绕。' },
  { id: 'chinatown', title: '唐人街探案', year: 2015, kind: '电影', moods: ['easy', 'mystery'], reason: '有个案子，但吐槽比推理多。' },
  { id: 'zootopia', title: '疯狂动物城', year: 2016, kind: '电影', moods: ['easy', 'warm'], reason: '动画，情节按顺序讲完，不需要补设定。' },
  { id: 'apartment', title: '爱情公寓', year: 2009, kind: '剧集', moods: ['easy'], reason: '情景喜剧，单集可以单独看。' },

  { id: 'day-night', title: '白夜追凶', year: 2017, kind: '剧集', moods: ['mystery'], reason: '双胞胎换着查案，线索是顺着往下给的。' },
  { id: 'bad-kids', title: '隐秘的角落', year: 2020, kind: '剧集', moods: ['mystery'], reason: '小孩和大人各瞒着一件事，要对着看。' },
  { id: 'infernal', title: '无间道', year: 2002, kind: '电影', moods: ['mystery'], reason: '警察和黑帮互相安了人，身份是谜面。' },
  { id: 'invisible-guest', title: '看不见的客人', year: 2016, kind: '电影', moods: ['mystery'], reason: '几乎整部在房间里把案情翻过来。' },
  { id: 'lambs', title: '沉默的羔羊', year: 1991, kind: '电影', moods: ['mystery'], reason: '靠对话把连环案往前推。' },
  { id: 'sheep', title: '误杀', year: 2019, kind: '电影', moods: ['mystery'], reason: '父亲替孩子把一个谎补圆。' },
  { id: 'inception', title: '盗梦空间', year: 2010, kind: '电影', moods: ['mystery'], reason: '好几层梦，要记住它自己的规则。' },
  { id: 'interstellar', title: '星际穿越', year: 2014, kind: '电影', moods: ['mystery'], reason: '时间和引力是要跟着算的部分。' },
  { id: 'parasite', title: '寄生虫', year: 2019, kind: '电影', moods: ['mystery'], reason: '两家人的房子里还有一层没说完的事。' },
  { id: 'memories', title: '杀人回忆', year: 2003, kind: '电影', moods: ['mystery'], reason: '案子一直查，电影并不给一个痛快的结尾。' },
  { id: 'shutter', title: '禁闭岛', year: 2010, kind: '电影', moods: ['mystery'], reason: '上岛查失踪，岛上的说法和来意对不上。' },

  { id: 'red-sea', title: '红海行动', year: 2018, kind: '电影', moods: ['action'], reason: '撤侨，动作段落占的时间长。' },
  { id: 'wolf-2', title: '战狼2', year: 2017, kind: '电影', moods: ['action'], reason: '一个人往外闯，去把人接出来。' },
  { id: 'ip-man', title: '叶问', year: 2008, kind: '电影', moods: ['action'], reason: '咏春对打，一场接一场。' },
  { id: 'bullets', title: '让子弹飞', year: 2010, kind: '电影', moods: ['action'], reason: '对白快，枪和局里的来回多。' },
  { id: 'furious7', title: '速度与激情7', year: 2015, kind: '电影', moods: ['action'], reason: '追车是这部的主体。' },
  { id: 'matrix', title: '黑客帝国', year: 1999, kind: '电影', moods: ['action'], reason: '枪战和追逐比解释设定多。' },
  { id: 'busan', title: '釜山行', year: 2016, kind: '电影', moods: ['action'], reason: '故事发生在一列不停的火车上。' },
  { id: 'nezha', title: '哪吒之魔童降世', year: 2019, kind: '电影', moods: ['action'], reason: '动画，打斗对象和胜负都写得很明白。' },
  { id: 'mi6', title: '碟中谍6：全面瓦解', year: 2018, kind: '电影', moods: ['action'], reason: '特务片，追逐和动手是主菜。' },
  { id: 'new-police', title: '新警察故事', year: 2004, kind: '电影', moods: ['action'], reason: '警匪枪战，线很直。' },
  { id: 'spl', title: '杀破狼', year: 2005, kind: '电影', moods: ['action'], reason: '近身搏斗多，情节不绕。' },
  { id: 'mekong', title: '湄公河行动', year: 2016, kind: '电影', moods: ['action'], reason: '缉毒行动，场面是顺着任务往下打的。' },

  { id: 'hi-mom', title: '你好，李焕英', year: 2021, kind: '电影', moods: ['warm'], reason: '回到母亲年轻的时候，看的是家里人。' },
  { id: 'shawshank', title: '肖申克的救赎', year: 1994, kind: '电影', moods: ['warm'], reason: '监狱里把很长的日子过下去。' },
  { id: 'forrest', title: '阿甘正传', year: 1994, kind: '电影', moods: ['warm'], reason: '一个人跑过很多年，旁白把故事串起来。' },
  { id: 'spirited', title: '千与千寻', year: 2001, kind: '电影', moods: ['warm'], reason: '小孩在陌生地方找回去的路。' },
  { id: 'coco', title: '寻梦环游记', year: 2017, kind: '电影', moods: ['warm'], reason: '一个家庭怎样记住一个人。' },
  { id: 'departures', title: '入殓师', year: 2008, kind: '电影', moods: ['warm'], reason: '工作是送别，语气很静。' },
  { id: 'heidi', title: '海蒂和爷爷', year: 2015, kind: '电影', moods: ['warm'], reason: '山上的日常，冲突不多。' },
  { id: 'little-forest', title: '小森林 夏秋篇', year: 2014, kind: '电影', moods: ['warm'], reason: '做饭和季节，几乎没有外部情节。' },
  { id: 'hachi', title: '忠犬八公的故事', year: 2009, kind: '电影', moods: ['warm'], reason: '一只狗在车站等一个人。' },
  { id: 'choristes', title: '放牛班的春天', year: 2004, kind: '电影', moods: ['warm'], reason: '一所学校靠合唱团撑起来。' },
  { id: 'up', title: '飞屋环游记', year: 2009, kind: '电影', moods: ['warm'], reason: '老房子被气球带走之后的一段旅行。' },
  { id: 'dying', title: '我不是药神', year: 2018, kind: '电影', moods: ['warm'], reason: '买药的故事并不轻松，落点在具体的人。' },
  { id: 'leon', title: '这个杀手不太冷', year: 1994, kind: '电影', moods: ['warm'], reason: '隔壁小孩和独居的杀手相处的一段日子。' },
  { id: 'soul', title: '心灵奇旅', year: 2020, kind: '电影', moods: ['warm'], reason: '讨论还想怎样过日子，动画，对白清楚。' },
];

export function picksForMood(mood: DiscoveryMoodId): DiscoveryPick[] {
  return CATALOG.filter((item) => item.moods.includes(mood));
}

export function pageOf(items: readonly DiscoveryPick[], offset: number, size = DISCOVERY_PAGE_SIZE): DiscoveryPick[] {
  if (items.length === 0) return [];
  const start = normalizeOffset(items.length, offset);
  const count = Math.min(size, items.length);
  return Array.from({ length: count }, (_, index) => items[(start + index) % items.length]);
}

/** 组比一页长时整页错开，否则只挪一位，避免「换一批」看起来没变。 */
export function nextPageOffset(length: number, offset: number, size = DISCOVERY_PAGE_SIZE): number {
  if (length <= 1) return 0;
  const step = length > size ? size : 1;
  return normalizeOffset(length, offset + step);
}

export function pickOne(items: readonly DiscoveryPick[], random: () => number): DiscoveryPick | undefined {
  if (items.length === 0) return undefined;
  const index = Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)));
  return items[index];
}

function normalizeOffset(length: number, offset: number): number {
  if (length <= 0) return 0;
  return ((offset % length) + length) % length;
}
