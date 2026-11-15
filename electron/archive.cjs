// Работа с архивами через консольный 7-Zip (7zz) и, опционально, rar.
// 7zz умеет: ZIP/7Z — чтение и запись, RAR/RAR5 — только чтение.
// Создание RAR требует утилиту `rar` от RARLAB (brew install rar).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SEARCH_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];

function findInPath(name) {
  const dirs = [...SEARCH_DIRS, ...(process.env.PATH || '').split(':')];
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d, name);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {}
  }
  return null;
}

function bundledBin(name) {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'bin', name));
  candidates.push(path.join(__dirname, '..', 'bin', name));
  for (const p of candidates) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {}
  }
  return null;
}

let cache = null;
function tools() {
  if (cache) return cache;
  cache = {
    sevenZip: bundledBin('7zz') || findInPath('7zz') || findInPath('7z'),
    rar: bundledBin('rar') || findInPath('rar'),
  };
  return cache;
}

function requireSevenZip() {
  const t = tools().sevenZip;
  if (!t) {
    throw new Error(
      'Не найден 7-Zip (7zz). Выполните `npm run fetch-7z` или `brew install sevenzip`.'
    );
  }
  return t;
}

/**
 * Запуск процесса. onProgress получает проценты (0..100), если утилита их печатает.
 */
function run(bin, args, { cwd, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const onAbort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', onAbort);

    const parseProgress = (chunk) => {
      if (!onProgress) return;
      // 7zz -bsp1 печатает "  42% 12 - file" с \b; rar печатает "  42%"
      const matches = chunk.match(/(\d{1,3})%/g);
      if (matches) {
        const v = parseInt(matches[matches.length - 1], 10);
        if (v >= 0 && v <= 100) onProgress(v);
      }
    };

    child.stdout.on('data', (d) => {
      const s = d.toString('utf8');
      stdout += s;
      parseProgress(s);
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (e) => {
      signal?.removeEventListener('abort', onAbort);
      reject(e);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) return reject(Object.assign(new Error('Операция отменена'), { cancelled: true }));
      resolve({ code, stdout, stderr });
    });
  });
}

function isPasswordError(text) {
  return /wrong password|can not open encrypted archive|enter password|incorrect password|data error in encrypted/i.test(
    text
  );
}

function fail(res, fallback) {
  const text = (res.stderr + '\n' + res.stdout).trim();
  const err = new Error(extractError(text) || fallback);
  if (isPasswordError(text)) err.needPassword = true;
  return err;
}

function extractError(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(ERROR|Error|E_|Can ?not|Wrong|Open ERROR|Unsupported|.*is not archive)/i.test(l) || /error/i.test(l));
  return lines.slice(0, 4).join('\n');
}

function pwArg(password) {
  // Без пароля ключ не передаём: stdin закрыт, поэтому запрос пароля сразу завершится ошибкой,
  // которую мы распознаём как needPassword.
  return password ? [`-p${password}`] : [];
}

function parseDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
}

/** Разбор вывода `7zz l -slt` */
function parseSlt(stdout) {
  const sepIdx = stdout.search(/^-{10,}\s*$/m);
  const head = sepIdx >= 0 ? stdout.slice(0, sepIdx) : '';
  const body = sepIdx >= 0 ? stdout.slice(sepIdx).replace(/^-{10,}\s*\r?\n/, '') : stdout;

  const info = {};
  for (const line of head.split(/\r?\n/)) {
    const m = line.match(/^([^=]+?) = (.*)$/);
    if (m) info[m[1]] = m[2];
  }

  const entries = [];
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const rec = {};
    for (const line of block.split(/\r?\n/)) {
      const m = line.match(/^([^=]+?) = ?(.*)$/);
      if (m) rec[m[1].trim()] = m[2];
    }
    if (!rec.Path) continue;
    const isDir = rec.Folder === '+' || /^D/.test(rec.Attributes || '') || / D/.test(rec.Attributes || '');
    entries.push({
      path: rec.Path.replace(/\\/g, '/').replace(/\/+$/, ''),
      isDir,
      size: Number(rec.Size || 0),
      packed: Number(rec['Packed Size'] || 0),
      modified: parseDate(rec.Modified),
      crc: rec.CRC || '',
      encrypted: rec.Encrypted === '+',
      method: rec.Method || '',
    });
  }
  return {
    type: info.Type || '',
    physicalSize: Number(info['Physical Size'] || 0),
    solid: info.Solid === '+',
    entries,
  };
}

