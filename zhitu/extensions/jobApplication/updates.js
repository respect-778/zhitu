// Store releases use Chrome's downloaded-update event. Only local development
// builds inspect their own packaged manifest; never download/evaluate remote code.
export function createUpdater(runtime, isIdle, readManifest = async () =>
  (await fetch(runtime.getURL('manifest.json'), { cache: 'no-store' })).json(), schedule = setTimeout) {
  const loaded = runtime.getManifest();
  let pending = false, scheduled = false, lastCheck = 0;
  function flush() {
    if (!pending || scheduled || !isIdle()) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      if (pending && isIdle()) runtime.reload();
    }, 250);
  }
  runtime.onUpdateAvailable.addListener(() => { pending = true; flush(); });
  return {
    async check() {
      if (loaded.version_name?.endsWith('-local') && isIdle() && Date.now() - lastCheck > 10000) {
        lastCheck = Date.now();
        try { pending ||= (await readManifest()).version !== loaded.version; } catch { /* A failed check must not block job reading. */ }
      }
      flush();
      return pending;
    },
    flush,
  };
}
