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

export interface WeeklyGoal {
  id: string
  weekNumber: number
  title: string
  status: 'upcoming' | 'active' | 'completed'
  tasks: GrowthTask[]
  weeklySummary?: string
  summaryGeneratedAt?: string
}

export interface GrowthTask {
  id: string
  title: string
  description?: string
  status: 'pending' | 'completed'
  completedAt?: string
  reflection?: string
}

export interface MentorPersona {
  id: string
  name: string
  nameZh: string
  avatar: string
  tagline: string
  category: string
}

export type SidebarPanel = 'close' | 'files' | 'search' | 'plan' | 'mentor'
