
const { exec } = require("child_process");

let currentProcess = null;
module.exports = function compile() {
    // const out = exec("rollup -c");
    // console.log(out.toString("utf-8"));
    
    if(currentProcess) return currentProcess;

    currentProcess = new Promise(
        (res, rej) => {
            exec("rollup -c", (err, stdout, stderr) => {
                console.log(stdout.toString("utf-8"));
                // console.clear();
                console.log(stderr.toString("utf-8"));
                if(err) rej(err);
                res();
            });
        }
    ).then(res => {
        currentProcess = null;
        return res;
    });
    return currentProcess;
}