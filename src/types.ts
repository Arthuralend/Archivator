export type Format = 'zip' | '7z' | 'rar';
export type Level = 'store' | 'fastest' | 'fast' | 'normal' | 'good' | 'best';

export interface FsItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
}

export interface ArcEntry {
  path: string;
  isDir: boolean;
  size: number;
  packed: number;
  modified: number | null;
  crc: string;
  encrypted: boolean;
  method: string;
}

export interface ArcListing {
  type: string;
  physicalSize: number;
  solid: boolean;
  entries: ArcEntry[];
  hasEncrypted?: boolean;
}

export type OpResult<T> = { ok: true; result: T } | { ok: false; error: string; needPassword?: boolean; cancelled?: boolean };

export interface Row {
  key: string;
  name: string;
  isDir: boolean;
  isUp?: boolean;
  isArchive?: boolean;
  size: number;
  packed?: number;
  modified: number | null;
  crc?: string;
  encrypted?: boolean;
  /** путь в ФС либо путь внутри архива */
  target: string;
}

export interface AddOptions {
  archive: string;
  files: string[];
  format: Format;
  level: Level;
  password?: string;
  encryptNames?: boolean;
  deleteAfter?: boolean;
  volumeSize?: string;
  solid?: boolean;
}

export interface ExtractOptions {
  dest: string;
  overwrite: 'overwrite' | 'skip' | 'rename';
  password?: string;
}

declare global {
  interface Window {
    api: {
      home(): Promise<string>;
      listDir(dir: string): Promise<FsItem[]>;
      stat(p: string): Promise<{ isDir: boolean; size: number } | null>;
      exists(p: string): Promise<boolean>;
      openArchiveDialog(): Promise<string | null>;
      chooseDir(def?: string): Promise<string | null>;
      pickFiles(): Promise<string[]>;
      saveArchiveDialog(def?: string): Promise<string | null>;
      openPath(p: string): Promise<string>;
      reveal(p: string): Promise<void>;
      tools(): Promise<{ sevenZip: boolean; rar: boolean; sevenZipPath: string | null; rarPath: string | null }>;
      list(p: { archive: string; password?: string }): Promise<OpResult<ArcListing>>;
      extract(p: any, opId?: string): Promise<OpResult<{ warnings?: boolean }>>;
      test(p: any, opId?: string): Promise<OpResult<{ ok: boolean; output: string }>>;
      add(p: AddOptions, opId?: string): Promise<OpResult<{ ok: boolean; warnings?: boolean }>>;
      remove(p: any): Promise<OpResult<{ ok: boolean }>>;
      view(p: any, opId?: string): Promise<OpResult<string>>;
      cancel(opId: string): Promise<void>;
      pathForFile(f: File): string;
      onProgress(cb: (d: { opId: string; percent: number }) => void): () => void;
      onMenu(cb: (cmd: string) => void): () => void;
      onOpenPath(cb: (p: string) => void): () => void;
    };
  }
}
