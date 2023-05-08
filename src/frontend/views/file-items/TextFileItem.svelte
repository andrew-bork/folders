<script>
    export let file;

    let textContent = "";
    
    $: window.api.read(file.path).then((_text) => {
        textContent = _text;
    });

</script>

<div>
    <pre>
{textContent}
    </pre>
</div>

<style>
    div {
        width: 100%;
        height: 100%;

    }
    pre {
        font-size: 12px;;
        height: 90%;
        background-color: #00000011;
        padding: 10px;
        overflow: auto;
        width: 100%;
        box-sizing: border-box;
    }
    ::-webkit-scrollbar
    {
    width: 12px;  /* for vertical scrollbars */
    height: 12px; /* for horizontal scrollbars */
    }


    ::-webkit-scrollbar-track
    {
        border-left: #ffffff11 1px solid;
        background-color: none;
    }

    ::-webkit-scrollbar-thumb
    {
        background: #d096ff3b;
        width: 12px;
    }
</style>