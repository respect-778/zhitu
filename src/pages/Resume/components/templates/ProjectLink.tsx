import type React from 'react'
import type { GlobalSettings, Project } from '@/types/resume'
import { getProjectLinkText, normalizeProjectHref } from '@/utils/formatBasicField'

interface Props {
  project: Project
  globalSettings?: GlobalSettings
}

const ProjectLink: React.FC<Props> = ({ project, globalSettings }) => {
  const text = getProjectLinkText(project)
  const href = normalizeProjectHref(project.link)

  if (!text || !href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        marginTop: 2,
        fontSize: globalSettings?.baseFontSize || 13,
        color: globalSettings?.themeColor || '#1677ff',
        textDecoration: 'underline',
        overflowWrap: 'anywhere',
      }}
    >
      {text}
    </a>
  )
}

export default ProjectLink
