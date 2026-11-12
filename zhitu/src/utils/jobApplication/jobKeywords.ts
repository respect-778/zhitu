const agentTerm = /(?<![a-z])agents?(?![a-z])|智能体/i
const developmentTerm = /开发|研发|工程师|程序员|算法|developer|engineer|development/i

export function isAgentDevelopmentSearch(keyword: string): boolean {
  const text = keyword.normalize('NFKC')
  return agentTerm.test(text) && developmentTerm.test(text)
}

export function zhaopinKeyword(keyword: string): string {
  return isAgentDevelopmentSearch(keyword) ? 'Agent' : keyword.trim()
}

export function agentDevelopmentEvidence(job: { title: string; description: string }, keyword: string): string | undefined {
  if (!isAgentDevelopmentSearch(keyword)) return undefined
  const developerTitle = developmentTerm.test(job.title)
  if (developerTitle && agentTerm.test(job.title)) return job.title
  if (!developerTitle && /产品|运营|销售|人力|行政|财务|会计|市场/.test(job.title)) return undefined

  const responsibilitiesStart = job.description.search(/(?:岗位|工作|职位|核心|主要)(?:职责|内容)|职责描述|你将(?:负责|参与)/)
  let responsibilities = responsibilitiesStart >= 0 ? job.description.slice(responsibilitiesStart) : job.description
  const requirementsStart = responsibilities.search(/任职(?:要求|资格|条件)|岗位要求|职位要求|基本要求|能力要求|加分项|技能要求/)
  if (requirementsStart >= 0) responsibilities = responsibilities.slice(0, requirementsStart)
  const sentences = responsibilities.split(/[。；;\n]+/).map(value => value.trim()).filter(Boolean)
  const evidence = sentences.find(sentence => agentTerm.test(sentence)
    && !/熟练使用|至少会|会使用|辅助学习|AI\s*Coding\s*Agent|AI编程助手|编程辅助/i.test(sentence)
    && (developerTitle || /开发|研发|搭建|构建|实现|编排|工程化/.test(sentence)))
  if (!evidence) return undefined
  const match = evidence.search(agentTerm)
  const start = Math.max(0, match - 28)
  const excerpt = evidence.slice(start, start + 100)
  return `${start ? '…' : ''}${excerpt}${start + 100 < evidence.length ? '…' : ''}`
}
