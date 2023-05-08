import { writable, get } from "svelte/store";
import { Path } from "./path";

/**
 * @typedef {{isBlockDevice: boolean,isCharacterDevice: boolean,isDirectory: boolean,isFIFO: boolean,isFile: boolean,isSocket: boolean,isSymbolicLink: boolean,name: string,path: string}} Entry
 * @typedef {{highlighted: number, entries: [Entry], path: string}} Directory
 */

/**
 * @param {string} path
 * @return {Promise<[Entry]>}
 */
function readDirectory(path) {
    return window.api.readdirSync(path);
}

function setupDirectoryStore() {
    // /** @type {{base: string, directories: [Directory], openedFile: Entry}} */

    /** @type {{base: string, opened: [string], openedEntries: [Entry]}} */
    const bruh = {
        base: "",
        opened: [],
        openedEntries: [],
        // directories: [],
        // openedFile: null,
    };

    const store = writable(bruh);
    const { subscribe, set, update,  } = store;

    window.api.registerWatchListener(
        (eType, filename) => {
            // console.log(eType, filename);
            if(eType === "rename")
                self.reload();
    });

    const self = {
        subscribe,
        /**
         * 
         * @param {string} entry 
         * @param {number} i 
         */
        open: (name, i) => {
            // console.log(entry, i);

            update((current) => {
                current.opened = current.opened.slice(0, i);
                current.opened.push(name);

                self.reload();
                return current;
            });
        },
        /**
         * 
         * @param {number} i 
         */
        close: (i) => {
            update((current) => {
                current.opened = current.opened.slice(0, i);
                self.reload();
                return current;
            });
        },
        /**
         * 
         */
        reload: async () => {
            const current = get(store);

            let accum = "";
            const paths = current.opened.map((curr) => {
                accum = Path.join(accum, curr);
                return accum;
            });

            current.openedEntries = (await Promise.all(paths.map(
                /**
                 * 
                 * @param {settings} path 
                 * @returns {Promise<Entry>}
                 */
                async (path) => {
                    try{
                        const stat = await window.api.stat(path);
                        stat.name = Path.lastPathFragment(stat.path);
                        stat.entries = [];
                        if(stat.isDirectory) stat.entries = await window.api.readdir(path);
                        return stat;
                    }catch(e) {
                        return null;
                    }
                }
            ))).filter((entry) => entry !== null);


            set(current);
        },
        
        move: () => {},
        /**
         * 
         * @param {string} newBase 
         */
        setBase: (newBase) => {
            set({
                base: newBase,
                opened: [newBase],
                openedEntries: [],
            });

            self.reload();
            // window.api.watch(newBase);
        },
        rename: async (oldPath, newPath) => {

            update(
                (current) => {
                    if(Path.parent(oldPath) === Path.parent(newPath)) {
                        const newName = Path.lastPathFragment(newPath);
                        
                        let accum = "";
                        current.opened = current.opened.map((curr) => {
                            accum = Path.join(accum, curr);
                            if(accum === oldPath) return newName;
                            return curr;
                        });
        
                    }else {
                        let accum = "";
                        const i = current.opened.findIndex((curr) => {
                            accum = Path.join(accum, curr);
                            return accum === oldPath;
                        });
                        if(i !== -1) current.opened = current.opened.slice(0, i);
                        return current;
                    }
        
                    console.log(oldPath, newPath);
                    console.log(Path.parent(oldPath), Path.parent(newPath))
                
                    console.log(current);

                    return current;
                });

            await window.api.rename(oldPath, newPath)
                .then((a) => {
                    if(a) {
                        alert("No perms");
                    }
                    // reload();
                });
            
            self.reload();
        },
        async mkdir(name) {
            await window.api.mkdir(name);
            // setTimeout(() => {self.reload();}, 100);
            self.reload();
        },
        async trash(name) {
            update((current) => {
                let accum = "";
                const i = current.opened.findIndex((curr) => {
                    accum = Path.join(accum, curr);
                    return accum === name;
                });
                if(i !== -1) current.opened = current.opened.slice(0, i);
                return current;
            })

            await window.api.trash(name);
            self.reload();
        }
    };

    return self;
}

function setupSelectionStore() {
    const bruh = new Set();
    const store = writable(bruh);
    const { subscribe, set, update } = store;

    const self = {
        subscribe,
        deselect(path) {
            update((set) => {
                set.delete(path);
                return set;
            });
        },
        select(path) {
            update((set) => {
                set.add(path);
                return set;
            });
        },
        clear() {
            update((set) => {
                set.clear();
                return set;
            });
        },
        toggle(path) {
            update((set) => {
                if(set.has(path)) set.delete(path);
                else set.add(path);
                return set;
            });
        },
        singleSelect(path) {
            update((set) => {
                set.clear();
                set.add(path);
                return set;
            });
        }
    };
    
    return self;
}

export const Directory = setupDirectoryStore();

export const EntrySelection = setupSelectionStore();