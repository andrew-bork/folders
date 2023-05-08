

const { ipcMain } = require("electron");
const fsPromises = require("fs/promises");
const path = require("path")

const RESOURCE_DIR = "./resources";
const folderIcons = {
    "folder.default": "icons/folder-default",
    // "folder.default": "icons/folder-core"
};
const fileIcons = {
    "file.image": "icons/image",
    "file.default": "icons/file",
    "file.json": "icons/json",
    "file.javascript": "icons/javascript",
    "file.typescript": "icons/typescript",
    "file.python": "icons/python",
    "file.markdown": "icons/markdown",
    "file.shell": "icons/powershell",
    "file.html": "icons/html",
    "file.hpp": "icons/hpp",
    "file.h": "icons/h",
    "file.cpp": "icons/cpp",
    "file.c": "icons/c",
    "file.text": "icons/document",
    "file.git": "icons/git",
    "file.pythonc": "icons/python-misc",
    "file.css": "icons/css",
    "file.csv": "icons/xml",
    "file.xml": "icons/xml",
    "file.java": "icons/java",
}

function registerFolderIcons(icons) {
    Object.keys(folderIcons)
    .forEach(
        (name) => {
            icons[name] = {
                path: path.join(RESOURCE_DIR, folderIcons[name]+".svg")
            };
            icons[name+".open"] = {
                path: path.join(RESOURCE_DIR, folderIcons[name]+"-open.svg")
            };
        });
}

function registerFileIcons(icons) {
    Object.keys(fileIcons)
    .forEach(
        (name) => {
            icons[name] = {
                path: path.join(RESOURCE_DIR, fileIcons[name]+".svg")
            };
        });
}

async function loadIcons(icons) {
    await Promise.all(Object.keys(icons)
        .map((name) => {
            return fsPromises.readFile(icons[name].path).then((icon) => {
                icons[name].icon = icon.toString("utf-8");
            });
        }));
    return icons;
}

module.exports = async () => {
    const icons = {};

    registerFolderIcons(icons);
    registerFileIcons(icons);
    console.log(`Registered ${Object.keys(icons).length} icons.`);
    Object.keys(icons).forEach((key) => {
        console.log(`${key} : ${icons[key].path}`);
    });

    await loadIcons(icons);
    console.log(`Loaded ${Object.keys(icons).length} icons`);
    // console.log(icons);
    
    return icons;
}