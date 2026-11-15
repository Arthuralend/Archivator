// Собственные SVG-иконки в духе классических Windows-утилит.
import React from 'react';

type P = { size?: number };

const Svg = ({ size = 32, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    {children}
  </svg>
);

/** Иконка архива: коробка с «молнией» */
export const ArchiveBox = ({ size = 32, color = '#7b3fbf' }: P & { color?: string }) => (
  <Svg size={size}>
    <defs>
      <linearGradient id={`ab${color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".55" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="4" y="7" width="24" height="20" rx="2" fill={color} stroke="#2a1450" strokeWidth="1" />
    <rect x="4" y="7" width="24" height="6" rx="2" fill="#000" opacity=".18" />
    <rect x="4" y="7" width="24" height="20" rx="2" fill={`url(#ab${color.slice(1)})`} />
    <rect x="14" y="7" width="4" height="20" fill="#e9d36a" stroke="#8a7420" strokeWidth=".6" />
    {[9, 12, 15, 18, 21, 24].map((y) => (
      <rect key={y} x={y % 2 ? 14.5 : 15.5} y={y} width="2" height="1.4" fill="#8a7420" />
    ))}
    <rect x="13" y="13" width="6" height="4" rx="1" fill="#cfd6df" stroke="#555" strokeWidth=".7" />
  </Svg>
);

export const IconAdd = () => (
  <Svg>
    <g transform="translate(-2,2) scale(.85)">
      <ArchiveBoxInner />
    </g>
    <circle cx="24" cy="9" r="7" fill="#2ea043" stroke="#14532d" />
    <path d="M24 5v8M20 9h8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
  </Svg>
);

const ArchiveBoxInner = () => (
  <>
    <rect x="4" y="7" width="24" height="20" rx="2" fill="#7b3fbf" stroke="#2a1450" />
    <rect x="4" y="7" width="24" height="6" rx="2" fill="#000" opacity=".18" />
    <rect x="14" y="7" width="4" height="20" fill="#e9d36a" stroke="#8a7420" strokeWidth=".6" />
    <rect x="13" y="13" width="6" height="4" rx="1" fill="#cfd6df" stroke="#555" strokeWidth=".7" />
  </>
);

export const IconExtract = () => (
  <Svg>
    <path d="M3 10h9l2 3h15v14H3z" fill="#f4c542" stroke="#9a7413" />
    <path d="M3 14h26v13H3z" fill="#ffd966" stroke="#9a7413" />
    <path d="M16 2v12" stroke="#1f6feb" strokeWidth="3" strokeLinecap="round" />
    <path d="M11 10l5 5 5-5" fill="none" stroke="#1f6feb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconTest = () => (
  <Svg>
    <path d="M7 3h13l6 6v20H7z" fill="#fff" stroke="#667" />
    <path d="M20 3v6h6" fill="#e8e8ee" stroke="#667" />
    <path d="M10 18l4 4 9-10" fill="none" stroke="#2ea043" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconView = () => (
  <Svg>
    <path d="M7 3h13l6 6v20H7z" fill="#fff" stroke="#667" />
    <path d="M10 12h12M10 15h12M10 18h8" stroke="#99a" strokeWidth="1.4" />
    <circle cx="19" cy="21" r="5" fill="#cfe8ff" fillOpacity=".7" stroke="#1f4e8c" strokeWidth="2" />
    <path d="M22.5 24.5l5 5" stroke="#1f4e8c" strokeWidth="3" strokeLinecap="round" />
  </Svg>
);

export const IconDelete = () => (
  <Svg>
    <path d="M7 3h13l6 6v20H7z" fill="#fff" stroke="#667" />
    <path d="M10 11l12 12M22 11L10 23" stroke="#d1242f" strokeWidth="3.4" strokeLinecap="round" />
  </Svg>
);

export const IconFind = () => (
  <Svg>
    <circle cx="10" cy="19" r="7" fill="#3a3f4b" stroke="#111" />
    <circle cx="22" cy="19" r="7" fill="#3a3f4b" stroke="#111" />
    <circle cx="10" cy="19" r="4.2" fill="#6fb3ff" />
    <circle cx="22" cy="19" r="4.2" fill="#6fb3ff" />
    <circle cx="8.6" cy="17.6" r="1.3" fill="#fff" />
    <circle cx="20.6" cy="17.6" r="1.3" fill="#fff" />
    <rect x="13" y="15" width="6" height="4" fill="#3a3f4b" />
    <rect x="6" y="6" width="6" height="8" rx="1" fill="#555c6a" />
    <rect x="20" y="6" width="6" height="8" rx="1" fill="#555c6a" />
  </Svg>
);

export const IconInfo = () => (
  <Svg>
    <circle cx="16" cy="16" r="13" fill="#2f81f7" stroke="#174a9c" />
    <circle cx="16" cy="16" r="13" fill="url(#infoGl)" />
    <defs>
      <linearGradient id="infoGl" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".5" />
        <stop offset=".6" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="9.5" r="2.2" fill="#fff" />
    <rect x="14" y="13" width="4" height="11" rx="1" fill="#fff" />
  </Svg>
);

export const IconWizard = () => (
  <Svg>
    <path d="M5 27L21 11" stroke="#6b4a1f" strokeWidth="3" strokeLinecap="round" />
    <path d="M19 13l3-3" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    <path d="M24 2l1.3 3.2L28.5 6l-3.2 1.3L24 10.5l-1.3-3.2L19.5 6l3.2-.8z" fill="#f5c400" stroke="#a07c00" strokeWidth=".6" />
    <circle cx="28" cy="15" r="1.4" fill="#f5c400" />
    <circle cx="15" cy="5" r="1.1" fill="#f5c400" />
  </Svg>
);

// ---------- маленькие иконки списка (16px) ----------

export const SmallFolder = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <path d="M1 3h5l1.5 2H15v9H1z" fill="#f4c542" stroke="#9a7413" strokeWidth=".8" />
    <path d="M1 6h14v8H1z" fill="#ffd966" stroke="#9a7413" strokeWidth=".8" />
  </svg>
);

export const SmallFile = ({ ext }: { ext?: string }) => {
  const color = extColor(ext);
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 1h7l3 3v11H3z" fill="#fff" stroke="#778" strokeWidth=".8" />
      <path d="M10 1v3h3" fill="#e5e5ea" stroke="#778" strokeWidth=".8" />
      {color && <rect x="4.5" y="8" width="7" height="4.5" rx=".6" fill={color} />}
    </svg>
  );
};

export const SmallArchive = () => (
  <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden>
    <ArchiveBoxInner />
  </svg>
);

export const SmallUp = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <path d="M1 3h5l1.5 2H15v9H1z" fill="#f4c542" stroke="#9a7413" strokeWidth=".8" />
    <path d="M8 13V7M5 9.5L8 6.5l3 3" stroke="#1f6feb" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  </svg>
);

export const UpButton = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
    <path d="M2 4h6l2 2.5h8V17H2z" fill="#f4c542" stroke="#9a7413" />
    <path d="M10 15V8M6.5 11L10 7.5l3.5 3.5" stroke="#1f6feb" strokeWidth="2.2" fill="none" strokeLinecap="round" />
  </svg>
);

function extColor(ext?: string) {
  if (!ext) return null;
  const e = ext.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'svg', 'tiff'].includes(e)) return '#3fb950';
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(e)) return '#d2a8ff';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(e)) return '#f778ba';
  if (['pdf'].includes(e)) return '#e5534b';
  if (['doc', 'docx', 'rtf', 'pages', 'txt', 'md'].includes(e)) return '#539bf5';
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(e)) return '#2ea043';
  if (['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'c', 'cpp', 'h', 'swift', 'go', 'rs', 'java', 'sh'].includes(e))
    return '#f0883e';
  if (['app', 'dmg', 'pkg', 'exe'].includes(e)) return '#8b949e';
  return null;
}
