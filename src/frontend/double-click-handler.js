


export default function createDoubleClickHandler(singleClickHandler, doubleClickHandler) {

    /**
     * 
     * @param {PointerEvent} e 
     */
    const handler = (e) => {
        // console.log("clicked")
        // console.log(e);

        if(handler._timer) {
            clearTimeout(handler._timer);
            handler._timer = null;

            handler.doubleClickHandler();
        }else {
            handler._timer = setTimeout(() => {
                handler.singleClickHandler();
                handler._timer = null;
            }, 300);
        }

        
        e.stopPropagation();
        e.preventDefault();
        return false;
    };

    handler.singleClickHandler = singleClickHandler;
    handler.doubleClickHandler = doubleClickHandler;
    handler._timer = null;

    return handler;
}