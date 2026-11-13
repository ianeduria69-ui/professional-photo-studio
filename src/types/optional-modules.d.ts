/** Minimal typing for the optional AI background-removal package. */
declare module '@imgly/background-removal' {
  export interface RemoveBackgroundConfig {
    progress?: (key: string, current: number, total: number) => void;
    output?: { format?: string; quality?: number };
    [key: string]: unknown;
  }
  export function removeBackground(image: Blob | File | string, config?: RemoveBackgroundConfig): Promise<Blob>;
}
