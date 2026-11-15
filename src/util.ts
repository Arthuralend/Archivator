import type { ArcEntry, Row } from './types';

export const ARCHIVE_RE = /\.(zip|rar|7z|tar|gz|tgz|bz2|xz|cab|iso|jar)$/i;

export const sep = '/';
export const basename = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p;
export const dirname = (p: string) => {
  const s = p.replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i <= 0 ? '/' : s.slice(0, i);
};
export const join = (a: string, b: string) => (a.endsWith('/') ? a + b : a + '/' + b);
export const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1) : '';
};
export const stripExt = (name: string) => name.replace(/\.(tar\.)?[^.]+$/, '');

export function fmtSize(n: number) {
  return n.toLocaleString('ru-RU');
}

export function fmtShort(n: number) {
  if (n < 1024) return `${n} Б`;
  const u = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

export function fmtDate(t: number | null) {
  if (!t) return '';
  const d = new Date(t);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function typeName(row: Row, archiveMode: boolean) {
  if (row.isUp) return '';
  if (row.isDir) return 'Папка с файлами';
  const e = extOf(row.name).toUpperCase();
  if (!archiveMode && row.isArchive) return `Архив ${e}`;
  return e ? `Файл «${e}»` : 'Файл';
}

/** Строки текущей папки внутри архива (папки достраиваются из путей файлов). */
export function archiveRows(entries: ArcEntry[], dir: string): Row[] {
  const prefix = dir ? dir + '/' : '';
  const map = new Map<string, Row>();
  for (const e of entries) {
    if (prefix && !e.path.startsWith(prefix)) continue;
    const rest = e.path.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf('/');
    const name = slash === -1 ? rest : rest.slice(0, slash);
    const full = prefix + name;
    const isDir = slash !== -1 || e.isDir;
    let row = map.get(name);
    if (!row) {
      row = { key: full, name, isDir, size: 0, packed: 0, modified: null, target: full, crc: '' };
      map.set(name, row);
    }
    if (isDir) row.isDir = true;
    if (!e.isDir) {
      row.size += e.size;
      row.packed = (row.packed || 0) + e.packed;
    }
    if (slash === -1) {
      row.modified = e.modified;
      row.crc = e.crc;
      row.encrypted = e.encrypted;
    } else if (e.modified && (!row.modified || e.modified > row.modified)) {
      row.modified = e.modified;
    }
  }
  return [...map.values()];
}

export function sortRows(rows: Row[], key: string, asc: boolean) {
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    let r = 0;
    switch (key) {
      case 'size':
        r = a.size - b.size;
        break;
      case 'packed':
        r = (a.packed || 0) - (b.packed || 0);
        break;
      case 'modified':
        r = (a.modified || 0) - (b.modified || 0);
        break;
      case 'type':
        r = extOf(a.name).localeCompare(extOf(b.name));
        break;
      default:
        r = 0;
    }
    if (r === 0) r = a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' });
    return r * dir;
  });
}

export function archiveFormatOf(name: string): 'zip' | '7z' | 'rar' | null {
  const e = extOf(name).toLowerCase();
  if (e === 'zip' || e === '7z' || e === 'rar') return e;
  return null;
}
