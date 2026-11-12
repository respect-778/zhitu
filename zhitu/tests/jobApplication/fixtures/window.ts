/** Fields exposed by the isolated ATS fixtures and injected autofill script. */
export interface FixtureWindow extends Window {
  fixtureEvents: string[]
  fixtureChanges: number
  fixtureReactChanges: number
  fixtureReactBlurs: number
  fixtureSubmitted?: boolean
  fixtureSaved?: boolean
  makeCustom: (field: Element | null, options: string[]) => void
  setupFeishu: () => void
  setupBeisen: () => void
  __knowviaAutofillCancelled?: string
  __knowviaAutofillRun?: unknown
}
