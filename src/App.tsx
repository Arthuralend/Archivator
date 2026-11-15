import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AddOptions, ArcListing, ExtractOptions, Format, OpResult, Row } from './types';
import {
  IconAdd,
  IconDelete,
  IconExtract,
  IconFind,
  IconInfo,
  IconTest,
  IconView,
  IconWizard,
  SmallArchive,
  SmallFile,
  SmallFolder,
  SmallUp,
  UpButton,
} from './icons';
import {
  AboutDialog,
  AddDialog,
  ConfirmDialog,
  ExtractDialog,
  InfoDialog,
  MessageDialog,
  PasswordDialog,
  ProgressDialog,
} from './dialogs';
import {
  ARCHIVE_RE,
  archiveFormatOf,
  archiveRows,
  basename,
  dirname,
  extOf,
  fmtDate,
  fmtShort,
  fmtSize,
  join,
  sortRows,
  stripExt,
  typeName,
} from './util';

interface OpenArchive extends ArcListing {
  path: string;
  password?: string;
}

type Dialog =
  | { kind: 'add'; files: string[]; format?: Format }
  | { kind: 'extract'; archives: string[]; files: string[]; defaultDest: string; count: string }
  | { kind: 'password'; archive: string; resolve: (p: string | null) => void }
  | { kind: 'message'; title: string; text: string; type?: 'info' | 'error' | 'ok'; reveal?: string }
  | { kind: 'confirm'; title: string; text: string; onYes: () => void }
  | { kind: 'progress'; title: string; subtitle: string; opId: string }
  | { kind: 'info' }
  | { kind: 'about' };

const COLUMNS = [
  { key: 'name', label: 'Имя', width: 260 },
  { key: 'size', label: 'Размер', width: 100, right: true },
  { key: 'packed', label: 'Сжат', width: 100, right: true, archiveOnly: true },
  { key: 'type', label: 'Тип', width: 140 },
  { key: 'modified', label: 'Изменён', width: 130 },
  { key: 'crc', label: 'CRC32', width: 80, archiveOnly: true },
];

let opCounter = 0;

