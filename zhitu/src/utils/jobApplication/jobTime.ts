// Keep collection time separate from recruitment dates. Missing dates stay empty.
export function normalizeJobTime(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const source = String(value).trim()
  if (/^\d{10}(?:\d{3})?$/.test(source)) {
    const timestamp = Number(source) * (source.length === 10 ? 1000 : 1)
    return timestamp >= Date.UTC(2000, 0, 1) && timestamp < Date.UTC(2100, 0, 1) ? new Date(timestamp).toISOString() : ''
  }
  const match = source.match(/^(20\d{2})[-./年](\d{1,2})[-./月](\d{1,2})日?(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?)?(Z|[+-]\d{2}:?\d{2})?$/)
  if (!match) return ''
  const [, year, month, day, hour = '00', minute = '00', second = '00', fraction = '', zone = '+08:00'] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return ''
  const parsed = Date.parse(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour}:${minute}:${second}${fraction}${zone}`)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : ''
}

export function compareJobTimeDescending(a: { published_at?: string; updated_at?: string }, b: { published_at?: string; updated_at?: string }) {
  const left = Date.parse(a.updated_at || a.published_at || '')
  const right = Date.parse(b.updated_at || b.published_at || '')
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.isFinite(left) ? -1 : Number.isFinite(right) ? 1 : 0
  return right - left
}
