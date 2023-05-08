const fs = require("fs");

module.exports = function loadAssociations(file="./resources/settings/file-associations.json") {
    return JSON.parse(fs.readFileSync(file));
}