export default function App() {
  const [fsDir, setFsDir] = useState('');
  const [fsItems, setFsItems] = useState<Row[]>([]);
  const [arc, setArc] = useState<OpenArchive | null>(null);
  const [arcDir, setArcDir] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [sort, setSort] = useState({ key: 'name', asc: true });
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('');
  const [showFind, setShowFind] = useState(false);
  const [tools, setTools] = useState({ sevenZip: true, rar: false, sevenZipPath: null as string | null, rarPath: null as string | null });
  const [dragOver, setDragOver] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const archiveMode = !!arc;
  const pushDialog = (d: Dialog) => setDialogs((s) => [...s, d]);
  const popDialog = (d: Dialog) => setDialogs((s) => s.filter((x) => x !== d));
  const message = (title: string, text: string, type: 'info' | 'error' | 'ok' = 'info', reveal?: string) =>
    pushDialog({ kind: 'message', title, text, type, reveal });

  // ---------- загрузка ----------

  const loadDir = useCallback(async (dir: string) => {
    try {
      const items = await window.api.listDir(dir);
      setFsItems(
        items.map((i) => ({
          key: i.path,
          name: i.name,
          isDir: i.isDir,
          isArchive: !i.isDir && ARCHIVE_RE.test(i.name),
          size: i.isDir ? 0 : i.size,
          modified: i.modified,
          target: i.path,
        }))
      );
      setFsDir(dir);
      setSelected(new Set());
      setArc(null);
      setArcDir('');
    } catch (e: any) {
      message('Ошибка', `Не удалось открыть папку\n${dir}\n${e?.message || ''}`, 'error');
    }
  }, []);

  const askPassword = (archive: string) =>
    new Promise<string | null>((resolve) => pushDialog({ kind: 'password', archive, resolve }));

  /** Выполняет операцию, при необходимости запрашивая пароль. */
  async function withPassword<T>(
    archive: string,
    password: string | undefined,
    fn: (pw?: string) => Promise<OpResult<T>>
  ): Promise<{ res: OpResult<T>; password?: string }> {
    let pw = password;
    for (;;) {
      const res = await fn(pw);
      if (res.ok || !res.needPassword) return { res, password: pw };
      const next = await askPassword(archive);
      if (next == null) return { res: { ok: false, error: '', cancelled: true }, password: pw };
      pw = next;
    }
  }

  const openArchive = useCallback(async (path: string) => {
    const { res, password } = await withPassword(path, undefined, (pw) => window.api.list({ archive: path, password: pw }));
    if (!res.ok) {
      if (!res.cancelled) message('Ошибка', `Не удалось открыть архив\n${basename(path)}\n\n${res.error}`, 'error');
      return;
    }
    setFsDir(dirname(path));
    setArc({ ...res.result, path, password });
    setArcDir('');
    setSelected(new Set());
    setFilter('');
  }, []);

  const reloadArchive = async () => {
    if (!arc) return;
    const res = await window.api.list({ archive: arc.path, password: arc.password });
    if (res.ok) setArc({ ...res.result, path: arc.path, password: arc.password });
  };

  const openAny = useCallback(
    async (p: string) => {
      const st = await window.api.stat(p);
      if (!st) return;
      if (st.isDir) loadDir(p);
      else openArchive(p);
    },
    [loadDir, openArchive]
  );

  useEffect(() => {
    window.api.home().then((h) => loadDir(h));
    window.api.tools().then(setTools);
    return window.api.onProgress(({ opId, percent }) => setProgress((p) => ({ ...p, [opId]: percent })));
  }, [loadDir]);

  useEffect(() => window.api.onOpenPath(openAny), [openAny]);

  // ---------- строки ----------

  const rows: Row[] = useMemo(() => {
    let base = arc ? archiveRows(arc.entries, arcDir) : fsItems;
    if (filter) {
      const f = filter.toLowerCase();
      base = arc
        ? arc.entries
            .filter((e) => !e.isDir && e.path.toLowerCase().includes(f))
            .map((e) => ({ key: e.path, name: e.path, isDir: false, size: e.size, packed: e.packed, modified: e.modified, crc: e.crc, encrypted: e.encrypted, target: e.path }))
        : base.filter((r) => r.name.toLowerCase().includes(f));
    }
    const sorted = sortRows(base, sort.key, sort.asc);
    const canUp = arc ? true : fsDir !== '/';
    return canUp && !filter
      ? [{ key: '..', name: '..', isDir: true, isUp: true, size: 0, modified: null, target: '..' }, ...sorted]
      : sorted;
  }, [arc, arcDir, fsItems, sort, filter, fsDir]);

  const selectedRows = rows.filter((r) => selected.has(r.key) && !r.isUp);

  // ---------- навигация ----------

  const goUp = () => {
    setFilter('');
    if (arc) {
      if (arcDir) {
        const i = arcDir.lastIndexOf('/');
        const prev = arcDir;
        setArcDir(i === -1 ? '' : arcDir.slice(0, i));
        setSelected(new Set([prev]));
      } else {
        const p = arc.path;
        loadDir(dirname(p)).then(() => setSelected(new Set([p])));
      }
    } else if (fsDir !== '/') {
      const prev = fsDir;
      loadDir(dirname(fsDir)).then(() => setSelected(new Set([prev])));
    }
  };

  const activate = (row: Row) => {
    if (row.isUp) return goUp();
    if (arc) {
      if (row.isDir) {
        setFilter('');
        setArcDir(row.target);
        setSelected(new Set());
      } else viewFile(row);
    } else if (row.isDir) loadDir(row.target);
    else if (row.isArchive) openArchive(row.target);
    else window.api.openPath(row.target);
  };

  // ---------- операции ----------

  async function runOp<T>(title: string, subtitle: string, fn: (opId: string) => Promise<T>): Promise<T> {
    const opId = `op${++opCounter}`;
    const d: Dialog = { kind: 'progress', title, subtitle, opId };
    pushDialog(d);
    try {
      return await fn(opId);
    } finally {
      popDialog(d);
      setProgress((p) => {
        const { [opId]: _, ...rest } = p;
        return rest;
      });
    }
  }

  const cmdAdd = async (filesOverride?: string[]) => {
    if (arc) {
      const files = filesOverride ?? (await window.api.pickFiles());
      if (!files.length) return;
      const fmt = archiveFormatOf(arc.path);
      if (!fmt) return message('Добавление', 'Добавлять файлы можно только в ZIP, 7Z и RAR архивы.', 'error');
      const res = await runOp('Добавление в архив', basename(arc.path), (id) =>
        window.api.add({ archive: arc.path, files, format: fmt, level: 'normal', password: arc.password }, id)
      );
      if (!res.ok) return !res.cancelled && message('Ошибка', res.error, 'error');
      await reloadArchive();
      return;
    }
    const files = filesOverride ?? selectedRows.map((r) => r.target);
    if (!files.length) return message('Добавление', 'Выделите файлы и папки, которые нужно добавить в архив.');
    pushDialog({ kind: 'add', files });
  };

  const doAdd = async (o: AddOptions) => {
    const res = await runOp('Создание архива', basename(o.archive), (id) => window.api.add(o, id));
    if (!res.ok) return !res.cancelled && message('Ошибка', res.error, 'error');
    await loadDir(fsDir);
    setSelected(new Set([o.archive]));
  };

  const cmdExtract = () => {
    if (arc) {
      const files = selectedRows.map((r) => r.target);
      pushDialog({
        kind: 'extract',
        archives: [arc.path],
        files,
        defaultDest: join(dirname(arc.path), stripExt(basename(arc.path))),
        count: files.length ? `выделено ${files.length}` : 'весь архив',
      });
      return;
    }
    const archives = selectedRows.filter((r) => r.isArchive).map((r) => r.target);
    if (!archives.length) return message('Извлечение', 'Выделите один или несколько архивов.');
    pushDialog({
      kind: 'extract',
      archives,
      files: [],
      defaultDest: archives.length === 1 ? join(fsDir, stripExt(basename(archives[0]))) : fsDir,
      count: archives.length === 1 ? basename(archives[0]) : `${archives.length} архив(а/ов)`,
    });
  };

  const doExtract = async (archives: string[], files: string[], o: ExtractOptions) => {
    for (const a of archives) {
      const dest = archives.length > 1 ? join(o.dest, stripExt(basename(a))) : o.dest;
      const initialPw = o.password ?? (arc?.path === a ? arc.password : undefined);
      const { res } = await runOp('Извлечение', basename(a), (id) =>
        withPassword(a, initialPw, (pw) => window.api.extract({ archive: a, dest, files, password: pw, overwrite: o.overwrite }, id))
      );
      if (!res.ok) {
        if (!res.cancelled) message('Ошибка', `${basename(a)}\n\n${res.error}`, 'error');
        return;
      }
    }
    message('Готово', `Файлы извлечены в\n${o.dest}`, 'ok', o.dest);
    if (!arc) loadDir(fsDir);
  };

  const cmdTest = async () => {
    const targets = arc ? [arc.path] : selectedRows.filter((r) => r.isArchive).map((r) => r.target);
    if (!targets.length) return message('Проверка', 'Выделите архив для проверки.');
    const results: string[] = [];
    for (const a of targets) {
      const { res } = await runOp('Проверка архива', basename(a), (id) =>
        withPassword(a, arc?.path === a ? arc.password : undefined, (pw) => window.api.test({ archive: a, password: pw }, id))
      );
      if (!res.ok && res.cancelled) return;
      results.push(res.ok ? `✓ ${basename(a)} — ошибок не обнаружено` : `✕ ${basename(a)}\n   ${res.error}`);
    }
    const allOk = results.every((r) => r.startsWith('✓'));
    message('Результаты проверки', results.join('\n'), allOk ? 'ok' : 'error');
  };

  const viewFile = async (row?: Row) => {
    const r = row ?? selectedRows.find((x) => !x.isDir);
    if (!r) return;
    if (!arc) return r.isArchive ? openArchive(r.target) : window.api.openPath(r.target);
    const { res, password } = await runOp('Просмотр', r.name, (id) =>
      withPassword(arc.path, arc.password, (pw) => window.api.view({ archive: arc.path, file: r.target, password: pw }, id))
    );
    if (password && password !== arc.password) setArc({ ...arc, password });
    if (!res.ok && !res.cancelled) message('Ошибка', res.error, 'error');
  };

  const cmdDelete = () => {
    if (!selectedRows.length) return;
    const names = selectedRows.map((r) => r.name);
    const text = `Удалить ${names.length === 1 ? `«${names[0]}»` : `${names.length} объекта(ов)`}${arc ? ' из архива' : ' в Корзину'}?`;
    pushDialog({
      kind: 'confirm',
      title: 'Подтверждение удаления',
      text,
      onYes: async () => {
        if (arc) {
          const res = await window.api.remove({ archive: arc.path, files: selectedRows.map((r) => r.target), type: arc.type, password: arc.password });
          if (!res.ok) return message('Ошибка', res.error, 'error');
          setSelected(new Set());
          await reloadArchive();
        } else {
          message('Удаление', 'Удаление файлов на диске выполняйте в Finder — Archivator не трогает ваши файлы.');
        }
      },
    });
  };

  const cmdInfo = () => {
    if (arc) return pushDialog({ kind: 'info' });
    const r = selectedRows[0];
    if (r?.isArchive) return openArchive(r.target).then(() => pushDialog({ kind: 'info' }));
    const total = selectedRows.reduce((s, x) => s + x.size, 0);
    message('Информация', `Папка: ${fsDir}\nВыделено: ${selectedRows.length}\nОбъём (без вложенных папок): ${fmtShort(total)}`);
  };

  const cmdWizard = async () => {
    const files = await window.api.pickFiles();
    if (!files.length) return;
    if (files.length === 1 && ARCHIVE_RE.test(files[0])) {
      const a = files[0];
      return pushDialog({ kind: 'extract', archives: [a], files: [], defaultDest: join(dirname(a), stripExt(basename(a))), count: basename(a) });
    }
    pushDialog({ kind: 'add', files });
  };

  const cmdOpen = async () => {
    const p = await window.api.openArchiveDialog();
    if (p) openArchive(p);
  };

  const cmdChdir = async () => {
    const p = await window.api.chooseDir(fsDir);
    if (p) loadDir(p);
  };

  // ---------- меню и клавиатура ----------

  const handlers = useRef<Record<string, () => void>>({});
  handlers.current = {
    open: cmdOpen,
    chdir: cmdChdir,
    add: () => cmdAdd(),
    extract: cmdExtract,
    test: cmdTest,
    view: () => viewFile(),
    delete: cmdDelete,
    info: cmdInfo,
    about: () => pushDialog({ kind: 'about' }),
    selectAll: () => setSelected(new Set(rows.filter((r) => !r.isUp).map((r) => r.key))),
  };
  useEffect(() => window.api.onMenu((cmd) => handlers.current[cmd]?.()), []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (dialogs.length) return;
    const idx = rows.findIndex((r) => r.key === anchor);
    const move = (n: number) => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, (idx < 0 ? -1 : idx) + n))];
      if (!next) return;
      setAnchor(next.key);
      setSelected(new Set([next.key]));
      listRef.current?.querySelector(`[data-key="${CSS.escape(next.key)}"]`)?.scrollIntoView({ block: 'nearest' });
    };
    if (e.key === 'ArrowDown') move(1), e.preventDefault();
    else if (e.key === 'ArrowUp') move(-1), e.preventDefault();
    else if (e.key === 'Enter') {
      const r = rows.find((x) => x.key === anchor);
      if (r) activate(r);
    } else if (e.key === 'Backspace' && !e.metaKey) goUp();
  };

  const clickRow = (e: React.MouseEvent, row: Row) => {
    const next = new Set(e.metaKey ? selected : []);
    if (e.shiftKey && anchor) {
      const a = rows.findIndex((r) => r.key === anchor);
      const b = rows.findIndex((r) => r.key === row.key);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (!rows[i].isUp) next.add(rows[i].key);
    } else if (e.metaKey && selected.has(row.key)) next.delete(row.key);
    else next.add(row.key);
    setSelected(next);
    if (!e.shiftKey) setAnchor(row.key);
  };

  // ---------- drag & drop ----------

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    if (arc) {
      pushDialog({
        kind: 'confirm',
        title: 'Добавление',
        text: `Добавить ${paths.length} объект(ов) в архив ${basename(arc.path)}?`,
        onYes: () => cmdAdd(paths),
      });
    } else if (paths.length === 1 && ARCHIVE_RE.test(paths[0])) openArchive(paths[0]);
    else pushDialog({ kind: 'add', files: paths });
  };

  // ---------- статистика ----------

  const totals = useMemo(() => {
    const items = rows.filter((r) => !r.isUp);
    const sel = items.filter((r) => selected.has(r.key));
    const sum = (a: Row[]) => a.reduce((s, r) => s + r.size, 0);
    const files = (a: Row[]) => a.filter((r) => !r.isDir).length;
    const dirs = (a: Row[]) => a.filter((r) => r.isDir).length;
    return { all: { size: sum(items), files: files(items), dirs: dirs(items) }, sel: { size: sum(sel), count: sel.length } };
  }, [rows, selected]);

  const address = arc ? arc.path + (arcDir ? '/' + arcDir : '') : fsDir;
  const arcStats = useMemo(() => {
    if (!arc) return null;
    const files = arc.entries.filter((e) => !e.isDir);
    const dirSet = new Set<string>();
    arc.entries.forEach((e) => {
      const parts = e.path.split('/');
      for (let i = 1; i < parts.length + (e.isDir ? 1 : 0); i++) dirSet.add(parts.slice(0, i).join('/'));
    });
    return {
      files: files.length,
      folders: dirSet.size,
      size: files.reduce((s, e) => s + e.size, 0),
      packed: files.reduce((s, e) => s + e.packed, 0),
      encrypted: arc.entries.some((e) => e.encrypted),
    };
  }, [arc]);

  const visibleCols = COLUMNS.filter((c) => !c.archiveOnly || archiveMode);
  const gridTemplate = visibleCols.map((c) => (c.key === 'name' ? `minmax(${c.width}px, 1fr)` : `${c.width}px`)).join(' ');

  // ---------- разметка ----------

  const tb = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false, title?: string) => (
    <button className="tb-btn" onClick={onClick} disabled={disabled} title={title || label}>
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div
      className={`app ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="toolbar">
        {tb('Добавить', <IconAdd />, () => cmdAdd(), false, 'Добавить файлы в архив')}
        {tb('Извлечь…', <IconExtract />, cmdExtract, false, 'Извлечь в указанную папку')}
        {tb('Тест', <IconTest />, cmdTest, false, 'Проверить архив')}
        {tb('Просмотр', <IconView />, () => viewFile())}
        {tb('Удалить', <IconDelete />, cmdDelete, !selectedRows.length)}
        <div className="tb-sep" />
        {tb('Найти', <IconFind />, () => setShowFind((v) => !v))}
        {tb('Мастер', <IconWizard />, cmdWizard, false, 'Пошаговый мастер')}
        {tb('Инфо', <IconInfo />, cmdInfo)}
      </div>

      <div className="addressbar">
        <button className="up-btn" onClick={goUp} title="На уровень вверх (Backspace)">
          <UpButton />
        </button>
        <div className="address">
          {arc ? <SmallArchive /> : <SmallFolder />}
          <input
            value={address}
            readOnly={archiveMode}
            onChange={(e) => !archiveMode && setFsDir(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !archiveMode && openAny(fsDir)}
          />
        </div>
      </div>

      {showFind && (
        <div className="findbar">
          <IconFind />
          <input autoFocus placeholder={arc ? 'Поиск по всему архиву…' : 'Фильтр по имени…'} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button
            onClick={() => {
              setFilter('');
              setShowFind(false);
            }}
          >
            Закрыть
          </button>
        </div>
      )}

      {!tools.sevenZip && (
        <div className="warnbar">
          Не найден 7-Zip. Выполните <code>npm run fetch-7z</code> или <code>brew install sevenzip</code>.
        </div>
      )}

      <div className="list" tabIndex={0} onKeyDown={onKeyDown} ref={listRef}>
        <div className="list-head" style={{ gridTemplateColumns: gridTemplate }}>
          {visibleCols.map((c) => (
            <div
              key={c.key}
              className={`th ${c.right ? 'right' : ''}`}
              onClick={() => c.key !== 'crc' && setSort((s) => ({ key: c.key, asc: s.key === c.key ? !s.asc : true }))}
            >
              {c.label}
              {sort.key === c.key && <span className="sort">{sort.asc ? '▲' : '▼'}</span>}
            </div>
          ))}
        </div>
        <div className="list-body" onClick={(e) => e.target === e.currentTarget && setSelected(new Set())}>
          {rows.map((r) => (
            <div
              key={r.key}
              data-key={r.key}
              className={`tr ${selected.has(r.key) ? 'sel' : ''}`}
              style={{ gridTemplateColumns: gridTemplate }}
              onMouseDown={(e) => clickRow(e, r)}
              onDoubleClick={() => activate(r)}
            >
              <div className="td name">
                {r.isUp ? <SmallUp /> : r.isDir ? <SmallFolder /> : r.isArchive ? <SmallArchive /> : <SmallFile ext={extOf(r.name)} />}
                <span className="ellipsis">
                  {r.name}
                  {r.encrypted && '*'}
                </span>
              </div>
              <div className="td right">{r.isUp || (r.isDir && !archiveMode) ? '' : fmtSize(r.size)}</div>
              {archiveMode && <div className="td right">{r.isUp ? '' : fmtSize(r.packed || 0)}</div>}
              <div className="td">{r.isUp ? 'Папка' : typeName(r, archiveMode)}</div>
              <div className="td">{fmtDate(r.modified)}</div>
              {archiveMode && <div className="td mono">{r.isDir ? '' : r.crc}</div>}
            </div>
          ))}
          {rows.length === 0 && <div className="empty">{filter ? 'Ничего не найдено' : 'Папка пуста'}</div>}
        </div>
      </div>

      <div className="statusbar">
        <div className="panel">
          {arc ? <SmallArchive /> : <SmallFolder />}
          {arc ? `${arc.type || 'Архив'}${arcStats?.encrypted ? ', зашифрован' : ''}${arc.solid ? ', непрерывный' : ''}` : 'Папка'}
        </div>
        <div className="panel grow">
          {totals.sel.count
            ? `Выделено ${fmtSize(totals.sel.size)} байт в ${totals.sel.count} объектах`
            : `Всего ${totals.all.dirs ? `${totals.all.dirs} папок и ` : ''}${fmtSize(totals.all.size)} байт в ${totals.all.files} файлах`}
        </div>
      </div>

      {dragOver && <div className="drop-hint">{arc ? 'Отпустите, чтобы добавить в архив' : 'Отпустите, чтобы создать архив или открыть его'}</div>}

      {dialogs.map((d, i) => {
        const close = () => popDialog(d);
        switch (d.kind) {
          case 'add':
            return (
              <AddDialog
                key={i}
                files={d.files}
                rarAvailable={tools.rar}
                onCancel={close}
                onOk={(o) => {
                  close();
                  doAdd(o);
                }}
              />
            );
          case 'extract':
            return (
              <ExtractDialog
                key={i}
                defaultDest={d.defaultDest}
                count={d.count}
                onCancel={close}
                onOk={(o) => {
                  close();
                  doExtract(d.archives, d.files, o);
                }}
              />
            );
          case 'password':
            return (
              <PasswordDialog
                key={i}
                archive={d.archive}
                onCancel={() => {
                  close();
                  d.resolve(null);
                }}
                onOk={(p) => {
                  close();
                  d.resolve(p);
                }}
              />
            );
          case 'message':
            return (
              <MessageDialog
                key={i}
                title={d.title}
                text={d.text}
                kind={d.type}
                onClose={close}
                actions={d.reveal ? [{ label: 'Открыть в Finder', onClick: () => (window.api.openPath(d.reveal!), close()) }] : undefined}
              />
            );
          case 'confirm':
            return (
              <ConfirmDialog
                key={i}
                title={d.title}
                text={d.text}
                onNo={close}
                onYes={() => {
                  close();
                  d.onYes();
                }}
              />
            );
          case 'progress':
            return (
              <ProgressDialog
                key={i}
                title={d.title}
                subtitle={d.subtitle}
                percent={progress[d.opId] ?? null}
                onCancel={() => window.api.cancel(d.opId)}
              />
            );
          case 'info':
            return arc && arcStats ? (
              <InfoDialog
                key={i}
                archive={arc.path}
                type={arc.type}
                files={arcStats.files}
                folders={arcStats.folders}
                size={arcStats.size}
                packed={arcStats.packed}
                physical={arc.physicalSize}
                solid={arc.solid}
                encrypted={arcStats.encrypted}
                onClose={close}
              />
            ) : null;
          case 'about':
            return <AboutDialog key={i} tools={tools} onClose={close} />;
        }
      })}
    </div>
  );
}
