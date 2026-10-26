import type { MentorPersona } from '@/types/path'

export const MENTORS: MentorPersona[] = [
  {
    id: 'feynman',
    name: 'Richard Feynman',
    nameZh: '费曼',
    avatar: '/imgs/mentors/feynman.jpg',
    tagline: '如果不能简单解释，就是没懂',
    category: '科学家',
  },
  {
    id: 'naval',
    name: 'Naval Ravikant',
    nameZh: 'Naval',
    avatar: '/imgs/mentors/naval.jpg',
    tagline: '杠杆与复利思维',
    category: '投资人',
  },
  {
    id: 'paul-graham',
    name: 'Paul Graham',
    nameZh: 'PG',
    avatar: '/imgs/mentors/pg.jpg',
    tagline: '做不可扩展的事',
    category: 'YC 创始人',
  },
  {
    id: 'zhangxuefeng',
    name: '张雪峰',
    nameZh: '张雪峰',
    avatar: '/imgs/mentors/zxf.jpg',
    tagline: '选择比努力重要',
    category: '规划师',
  },
  {
    id: 'elon-musk',
    name: 'Elon Musk',
    nameZh: '马斯克',
    avatar: '/imgs/mentors/musk.jpg',
    tagline: '第一性原理思考',
    category: '创业者',
  },
]

export const getMentor = (id: string) => MENTORS.find(m => m.id === id)
