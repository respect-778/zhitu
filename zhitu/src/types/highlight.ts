export interface Highlight {
  id: string
  text: string
  textBefore: string
  textAfter: string
  color: string
  note: string
  createdAt: string
}

export const HIGHLIGHT_COLORS = [
  '#FDE68A',
  '#86EFAC',
  '#93C5FD',
  '#C4B5FD',
  '#FCA5A5',
] as const
