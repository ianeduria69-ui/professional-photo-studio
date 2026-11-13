const PATHS: Record<string, string> = {
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  select: 'M4 4h4M10 4h4M16 4h4M20 8v4M20 14v4M16 20h-4M10 20H6M4 18v-4M4 12V8',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  brush: 'M18 3l3 3-9 9-3-3zM9 12c-3 0-4 2-4 4 0 1-1 2-2 3 3 1 7 1 8-2 .8-2 .5-4-2-5z',
  eraser: 'M20 20H9l-5-5a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8M7 10l7 7',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  shape: 'M3 21l5-9 5 9zM14 4h7v7h-7z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  wand: 'M5 19L17 7M15 3v3M13.5 4.5h3M20 9v3M18.5 10.5h3M7 3v2M6 4h2M19 17v2M18 18h2',
  picker: 'M14 6l4 4M17 3l4 4-3 3-4-4zM14 8l-9 9v3h3l9-9',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  save: 'M5 3h12l4 4v14H3V3zM7 3v6h8V3M7 21v-7h10v7',
  export: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M11 8v6M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10 6.2A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.6M6.5 7.5A17 17 0 0 0 2 12s4 7 10 7a9 9 0 0 0 4-1',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  flipH: 'M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z',
  flipV: 'M3 12h18M7 8l5-5 5 5zM7 16l5 5 5-5z',
  rotateCw: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  rotateCcw: 'M4 11a8 8 0 1 1 2.3 5.7M4 4v7h7',
  idcard: 'M3 5h18v14H3zM7 10a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM6 16c0-2 2-3 3-3s3 1 3 3M14 9h5M14 13h5',
  template: 'M3 3h18v6H3zM3 13h8v8H3zM15 13h6v8h-6z',
  folder: 'M3 6h6l2 2h10v11H3z',
  download: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  close: 'M5 5l14 14M19 5L5 19',
  check: 'M4 12l5 5L20 6',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5c5 0 9 3 9 7s-4 7-9 7-9-3-9-7 4-7 9-7z',
  line: 'M4 20L20 4',
  help: 'M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 17.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  chevron: 'M6 9l6 6 6-6',
  image: 'M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M8 9a1 1 0 1 0 0 .01',
  print: 'M7 9V3h10v6M7 17H4V9h16v8h-3M7 14h10v7H7z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c0-4 4-6 8-6s8 2 8 6',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.help} />
    </svg>
  );
}
