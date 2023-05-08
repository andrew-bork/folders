const { app, BrowserWindow, ipcMain } = require("electron");
const compile = require("./compile-frontend.js");

const fs = require("fs");
const path = require("path");
let trash;
import("trash").then((a) => {
    trash = a.default;
});



process.env.NODE_ENV ??= "production"
const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";

const loadIcons = require("./resource-handler.js");
const loadAssociations = require("./file-associations.js");

// console.log(process.env);

if(isDev) {
    console.log("Running in Development mode.");
}

if(isProd) {
    console.log("Running in Production mode.");
}









let win;

if(isDev){
    
    compile();
    fs.watch("src/frontend", { recursive: true }, () => {
        compile()
            .then(res => {
                win.reload();
            });
    });
}

const resources = app.getPath("resources");
let associations = loadAssociations(path.join(resources, "settings", "file-associations.json"));
Promise.all([app.whenReady(), loadIcons()]).then(([_, icons]) =>{ 
    win = new BrowserWindow({
        width: 1600,
        height: 1200,
        frame: true,
        titleBarStyle: 'hidden',
        
        titleBarOverlay: {
            color: '#2f3241',
            symbolColor: '#74b1be',
            height: 30
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.loadFile('public/index.html');

    ipcMain.handle("get-icon", (event, name) => {
        if(name in icons) return icons[name].icon;
        return icons[name.substring(0, name.indexOf("."))+".default"].icon;
    });
    ipcMain.handle("load-associations", (event) => {
        return associations;
    });

});

ipcMain.handle("exists", (event, name) => {
    return fs.existsSync(name);
});
ipcMain.handle("read-dir", (event, dir) => {
    try {
        console.log(`Listing "${dir}"`);

        return new Promise(
            (res, rej) => {
                fs.readdir(dir, { withFileTypes: true }, 
                    (err, entries) => {
                        if(err) return null;
                        res(entries.map((entry) => {
                            return {
                                isBlockDevice: entry.isBlockDevice(),
                                isCharacterDevice: entry.isCharacterDevice(),
                                isDirectory: entry.isDirectory(),
                                isFIFO: entry.isFIFO(),
                                isFile: entry.isFile(),
                                isSocket: entry.isSocket(),
                                isSymbolicLink: entry.isSymbolicLink(),
                                name: entry.name,
                                path: `${dir}/${entry.name}`,
                            };
                        }))
                    });
            }
        )
    }catch(e) {
        console.log(e);
        throw e;
    }
});

ipcMain.handle("watch", (event, dir) => {
    
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
        console.log(eventType, filename);
        if(eventType === "rename")
            event.sender.send("watch-update", eventType, filename);
    });
    return true;
});

ipcMain.handle("mkdir", (event, name) => {
    try {
        return fs.mkdirSync(name, {recursive: true})
    }catch(e) {
        console.log(e);
        throw e;
    }
});


ipcMain.handle("stat", (event, path) => {
    try {
        const result = fs.statSync(path);
        result.isBlockDevice = result.isBlockDevice();
        result.isCharacterDevice = result.isCharacterDevice();
        result.isDirectory = result.isDirectory();
        result.isFIFO = result.isFIFO();
        result.isFile = result.isFile();
        result.isSocket = result.isSocket();
        result.isSymbolicLink = result.isSymbolicLink();
        result.path = path;

        return result;
    }catch(e) {
        console.log(e);
        throw e;
    }
});


ipcMain.handle("rename", (event, origin, dest) => {
    return fs.renameSync(origin, dest);
});

ipcMain.handle("read", (event, name) => {
    const result = fs.readFileSync(name);
    return result.toString("utf-8");
});

ipcMain.handle("trash", (event, name) => {
    return trash(name);
});