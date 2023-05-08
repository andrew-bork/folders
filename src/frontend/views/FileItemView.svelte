<script>
    import getAssociation, { getType } from "../associations";
    import RightResizeArea from "../components/RightResizeArea.svelte";
    import Filestats from "../components/filestats.svelte";
    import TextFileItem from "./file-items/TextFileItem.svelte";

    export let file;

    let div;
    
    let extension = "";
    let isImage = false;
    let isText = false;

    let association = "";
    let type = "";

    $: {
        extension = file.name.substring(file.name.lastIndexOf(".")+1);
        association = getAssociation(extension);
        isImage = association == "file.image";
        type = getType(extension);
        isText = type == "file.plaintext";
    }

    let imageWidth, imageHeight;
</script>

<div class="main-content" bind:this={div}>
    <Filestats bind:file bind:isImage bind:isText bind:extension bind:association bind:type bind:imageWidth bind:imageHeight/>
    {#if isImage}
        <img alt="none" src={`${file.path}`} bind:naturalWidth={imageWidth} bind:naturalHeight={imageHeight}/>
    {:else if isText}
       <TextFileItem bind:file/>
    {/if}

    <RightResizeArea bind:parent={div} minWidth={400}/>
</div>


<style>
    .main-content {
        /* min-width: max-content; */
        font-family: Helvetica, sans-serif;
        color: #ffffff44;
        font-weight: 100;
        border-right: #00000011 1px solid;
        height: 100%;
        padding: 50px;
        box-sizing: border-box;
        width: max-content;
        position: relative;
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

    img {
        display: inline;
        max-width: 100%;
    }
</style>