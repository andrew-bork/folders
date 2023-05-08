<script>
    import { Directory } from "../directory-store.js";
    import FileItemView from "./FileItemView.svelte";
    import FolderColumnView from "./FolderColumnView.svelte";

    $: console.log($Directory);
</script>


<div class="column-container">
    <div>
        <!-- <FolderColumnView bind:directoryPath={baseDirectory[0]} bind:opened={opened[0]} change={() => changeOpened(0)}/> -->
        {#each $Directory.openedEntries as entry, i}
            {#if entry.isDirectory}
                <FolderColumnView directory={entry} index={i}/>
            {:else}
                <FileItemView file={entry}/>
            {/if}
        {/each}
    </div>
</div>

<style>
    .column-container {
        height: 100%;
        width: 100%;
        position:relative;
        overflow-y: hidden;
        overflow-x: auto;

        border-top: #00000011 1px solid;
    }

    .column-container>div {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        position:relative;
        height: 100%;
        
    }
    
    ::-webkit-scrollbar
    {
    width: 12px;  /* for vertical scrollbars */
    height: 12px; /* for horizontal scrollbars */
    }

    ::-webkit-scrollbar-track
    {
        border-top: #ffffff11 1px solid;
        border-left: #ffffff11 1px solid;
        background-color: none;
    }

    ::-webkit-scrollbar-thumb
    {
        background: #d096ff3b;
        width: 12px;
    }
</style>