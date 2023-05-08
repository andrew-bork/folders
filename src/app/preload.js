const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    readdir: (dir) => ipcRenderer.invoke("read-dir", dir),
    getIcon: (name) => ipcRenderer.invoke("get-icon", name),
    stat: (name) => ipcRenderer.invoke("stat", name),
    loadAssociations: () => ipcRenderer.invoke("load-associations"),
    rename: (a, b) => ipcRenderer.invoke("rename", a, b),    
    watch: (dir) => ipcRenderer.invoke("watch", dir),
    registerWatchListener: (listener) => { ipcRenderer.on("watch-update", listener); },
    mkdir: (name) => ipcRenderer.invoke("mkdir", name),
    read: (name) => ipcRenderer.invoke("read", name),
    trash: (name) => ipcRenderer.invoke("trash", name),
    // {
        // return fs.readdirSync(dir);
    // }
    // setTitle: (title) => ipcRenderer.send('set-title', title)
})