const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  home: () => ipcRenderer.invoke('fs:home'),
  listDir: (dir) => ipcRenderer.invoke('fs:list', dir),
  stat: (p) => ipcRenderer.invoke('fs:stat', p),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),

  openArchiveDialog: () => ipcRenderer.invoke('dialog:openArchive'),
  chooseDir: (def) => ipcRenderer.invoke('dialog:chooseDir', def),
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  saveArchiveDialog: (def) => ipcRenderer.invoke('dialog:saveArchive', def),
  openPath: (p) => ipcRenderer.invoke('shell:open', p),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),

  tools: () => ipcRenderer.invoke('archive:tools'),
  list: (payload) => ipcRenderer.invoke('archive:list', payload),
  extract: (payload, opId) => ipcRenderer.invoke('archive:extract', payload, opId),
  test: (payload, opId) => ipcRenderer.invoke('archive:test', payload, opId),
  add: (payload, opId) => ipcRenderer.invoke('archive:add', payload, opId),
  remove: (payload) => ipcRenderer.invoke('archive:remove', payload),
  view: (payload, opId) => ipcRenderer.invoke('archive:view', payload, opId),
  cancel: (opId) => ipcRenderer.invoke('op:cancel', opId),

  pathForFile: (file) => webUtils.getPathForFile(file),

  onProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('progress', h);
    return () => ipcRenderer.removeListener('progress', h);
  },
  onMenu: (cb) => {
    const h = (_e, cmd) => cb(cmd);
    ipcRenderer.on('menu-command', h);
    return () => ipcRenderer.removeListener('menu-command', h);
  },
  onOpenPath: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('open-path', h);
    return () => ipcRenderer.removeListener('open-path', h);
  },
});
