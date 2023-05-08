




export const Path = {
    clean(path) {
        if(path.length === 0) return path;
        if(path[0] === "/") path = path.substring(1);
        if(path[path.length-1] === "/") path = path.subtring(0, path.length-1);
        return path;
    },

    join(path1, path2) {
        path1 = Path.clean(path1);
        path2 = Path.clean(path2);
        if(path1.length === 0) return path2;
        if(path2.length === 0) return path1;

        return path1 + "/" + path2;
    },
    /**
     * 
     * @param {string} path1 
     * @param {string} path2 
     * @param {string} path3 
     */
    replace(path, search, replace) {
        path = Path.clean(path);
        search = Path.clean(search);
        replace = Path.clean(replace);
        
        return path.replace(search, replace);
    },
    /**
     * 
     * @param {string} path 
     */
    lastPathFragment(path) {
        path = Path.clean(path);
        const i = path.lastIndexOf("/");
        if(i == -1) return path;
        return path.substring(i+1);
    },
    /**
     * 
     * @param {string} path 
     */
    parent(path) {
        path = Path.clean(path);
        const i = path.lastIndexOf("/");
        if(i == -1) return "";
        return path.substring(0, i);
    },

    /**
     * 
     * @param {string} path 
     */
    fragments(path) {
        path = Path.clean(path);
        return path.split("/");
    }
};