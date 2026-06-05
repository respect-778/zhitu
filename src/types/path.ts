/** 虚拟文件系统节点（文件或文件夹） */
export interface VFile {
  id: string
  name: string
  type: 'file' | 'folder'
  parentId: string | null
  content?: string
  fileType?: 'note' | 'plan' | 'weekly_summary' | 'article_cite' | 'chat_save' | 'growth_record'
  metadata?: {
    sourceId?: string
    sourceType?: 'community' | 'chat'
    taskId?: string
    mentorId?: string
    tags?: string[]
    createdAt: string
    updatedAt: string
  }
  order: number
}

/** 成长计划 */
export interface GrowthPlan {
  id: string
  userId: string
  mentorId: string
  status: 'onboarding' | 'active' | 'completed' | 'paused'
  profile: {
    major: string
    grade: string
    direction: string
    goalDescription: string
  }
  weeklyGoals: WeeklyGoal[]
  startDate: string
  endDate: string
  finalSummary?: string
  createdAt: string
  updatedAt: string
}

/** 每周目标 */
export interface WeeklyGoal {
  id: string
  weekNumber: number
  title: string
  status: 'upcoming' | 'active' | 'completed'
  tasks: GrowthTask[]
  weeklySummary?: string
  summaryGeneratedAt?: string
}

/** 成长任务 */
export interface GrowthTask {
  id: string
  title: string
  description?: string
  status: 'pending' | 'completed'
  completedAt?: string
  reflection?: string
}

/** 导师人格 */
export interface MentorPersona {
  id: string
  name: string
  nameZh: string
  avatar: string
  tagline: string
  category: string
}

/** 侧栏面板类型 */
export type SidebarPanel = 'close' | 'files' | 'search' | 'plan' | 'mentor'

/** 关系图谱节点 */
export interface GraphNode {
  id: string
  name: string
  x?: number
  y?: number
  vx?: number
  vy?: number
}

/** 关系图谱连线 */
export interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: 'wikilink' | 'folder' | 'tag'
}
