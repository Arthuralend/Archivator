const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const archive = require('./archive.cjs');

let win = null;
let pendingOpen = null; // файл, переданный при запуске (open-file приходит до готовности окна)
const running = new Map(); // id операции -> AbortController

const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz|tgz|bz2|xz|cab|iso|jar|apk)$/i;

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 640,
    minWidth: 720,
    minHeight: 420,
    title: 'Archivator',
    backgroundColor: '#ece9d8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.webContents.on('did-finish-load', () => {
    if (pendingOpen) {
      win.webContents.send('open-path', pendingOpen);
      pendingOpen = null;
    }
  });
  win.on('closed', () => (win = null));
}

function send(cmd) {
  win?.webContents.send('menu-command', cmd);
}

function buildMenu() {
  const template = [
    { role: 'appMenu' },
    {
      label: 'Файл',
      submenu: [
        { label: 'Открыть архив…', accelerator: 'Cmd+O', click: () => send('open') },
        { label: 'Сменить папку…', accelerator: 'Cmd+D', click: () => send('chdir') },
        { type: 'separator' },
        { label: 'Выделить всё', accelerator: 'Cmd+A', click: () => send('selectAll') },
        { type: 'separator' },
        { role: 'close', label: 'Закрыть окно' },
      ],
    },
    {
      label: 'Команды',
      submenu: [
        { label: 'Добавить файлы в архив…', accelerator: 'Alt+A', click: () => send('add') },
        { label: 'Извлечь в указанную папку…', accelerator: 'Alt+E', click: () => send('extract') },
        { label: 'Проверить архив', accelerator: 'Alt+T', click: () => send('test') },
        { label: 'Просмотреть файл', accelerator: 'Alt+V', click: () => send('view') },
        { label: 'Удалить файлы', accelerator: 'Cmd+Backspace', click: () => send('delete') },
        { type: 'separator' },
        { label: 'Информация', accelerator: 'Alt+I', click: () => send('info') },
      ],
    },
    {
      label: 'Вид',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    {
      label: 'Справка',
      submenu: [{ label: 'О программе', click: () => send('about') }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- Файловая система ----------

ipcMain.handle('fs:home', () => os.homedir());

ipcMain.handle('fs:list', async (_e, dir) => {
  const names = await fs.promises.readdir(dir);
  const items = await Promise.all(
    names
      .filter((n) => !n.startsWith('.'))
      .map(async (name) => {
        const full = path.join(dir, name);
        try {
          const st = await fs.promises.stat(full);
          return { name, path: full, isDir: st.isDirectory(), size: st.size, modified: st.mtimeMs };
        } catch {
          return null;
        }
      })
  );
  return items.filter(Boolean);
});

ipcMain.handle('fs:stat', async (_e, p) => {
  try {
    const st = await fs.promises.stat(p);
    return { isDir: st.isDirectory(), size: st.size };
  } catch {
    return null;
  }
});

ipcMain.handle('fs:exists', (_e, p) => fs.existsSync(p));

ipcMain.handle('dialog:openArchive', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Открыть архив',
    properties: ['openFile'],
    filters: [
      { name: 'Архивы', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso', 'cab'] },
      { name: 'Все файлы', extensions: ['*'] },
    ],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:chooseDir', async (_e, defaultPath) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Выберите папку',
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:pickFiles', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Выберите файлы для добавления',
    properties: ['openFile', 'openDirectory', 'multiSelections'],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('dialog:saveArchive', async (_e, defaultPath) => {
  const r = await dialog.showSaveDialog(win, { title: 'Имя архива', defaultPath });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('shell:open', (_e, p) => shell.openPath(p));
ipcMain.handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));

// ---------- Архивы ----------

ipcMain.handle('archive:tools', () => {
  const t = archive.tools();
  return { sevenZip: !!t.sevenZip, rar: !!t.rar, sevenZipPath: t.sevenZip, rarPath: t.rar };
});

function wrap(fn) {
  return async (_e, payload, opId) => {
    const ctrl = new AbortController();
    if (opId) running.set(opId, ctrl);
    try {
      const result = await fn(payload, {
        signal: ctrl.signal,
        onProgress: (p) => opId && win?.webContents.send('progress', { opId, percent: p }),
      });
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e.message, needPassword: !!e.needPassword, cancelled: !!e.cancelled };
    } finally {
      if (opId) running.delete(opId);
    }
  };
}

ipcMain.handle('archive:list', wrap((p) => archive.list(p.archive, p.password)));
ipcMain.handle('archive:extract', wrap((p, o) => archive.extract(p, o)));
ipcMain.handle('archive:test', wrap((p, o) => archive.test(p, o)));
ipcMain.handle('archive:add', wrap((p, o) => archive.add(p, o)));
ipcMain.handle('archive:remove', wrap((p) => archive.remove(p)));
ipcMain.handle(
  'archive:view',
  wrap(async (p, o) => {
    const dest = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'archivator-'));
    await archive.extract({ archive: p.archive, dest, files: [p.file], password: p.password, flat: true }, o);
    const out = path.join(dest, path.basename(p.file));
    const err = await shell.openPath(out);
    if (err) throw new Error(err);
    return out;
  })
);
ipcMain.handle('op:cancel', (_e, opId) => running.get(opId)?.abort());

// ---------- Жизненный цикл ----------

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (win && !win.webContents.isLoading()) win.webContents.send('open-path', filePath);
  else pendingOpen = filePath;
});

app.whenReady().then(() => {
  buildMenu();
  const argFile = process.argv.slice(1).find((a) => ARCHIVE_EXT.test(a) && fs.existsSync(a));
  if (argFile && !pendingOpen) pendingOpen = path.resolve(argFile);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
