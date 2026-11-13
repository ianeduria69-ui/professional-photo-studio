/**
 * Stand-in used by vite.config.ts when the optional package
 * `@imgly/background-removal` is not installed.
 */
export async function removeBackground(): Promise<Blob> {
  const err = new Error('@imgly/background-removal is not installed.');
  (err as Error & { code?: string }).code = 'AI_MODEL_MISSING';
  throw err;
}
