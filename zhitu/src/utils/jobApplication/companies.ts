export const companyCategories = ['', '大厂', '中厂', '国企', '外企', '民企 / 小厂', '专精', '小而美'];
export interface CompanyReference {
  name: string; aliases: string[]; tags: string[]; focus: string; source: string;
  sources?: string[];
}
const ranking = 'https://www.ceea500.org.cn/news/lists/47/dt.html';
const internet = 'https://www.isc.org.cn/article/27836120793083904.html';
const brands = 'https://www.sem.tsinghua.edu.cn/2026zhongguoshangshigongsipinpaijiazhibangfenxibaogao.pdf';
const state = 'https://wap.sasac.gov.cn/n2588045/n27271785/n27271792/c14159097/content.html';
const entry = (name: string, aliases: string[], tags: string[], focus: string, source: string): CompanyReference => ({ name, aliases, tags, focus, source });
// Curated browsing labels, not legal ownership/size certifications. Exact aliases only.
export const companyReferences: CompanyReference[] = [
  ...[
    ['腾讯', '腾讯科技（深圳）有限公司'], ['阿里巴巴', '阿里巴巴集团'], ['字节跳动', '抖音'],
    ['百度', '北京百度网讯科技有限公司'], ['美团', '北京三快在线科技有限公司'], ['京东', '京东集团'],
    ['拼多多', '上海寻梦信息技术有限公司'], ['网易', '网易（杭州）网络有限公司'], ['小米', '小米科技有限责任公司'],
    ['快手', '快手科技'], ['滴滴', '滴滴出行'], ['携程', '携程集团'], ['哔哩哔哩', 'B站'],
    ['三七互娱', '三七互娱网络科技集团股份有限公司'], ['三六零', '360'], ['得物', '得物App'],
    ['贝壳', '贝壳找房'], ['蚂蚁集团', '蚂蚁'],
  ].map(([name, alias]) => entry(name, [alias], ['大厂'], '互联网与数字服务；综合实力榜参考', internet)),
  ...[
    ['华为', '华为技术有限公司'], ['中兴通讯', '中兴通讯股份有限公司'], ['联想', '联想（北京）有限公司'],
    ['vivo', '维沃移动通信有限公司'], ['OPPO', 'OPPO广东移动通信有限公司'], ['京东方', '京东方科技集团股份有限公司'],
    ['宁德时代', '宁德时代新能源科技股份有限公司'], ['奇瑞', '奇瑞汽车股份有限公司'],
    ['迈瑞医疗', '深圳迈瑞生物医疗电子股份有限公司'], ['联影医疗', '上海联影医疗科技股份有限公司'],
    ['阳光电源', '阳光电源股份有限公司'], ['海康威视', '杭州海康威视数字技术股份有限公司'],
    ['中联重科', '中联重科股份有限公司'], ['隆基绿能', '隆基绿能科技股份有限公司'],
  ].map(([name, alias]) => entry(name, [alias], ['大厂'], '通信、制造、医疗或能源；科创与新经济榜参考', ranking)),
  ...[
    ['比亚迪', '比亚迪股份有限公司'], ['美的', '美的集团股份有限公司'], ['贵州茅台', '贵州茅台酒股份有限公司'],
    ['工商银行', '中国工商银行股份有限公司'], ['建设银行', '中国建设银行股份有限公司'],
    ['农业银行', '中国农业银行股份有限公司'], ['上汽集团', '上海汽车集团股份有限公司'],
  ].map(([name, alias]) => entry(name, [alias], ['大厂'], '汽车、消费、金融；品牌价值榜参考（不据此推断所有制）', brands)),
  ...[
    ['国家电网', '国家电网有限公司'], ['南方电网', '中国南方电网有限责任公司'],
    ['中国移动', '中国移动通信集团有限公司'], ['中国电信', '中国电信集团有限公司'], ['中国联通', '中国联合网络通信集团有限公司'],
    ['中国石油', '中国石油天然气集团有限公司'], ['中国石化', '中国石油化工集团有限公司'],
    ['中国建筑', '中国建筑集团有限公司'], ['中国中铁', '中国铁路工程集团有限公司'],
    ['中国中车', '中国中车集团有限公司'], ['中粮集团', '中粮集团有限公司'], ['华润集团', '华润（集团）有限公司'],
    ['招商局', '招商局集团有限公司'], ['国药集团', '中国医药集团有限公司'],
    ['中国电子', '中国电子信息产业集团有限公司'], ['中国电科', '中国电子科技集团有限公司'],
    ['中国航空工业', '中国航空工业集团有限公司'], ['中国航天科技', '中国航天科技集团有限公司'],
  ].map(([name, alias]) => entry(name, [alias], ['国企', '大厂'], '中央企业；国资委名录，不自动推及同名供应商或子公司', state)),
  entry('西门子', ['Siemens', '西门子（中国）有限公司'], ['外企', '大厂'], '工业、基础设施、交通与医疗技术', 'https://www.siemens.com/zh-cn/company/about/siemens-in-china/'),
  entry('博世', ['Bosch', '博世（中国）投资有限公司'], ['外企', '大厂'], '汽车与出行技术', 'https://www.bosch-mobility.com/zh/company/regions/china/'),
  entry('微软', ['Microsoft', '微软（中国）有限公司'], ['外企', '大厂'], '软件与云服务', 'https://www.microsoft.com/zh-cn/about/'),
  entry('宝洁', ['P&G', '宝洁（中国）有限公司'], ['外企', '大厂'], '日用消费品', 'https://www.pg.com.cn/'),
  entry('施耐德电气', ['Schneider Electric', '施耐德电气（中国）有限公司'], ['外企', '大厂'], '能源管理与自动化', 'https://www.schneider-electric.cn/zh/about-us/'),
  entry('金蝶', ['金蝶软件（中国）有限公司'], ['中厂'], '企业软件；科创榜参考，中厂为编辑分组', ranking),
  entry('东软', ['东软集团', '东软集团股份有限公司'], ['中厂'], '软件服务；科创榜参考，中厂为编辑分组', ranking),
  entry('柏楚电子', ['上海柏楚电子科技股份有限公司'], ['中厂', '专精'], '激光切割控制系统与工业软件', 'https://www.bochu.com/'),
  entry('绿的谐波', ['苏州绿的谐波传动科技股份有限公司'], ['中厂', '专精'], '谐波减速器与精密传动', 'https://www.leaderdrive.com/about/'),
  entry('安图生物', ['郑州安图生物工程股份有限公司'], ['中厂', '专精'], '体外诊断试剂与仪器', 'https://www.autobio.com.cn/'),
  entry('洛可可', ['洛可可设计'], ['专精'], '工业与产品设计服务', 'https://new.lkkdesign.com/about'),
  entry('Obsidian', [], ['小而美', '专精'], '独立团队的知识管理软件；官网介绍为小团队', 'https://obsidian.md/about'),
  entry('Shiny Frog', [], ['小而美', '专精'], 'Bear 等应用的独立开发团队', 'https://shinyfrog.net/'),
  entry('三顿半', ['SATURNBIRD'], ['小而美', '专精'], '精品咖啡产品；精品品牌参考，不代表员工规模小', 'https://saturnbird.cn/h-col-108.html'),
  entry('木墨', ['MUMO'], ['小而美', '专精'], '家具与生活方式设计；精品品牌参考', 'https://www.mumolife.com/about.html'),
  entry('如恩设计', ['Neri&Hu', '如恩设计研究室'], ['小而美', '专精'], '建筑、室内与产品设计；设计工作室参考', 'https://www.neriandhu.com/en/about'),
];
export const referencesReviewedAt = '2026-11-07';
const aliasKey = (name: string) => name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

const aliasIndex = new Map(companyReferences.flatMap(company => [company.name, ...company.aliases].map(alias => [aliasKey(alias), company] as const)));
export function classifyCompany(name: string, disclosedNature: string) {
  const reference = aliasIndex.get(aliasKey(name));
  const tags = new Set(reference?.tags || []);
  if (/^(国企|央企|国有企业|国有独资|国有控股|央国企)$/.test(disclosedNature)) tags.add('国企');
  if (/^(外企|外商独资|外资企业|外资\(欧美\)|外资\(非欧美\)|外资（欧美）|外资（非欧美）)$/.test(disclosedNature)) tags.add('外企');
  const verifiedPrivate = /^(民营|民企|民营企业|私营|私营企业)$/.test(disclosedNature);
  // The remaining-company bucket is requested by the user; its label must not assert ownership.
  if (!tags.size || (verifiedPrivate && !tags.has('大厂') && !tags.has('中厂'))) tags.add('民企 / 小厂');
  const unverified = !reference && !verifiedPrivate && !tags.has('国企') && !tags.has('外企');
  return { tags: [...tags], reference, fallback: unverified,
    label: unverified ? '其他企业 · 待核实' : [...tags].join(' · ') };
}
