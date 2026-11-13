export class AiBackgroundUnavailableError extends Error {
  constructor() {
    super(
      'The AI background remover is not installed. Run  npm install @imgly/background-removal  ' +
        'in the project folder, restart "npm run dev", and try again. ' +
        'The first use downloads the model (internet needed once). ' +
        'Meanwhile you can use the built-in plain-background remover or the click-to-erase tool.',
    );
    this.name = 'AiBackgroundUnavailableError';
  }
}

/**
 * Optional AI cut-out using @imgly/background-removal (runs fully in the
 * browser, no server). Throws AiBackgroundUnavailableError when the package
 * is not installed, so the UI can show installation instructions.
 */
export async function removeBackgroundAI(image: Blob, onProgress?: (fraction: number) => void): Promise<Blob> {
  let mod: typeof import('@imgly/background-removal');
  try {
    mod = await import('@imgly/background-removal');
  } catch {
    throw new AiBackgroundUnavailableError();
  }
  try {
    return await mod.removeBackground(image, {
      output: { format: 'image/png' },
      progress: (_key, current, total) => {
        if (onProgress && total > 0) onProgress(Math.min(1, current / total));
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'AI_MODEL_MISSING') throw new AiBackgroundUnavailableError();
    throw new Error(`AI background removal failed: ${(e as Error).message}`);
  }
}
