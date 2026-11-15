// Скачивает официальный консольный 7-Zip для macOS (универсальный бинарник arm64/x64) в ./bin/7zz
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const VERSION = '2409'; // 7-Zip 24.09
const URL = `https://www.7-zip.org/a/7z${VERSION}-mac.tar.xz`;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const binDir = join(root, 'bin');
const out = join(binDir, '7zz');

if (existsSync(out) && !process.argv.includes('--force')) {
  console.log('bin/7zz уже есть (используйте --force для повторной загрузки)');
  process.exit(0);
}
if (process.platform !== 'darwin') {
  console.warn('Внимание: скачивается macOS-версия 7zz, на этой ОС она не запустится.');
}

mkdirSync(binDir, { recursive: true });
console.log('Загрузка', URL);
const res = await fetch(URL);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const tmp = join(tmpdir(), `7z-${Date.now()}.tar.xz`);
writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
execFileSync('tar', ['-xJf', tmp, '-C', binDir, '7zz']);
rmSync(tmp);
chmodSync(out, 0o755);
console.log('Готово:', out);
