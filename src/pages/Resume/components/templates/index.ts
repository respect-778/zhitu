import type React from 'react'
import type { ResumeData } from '@/types/resume'
import MinimalistTemplate from './minimalist'
import ClassicTemplate from './classic'
import ModernTemplate from './modern'
import EditorialTemplate from './editorial'
import CreativeTemplate from './creative'
import ElegantTemplate from './elegant'
import LeftRightTemplate from './leftRight'
import TimelineTemplate from './timeline'

export interface TemplateConfig {
  id: string
  name: string
  desc: string
  defaultThemeColor: string
}

export const TEMPLATES: TemplateConfig[] = [
  { id: 'minimalist', name: '极简', desc: '简洁清晰，适合技术岗', defaultThemeColor: '#000000' },
  { id: 'classic', name: '经典', desc: '传统稳重，适合传统行业', defaultThemeColor: '#1a1a1a' },
  { id: 'modern', name: '现代两栏', desc: '左侧彩色边栏，信息层次分明', defaultThemeColor: '#1677ff' },
  { id: 'editorial', name: '编辑风', desc: '大标题横线，排版精美', defaultThemeColor: '#000000' },
  { id: 'creative', name: '创意', desc: '彩色顶部横幅，视觉冲击力强', defaultThemeColor: '#1677ff' },
  { id: 'elegant', name: '优雅', desc: '居中对称，干净大方', defaultThemeColor: '#333333' },
  { id: 'leftRight', name: '左右栏', desc: '左侧竖线装饰，层次清晰', defaultThemeColor: '#1677ff' },
  { id: 'timeline', name: '时间线', desc: '时间线串联，一目了然', defaultThemeColor: '#1677ff' },
]

interface TemplateProps {
  data: ResumeData
  onSectionClick?: (id: string) => void
  activeSection?: string
}

const TEMPLATE_MAP: Record<string, React.FC<TemplateProps>> = {
  minimalist: MinimalistTemplate,
  classic: ClassicTemplate,
  modern: ModernTemplate,
  editorial: EditorialTemplate,
  creative: CreativeTemplate,
  elegant: ElegantTemplate,
  leftRight: LeftRightTemplate,
  timeline: TimelineTemplate,
}

export function getTemplateComponent(templateId: string): React.FC<TemplateProps> {
  return TEMPLATE_MAP[templateId] ?? MinimalistTemplate
}
