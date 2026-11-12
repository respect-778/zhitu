/** Root-relative app URLs also work when the app is mounted under the website. */
export function appPath(path: string): string {
  return `${process.env.NEXT_PUBLIC_INTERVIEW_BASE_PATH || ""}${path}`;
}
