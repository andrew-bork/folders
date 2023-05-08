


let associations = null;
window.api.loadAssociations().then(res => {associations = res; console.log(res)});
export default function getAssociation(extension) {
    return associations.extensions[extension];
}


export function getType(extension) {
    if(extension in associations.type) return associations.type[extension];
    return "file.binary";
}