async function list(archive, password) {
  const bin = requireSevenZip();
  const res = await run(bin, ['l', '-slt', '-sccUTF-8', ...pwArg(password), '--', archive]);
  const parsed = parseSlt(res.stdout);
  if (res.code !== 0 && parsed.entries.length === 0) throw fail(res, 'Не удалось открыть архив');
  if (parsed.entries.some((e) => e.encrypted) && !password) parsed.hasEncrypted = true;
  return parsed;
}

const OVERWRITE = { overwrite: '-aoa', skip: '-aos', rename: '-aou' };

async function extract({ archive, dest, files = [], password, overwrite = 'overwrite', flat = false }, opts) {
  const bin = requireSevenZip();
  await fs.promises.mkdir(dest, { recursive: true });
  const args = [
    flat ? 'e' : 'x',
    '-bsp1',
    '-sccUTF-8',
    '-y',
    OVERWRITE[overwrite] || '-aoa',
    `-o${dest}`,
    ...pwArg(password),
    '--',
    archive,
    ...files,
  ];
  const res = await run(bin, args, opts);
  if (res.code > 1) throw fail(res, 'Ошибка распаковки');
  return { warnings: res.code === 1 };
}

async function test({ archive, password }, opts) {
  const bin = requireSevenZip();
  const res = await run(bin, ['t', '-bsp1', '-sccUTF-8', ...pwArg(password), '--', archive], opts);
  if (res.code !== 0) throw fail(res, 'Архив повреждён');
  return { ok: true, output: res.stdout };
}

const LEVEL_7Z = { store: 0, fastest: 1, fast: 3, normal: 5, good: 7, best: 9 };
const LEVEL_RAR = { store: 0, fastest: 1, fast: 2, normal: 3, good: 4, best: 5 };

/**
 * Создание архива / добавление в существующий.
 * files — абсолютные пути; в архив кладутся относительно их родительской папки.
 */
async function add(
  { archive, files, format = 'zip', level = 'normal', password, encryptNames = false, deleteAfter = false, volumeSize, solid = true },
  opts
) {
  if (!files?.length) throw new Error('Нет файлов для добавления');
  const cwd = path.dirname(files[0]);
  const rel = files.map((f) => (path.dirname(f) === cwd ? path.basename(f) : f));

  if (format === 'rar') {
    const rar = tools().rar;
    if (!rar) {
      throw new Error(
        'Для создания RAR нужна утилита rar от RARLAB.\nУстановите: brew install rar\n(распаковка RAR работает и без неё)'
      );
    }
    const args = ['a', '-idq', '-y', `-m${LEVEL_RAR[level] ?? 3}`, '-ep1', '-r'];
    if (password) args.push(encryptNames ? `-hp${password}` : `-p${password}`);
    if (solid) args.push('-s');
    if (deleteAfter) args.push('-df');
    if (volumeSize) args.push(`-v${volumeSize}`);
    args.push('--', archive, ...rel);
    const res = await run(rar, args, { ...opts, cwd });
    if (res.code !== 0) throw fail(res, 'Ошибка создания RAR');
    return { ok: true };
  }

  const bin = requireSevenZip();
  const args = ['a', '-bsp1', '-sccUTF-8', '-y', `-t${format}`, `-mx=${LEVEL_7Z[level] ?? 5}`];
  if (password) {
    args.push(`-p${password}`);
    if (format === '7z' && encryptNames) args.push('-mhe=on');
    if (format === 'zip') args.push('-mem=AES256');
  }
  if (format === '7z') args.push(`-ms=${solid ? 'on' : 'off'}`);
  if (deleteAfter) args.push('-sdel');
  if (volumeSize) args.push(`-v${volumeSize}`);
  args.push('--', archive, ...rel);
  const res = await run(bin, args, { ...opts, cwd });
  if (res.code > 1) throw fail(res, 'Ошибка создания архива');
  return { ok: true, warnings: res.code === 1 };
}

async function remove({ archive, files, type, password }) {
  if (/rar/i.test(type || '') || /\.rar$/i.test(archive)) {
    const rar = tools().rar;
    if (!rar) throw new Error('Удаление из RAR требует утилиту rar (brew install rar)');
    const res = await run(rar, ['d', '-idq', '-y', ...(password ? [`-p${password}`] : []), '--', archive, ...files]);
    if (res.code !== 0) throw fail(res, 'Ошибка удаления');
    return { ok: true };
  }
  const bin = requireSevenZip();
  const res = await run(bin, ['d', '-sccUTF-8', '-y', ...pwArg(password), '--', archive, ...files]);
  if (res.code > 1) throw fail(res, 'Ошибка удаления');
  return { ok: true };
}

module.exports = { tools, list, extract, test, add, remove, parseSlt };
