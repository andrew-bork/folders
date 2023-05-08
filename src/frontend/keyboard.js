

let _shiftDown = false;
let _ctrlDown = false;

export const Keyboard = {
    /**
     * 
     * @param {KeyboardEvent} e 
     */
    handleDown(e) {
        if(e.key == "Shift") {
            _shiftDown = true;
        }else if(e.key == "Control") {
            _ctrlDown = true;
        }
    },
    handleUp(e) {
        if(e.key == "Shift") {
            _shiftDown = false;
        }else if(e.key == "Control") {
            _ctrlDown = false;
        }
    },
    isShiftDown() { return _shiftDown; },
    isCtrlDown() { return _ctrlDown; },
}