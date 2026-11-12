import type { CompanyReference } from '@/utils/jobApplication/companies';

const sh = 'https://www.shanghai.gov.cn/nw4411/20251113/da4af2a0d11c40e5890ffbdac48c09b5.html';
// Named foreign-invested entities from the Shanghai government report, including JVs.
// These labels do not assert wholly foreign ownership or automatically cover a global brand's subsidiaries.
const foreignEntities: [string, string][] = [
  ['历峰商业有限公司', '消费品'],
  ['路易威登（中国）商业销售有限公司', '消费品'],
  ['强生（上海）医疗器材有限公司', '医疗器材'],
  ['罗氏诊断产品（上海）有限公司', '体外诊断'],
  ['上汽大众汽车有限公司', '汽车；合资企业'],
  ['特斯拉（上海）有限公司', '汽车'],
  ['上汽通用汽车有限公司', '汽车；合资企业'],
  ['联合汽车电子有限公司', '汽车电子；合资企业'],
  ['泰科电子（上海）有限公司', '电子'],
  ['苹果电脑贸易（上海）有限公司', '消费电子'],
  ['上海三星半导体有限公司', '半导体'],
  ['达功（上海）电脑有限公司', '电脑制造'],
  ['上海近铁国际物流有限公司', '物流'],
  ['晟碟半导体（上海）有限公司', '半导体'],
  ['保时捷（中国）汽车销售有限公司', '汽车'],
  ['捷豹路虎（中国）投资有限公司', '汽车'],
  ['迅销（中国）商贸有限公司', '服饰零售'],
  ['上海勃林格殷格翰药业有限公司', '生物医药'],
  ['汇丰银行（中国）有限公司', '银行'],
  ['渣打银行（中国）有限公司', '银行'],
];
export const internationalReferences: CompanyReference[] = [
  ...foreignEntities.map(([name, focus]) => ({
    name: name.replace(/有限公司$/, ''), aliases: [name], tags: ['外企'],
    focus: `${focus}；上海 2024 年度外商投资企业百强报道列名主体`, source: sh,
  })),
  { name: 'SAP', aliases: [], tags: ['外企', '大厂', '专精'], focus: '企业应用与商业 AI；集团品牌，不自动关联代理商', source: 'https://www.sap.cn/about/company.html' },
  { name: '任天堂', aliases: ['Nintendo', '任天堂株式会社'], tags: ['外企', '大厂', '专精'], focus: '游戏软硬件；日本集团品牌', source: 'https://www.nintendo.co.jp/corporate/outline/index.html' },
  { name: '椰岛游戏', aliases: ['上海可那信息科技有限公司'], tags: ['小而美', '专精'], focus: '原创游戏制作与发行；独立创作品牌参考', source: 'https://www.coconut.is/' },
  { name: 'Supergiant Games', aliases: [], tags: ['外企', '小而美', '专精'], focus: '独立游戏工作室，聚焦单个游戏项目；非当前招聘承诺', source: 'https://www.supergiantgames.com/team/' },
  { name: 'Cultured Code', aliases: [], tags: ['小而美', '专精'], focus: 'Things 任务管理应用；独立产品团队参考', source: 'https://culturedcode.com/about/' },
  { name: 'nendo', aliases: ['nendo, Inc'], tags: ['外企', '小而美', '专精'], focus: '东京设计工作室；精品设计分组，不代表员工规模或待遇', source: 'https://www.nendo.jp/en/about/' },
];
