import React, { useEffect, useRef, useState } from 'react';
import type { AddOptions, ExtractOptions, Format, Level } from './types';
import { ArchiveBox } from './icons';
import { basename, dirname, fmtShort, join, stripExt } from './util';

export function Window({
  title,
  children,
  onClose,
  width = 460,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <div className="win" style={{ width }} role="dialog" aria-label={title}>
        <div className="win-title">
          <span>{title}</span>
          {onClose && (
            <button className="win-close" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          )}
        </div>
        <div className="win-body">{children}</div>
      </div>
    </div>
  );
}

const LEVELS: { v: Level; label: string }[] = [
  { v: 'store', label: 'Без сжатия' },
  { v: 'fastest', label: 'Скоростной' },
  { v: 'fast', label: 'Быстрый' },
  { v: 'normal', label: 'Обычный' },
  { v: 'good', label: 'Хороший' },
  { v: 'best', label: 'Максимальный' },
];

const VOLUMES = [
  { v: '', label: 'Не разбивать' },
  { v: '10m', label: '10 МБ' },
  { v: '100m', label: '100 МБ' },
  { v: '700m', label: '700 МБ (CD)' },
  { v: '4092m', label: '4092 МБ (FAT32)' },
  { v: '4480m', label: '4,7 ГБ (DVD)' },
];

