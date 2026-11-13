// Local type-check shim ONLY (the sandbox has no network, so @types/react cannot be installed).
// In a normal install, the real @types/react replaces this file's role.
declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type CSSProperties = { [k: string]: any };
  export type Dispatch<A> = (a: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type FC<P = {}> = (props: P & { children?: ReactNode }) => any;
  export type PropsWithChildren<P = {}> = P & { children?: ReactNode };
  export type SyntheticEvt<T = Element> = { currentTarget: T; target: any; clientX: number; clientY: number; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean; button: number; pointerId: number; [k: string]: any };
  export type PointerEvent<T = Element> = SyntheticEvt<T>;
  export type MouseEvent<T = Element> = SyntheticEvt<T>;
  export type ChangeEvent<T = Element> = SyntheticEvt<T>;
  export type KeyboardEvent<T = Element> = SyntheticEvt<T>;
  export type DragEvent<T = Element> = SyntheticEvt<T>;
  export type WheelEvent<T = Element> = SyntheticEvt<T>;
  export type FormEvent<T = Element> = SyntheticEvt<T>;
  export type FocusEvent<T = Element> = SyntheticEvt<T>;
  export type RefObject<T> = { current: T | null };
  export function useState<S>(init: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useRef<T>(init: T): { current: T };
  export function useRef<T>(init: T | null): RefObject<T>;
  export function useRef<T = undefined>(): { current: T | undefined };
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useContext<T>(c: Context<T>): T;
  export function useSyncExternalStore<T>(sub: (cb: () => void) => () => void, get: () => T, getServer?: () => T): T;
  export function useId(): string;
  export type Context<T> = { Provider: FC<{ value: T }>; _t?: T };
  export function createContext<T>(def: T): Context<T>;
  export function StrictMode(p: { children?: ReactNode }): any;
  export function Fragment(p: { children?: ReactNode }): any;
  export function lazy<T>(f: () => Promise<{ default: T }>): T;
  export function Suspense(p: { children?: ReactNode; fallback?: ReactNode }): any;
  const React: any;
  export default React;
}
declare module 'react/jsx-runtime' {
  export const Fragment: any;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export namespace JSX {
    interface Element {}
    interface IntrinsicElements { [k: string]: any }
    interface ElementChildrenAttribute { children: {} }
    interface IntrinsicAttributes { key?: any }
  }
}
declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(n: any): void; unmount(): void };
}
