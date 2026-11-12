import { useState } from 'react'
import type { SearchResultRow } from '@/utils/jobApplication/catalogViewModel'

interface SelectionState {
  scope: string
  active: boolean
  rows: Map<string, SearchResultRow>
}

export function useJobSelection(scope: string) {
  const [state, setState] = useState<SelectionState>({ scope, active: false, rows: new Map() })
  if (state.scope !== scope) {
    setState({ scope, active: false, rows: new Map() })
  }

  const current = state.scope === scope ? state : { scope, active: false, rows: new Map<string, SearchResultRow>() }
  const cancel = () => setState({ scope, active: false, rows: new Map() })
  const start = () => setState({ scope, active: true, rows: new Map() })
  const toggle = (jobs: SearchResultRow[], checked: boolean) => {
    setState(previous => {
      const rows = new Map(previous.scope === scope ? previous.rows : [])
      for (const job of jobs) {
        if (checked) rows.set(job.key, job)
        else rows.delete(job.key)
      }
      return { scope, active: true, rows }
    })
  }

  return {
    active: current.active,
    selectedRows: [...current.rows.values()],
    selectedKeys: new Set(current.rows.keys()),
    start,
    cancel,
    toggle,
  }
}