export function AddDialog({
  files,
  defaultFormat = 'zip',
  rarAvailable,
  onOk,
  onCancel,
}: {
  files: string[];
  defaultFormat?: Format;
  rarAvailable: boolean;
  onOk: (o: AddOptions) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<'general' | 'advanced'>('general');
  const baseDir = dirname(files[0]);
  const baseName = files.length === 1 ? stripExt(basename(files[0])) || basename(files[0]) : basename(baseDir) || 'Архив';
  const [format, setFormat] = useState<Format>(defaultFormat);
  const [name, setName] = useState(join(baseDir, `${baseName}.${defaultFormat}`));
  const [level, setLevel] = useState<Level>('normal');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [encryptNames, setEncryptNames] = useState(false);
  const [deleteAfter, setDeleteAfter] = useState(false);
  const [solid, setSolid] = useState(true);
  const [volume, setVolume] = useState('');
  const [error, setError] = useState('');

  const changeFormat = (f: Format) => {
    setFormat(f);
    setName((n) => n.replace(/\.(zip|7z|rar)$/i, '') + '.' + f);
  };

  const browse = async () => {
    const p = await window.api.saveArchiveDialog(name);
    if (p) setName(p);
  };

  const submit = () => {
    if (!name.trim()) return setError('Укажите имя архива');
    if (password && password !== password2) return setError('Пароли не совпадают');
    if (format === 'rar' && !rarAvailable) return setError('Для RAR установите утилиту: brew install rar');
    onOk({
      archive: name.trim(),
      files,
      format,
      level,
      password: password || undefined,
      encryptNames,
      deleteAfter,
      solid,
      volumeSize: volume || undefined,
    });
  };

  return (
    <Window title="Имя и параметры архива" onClose={onCancel} width={520}>
      <div className="tabs">
        <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
          Общие
        </button>
        <button className={tab === 'advanced' ? 'active' : ''} onClick={() => setTab('advanced')}>
          Пароль и дополнительно
        </button>
      </div>
      <div className="tab-page">
        {tab === 'general' ? (
          <>
            <label className="field-label">Имя архива</label>
            <div className="row">
              <input className="grow" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <button onClick={browse}>Обзор…</button>
            </div>
            <div className="cols">
              <fieldset>
                <legend>Формат архива</legend>
                {(['zip', '7z', 'rar'] as Format[]).map((f) => (
                  <label key={f} className="radio">
                    <input type="radio" checked={format === f} onChange={() => changeFormat(f)} />
                    {f.toUpperCase()}
                    {f === 'rar' && !rarAvailable && <span className="muted"> (нужен rar)</span>}
                  </label>
                ))}
              </fieldset>
              <div className="col">
                <label className="field-label">Метод сжатия</label>
                <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                  {LEVELS.map((l) => (
                    <option key={l.v} value={l.v}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <label className="field-label">Разделить на тома размером</label>
                <select value={volume} onChange={(e) => setVolume(e.target.value)}>
                  {VOLUMES.map((v) => (
                    <option key={v.v} value={v.v}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <fieldset>
              <legend>Параметры архивации</legend>
              <label className="check">
                <input type="checkbox" checked={deleteAfter} onChange={(e) => setDeleteAfter(e.target.checked)} />
                Удалить файлы после упаковки
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={solid}
                  disabled={format === 'zip'}
                  onChange={(e) => setSolid(e.target.checked)}
                />
                Создать непрерывный (solid) архив
              </label>
            </fieldset>
          </>
        ) : (
          <>
            <fieldset>
              <legend>Шифрование</legend>
              <label className="field-label">Пароль</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <label className="field-label">Повторите пароль</label>
              <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
              <label className="check">
                <input
                  type="checkbox"
                  checked={encryptNames}
                  disabled={format === 'zip' || !password}
                  onChange={(e) => setEncryptNames(e.target.checked)}
                />
                Шифровать имена файлов {format === 'zip' && <span className="muted">(не поддерживается ZIP)</span>}
              </label>
              {format === 'zip' && <p className="hint">ZIP шифруется AES-256.</p>}
            </fieldset>
            <p className="hint">Файлов к добавлению: {files.length}</p>
          </>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="buttons">
        <button className="default" onClick={submit}>
          OK
        </button>
        <button onClick={onCancel}>Отмена</button>
      </div>
    </Window>
  );
}

export function ExtractDialog({
  defaultDest,
  count,
  onOk,
  onCancel,
}: {
  defaultDest: string;
  count: string;
  onOk: (o: ExtractOptions) => void;
  onCancel: () => void;
}) {
  const [dest, setDest] = useState(defaultDest);
  const [overwrite, setOverwrite] = useState<ExtractOptions['overwrite']>('overwrite');
  const [password, setPassword] = useState('');
  const browse = async () => {
    const p = await window.api.chooseDir(dest);
    if (p) setDest(p);
  };
  return (
    <Window title="Путь и параметры извлечения" onClose={onCancel} width={520}>
      <label className="field-label">Путь для извлечения (будет создан, если не существует)</label>
      <div className="row">
        <input className="grow" value={dest} onChange={(e) => setDest(e.target.value)} autoFocus />
        <button onClick={browse}>Обзор…</button>
      </div>
      <div className="cols">
        <fieldset>
          <legend>Режим перезаписи</legend>
          <label className="radio">
            <input type="radio" checked={overwrite === 'overwrite'} onChange={() => setOverwrite('overwrite')} />
            Перезаписывать без запроса
          </label>
          <label className="radio">
            <input type="radio" checked={overwrite === 'skip'} onChange={() => setOverwrite('skip')} />
            Пропускать существующие
          </label>
          <label className="radio">
            <input type="radio" checked={overwrite === 'rename'} onChange={() => setOverwrite('rename')} />
            Переименовывать автоматически
          </label>
        </fieldset>
        <fieldset className="col">
          <legend>Пароль (если нужен)</legend>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="hint">Извлекается: {count}</p>
        </fieldset>
      </div>
      <div className="buttons">
        <button className="default" onClick={() => dest.trim() && onOk({ dest: dest.trim(), overwrite, password: password || undefined })}>
          OK
        </button>
        <button onClick={onCancel}>Отмена</button>
      </div>
    </Window>
  );
}

export function PasswordDialog({
  archive,
  onOk,
  onCancel,
}: {
  archive: string;
  onOk: (p: string) => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <Window title="Ввод пароля" onClose={onCancel} width={400}>
      <p>
        Введите пароль для зашифрованного архива
        <br />
        <b>{basename(archive)}</b>
      </p>
      <input
        ref={ref}
        type={show ? 'text' : 'password'}
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && pw && onOk(pw)}
      />
      <label className="check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Показывать пароль
      </label>
      <div className="buttons">
        <button className="default" disabled={!pw} onClick={() => onOk(pw)}>
          OK
        </button>
        <button onClick={onCancel}>Отмена</button>
      </div>
    </Window>
  );
}

export function MessageDialog({
  title,
  text,
  kind = 'info',
  onClose,
  actions,
}: {
  title: string;
  text: string;
  kind?: 'info' | 'error' | 'ok';
  onClose: () => void;
  actions?: { label: string; onClick: () => void }[];
}) {
  return (
    <Window title={title} onClose={onClose} width={440}>
      <div className="msg">
        <span className={`msg-icon ${kind}`}>{kind === 'error' ? '✕' : kind === 'ok' ? '✓' : 'i'}</span>
        <pre className="msg-text">{text}</pre>
      </div>
      <div className="buttons">
        {actions?.map((a) => (
          <button key={a.label} onClick={a.onClick}>
            {a.label}
          </button>
        ))}
        <button className="default" onClick={onClose} autoFocus>
          OK
        </button>
      </div>
    </Window>
  );
}

export function ConfirmDialog({
  title,
  text,
  onYes,
  onNo,
}: {
  title: string;
  text: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Window title={title} onClose={onNo} width={420}>
      <div className="msg">
        <span className="msg-icon warn">?</span>
        <pre className="msg-text">{text}</pre>
      </div>
      <div className="buttons">
        <button className="default" onClick={onYes} autoFocus>
          Да
        </button>
        <button onClick={onNo}>Нет</button>
      </div>
    </Window>
  );
}

export function ProgressDialog({
  title,
  subtitle,
  percent,
  onCancel,
}: {
  title: string;
  subtitle: string;
  percent: number | null;
  onCancel: () => void;
}) {
  return (
    <Window title={title} width={440}>
      <p className="ellipsis">{subtitle}</p>
      <div className={`progress ${percent == null ? 'indeterminate' : ''}`}>
        <div className="bar" style={{ width: `${percent ?? 30}%` }} />
      </div>
      <div className="row space">
        <span className="muted">{percent != null ? `${percent}%` : 'Подождите…'}</span>
        <button onClick={onCancel}>Отмена</button>
      </div>
    </Window>
  );
}

export function InfoDialog({
  archive,
  type,
  files,
  folders,
  size,
  packed,
  physical,
  solid,
  encrypted,
  onClose,
}: {
  archive: string;
  type: string;
  files: number;
  folders: number;
  size: number;
  packed: number;
  physical: number;
  solid: boolean;
  encrypted: boolean;
  onClose: () => void;
}) {
  const archSize = physical || packed;
  const ratio = size ? Math.round((archSize / size) * 100) : 0;
  return (
    <Window title={`Информация об архиве ${basename(archive)}`} onClose={onClose} width={440}>
      <div className="info-head">
        <ArchiveBox size={48} />
        <div>
          <b>{basename(archive)}</b>
          <div className="muted">{archive}</div>
        </div>
      </div>
      <table className="info-table">
        <tbody>
          <tr><td>Формат</td><td>{type}</td></tr>
          <tr><td>Файлов</td><td>{files.toLocaleString('ru-RU')}</td></tr>
          <tr><td>Папок</td><td>{folders.toLocaleString('ru-RU')}</td></tr>
          <tr><td>Исходный размер</td><td>{fmtShort(size)} ({size.toLocaleString('ru-RU')} байт)</td></tr>
          <tr><td>Размер архива</td><td>{fmtShort(archSize)}</td></tr>
          <tr><td>Степень сжатия</td><td>{ratio}%</td></tr>
          <tr><td>Непрерывный</td><td>{solid ? 'да' : 'нет'}</td></tr>
          <tr><td>Шифрование</td><td>{encrypted ? 'есть' : 'нет'}</td></tr>
        </tbody>
      </table>
      <div className="ratio-bar"><div style={{ width: `${Math.min(100, ratio)}%` }} /></div>
      <div className="buttons">
        <button className="default" onClick={onClose} autoFocus>
          OK
        </button>
      </div>
    </Window>
  );
}

export function AboutDialog({ tools, onClose }: { tools: { sevenZipPath: string | null; rarPath: string | null }; onClose: () => void }) {
  return (
    <Window title="О программе" onClose={onClose} width={420}>
      <div className="info-head">
        <ArchiveBox size={56} />
        <div>
          <b style={{ fontSize: 16 }}>Archivator 1.0</b>
          <div className="muted">Архиватор для macOS на React + Electron</div>
        </div>
      </div>
      <table className="info-table">
        <tbody>
          <tr><td>ZIP, 7Z</td><td>создание и распаковка</td></tr>
          <tr><td>RAR</td><td>распаковка{tools.rarPath ? ', создание' : ''}</td></tr>
          <tr><td>7-Zip</td><td className="ellipsis">{tools.sevenZipPath || 'не найден'}</td></tr>
          <tr><td>rar</td><td className="ellipsis">{tools.rarPath || 'не установлен'}</td></tr>
        </tbody>
      </table>
      <div className="buttons">
        <button className="default" onClick={onClose} autoFocus>
          OK
        </button>
      </div>
    </Window>
  );
}
