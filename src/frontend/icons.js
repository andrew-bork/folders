
let icons = {};

export default async function getIcon(name) {
    if(name in icons) return icons[name];
    icons[name] = await window.api.getIcon(name);
    return icons[name];
}