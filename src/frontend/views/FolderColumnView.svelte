<script>
    import FolderColumnViewEntry from "./FolderColumnViewEntry.svelte";
    import RightResizeArea from "../components/RightResizeArea.svelte";
    import { Directory, EntrySelection } from "../directory-store";
  import { Dropdown } from "../dropdown-store";
  import { tick } from "svelte";
  import { Path } from "../path";
  import getIcon from "../icons";

    export let directory;
    export let index = 0;


    let width = 200;

    let highlighted = -1;

    let div;

    let folderIcon = "";
    getIcon("folder.default").then((a) => {folderIcon = a});

    let creating = false;
    /** @type {HTMLInputElement} */
    let folderCreateInput;

    function finishFolderCreate() {
        Directory.mkdir(Path.join(directory.path, folderCreateInput.value));

        creating = false;
        folderCreateInput.value = "";
        folderCreateInput.blur();
    }

    function cancelFolderCreate() {
        creating = false;
        folderCreateInput.value = "";
        folderCreateInput.blur();
    }


    let mousedown = false;

    let selectFrom = -1;

</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="main" 
    bind:this={div} 
    on:dragover={
        (e)=>{
            // console.log(e)
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
    }} 
    on:drop={
        (e) => {
            console.log(e);
            let entry = JSON.parse(e.dataTransfer.getData("application/json"));
            Directory.rename(entry.path, `${directory.path}/${entry.name}`);
    }}>
    <ul 
        on:mousedown={()=>{mousedown = true;}}

        on:mouseup={(e) => {
            if(!mousedown) return;
            mousedown = false;

            EntrySelection.clear();

            if (e.button == 2) {
                // openOptions(e.x, e.y, null);
                Dropdown.showDropdown(e.x, e.y, [
                    {name: "New Folder", execute() {
                        console.log("make a new folder");
                        
                        creating = true;
                        Dropdown.hideDropdown();

                        tick().then(() => {
                            folderCreateInput.value = "New Folder";
                            folderCreateInput.focus();
                            folderCreateInput.select();
                        })
                    }},

                ])
            }else {
                highlighted = -1;
                Directory.close(index + 1);

            }
        }}>
        
        {#each directory.entries as entry, i} 
            <FolderColumnViewEntry 
                open={() => {
                    if(highlighted === i) return;
                    highlighted = i;
                    Directory.open(entry.name, index + 1);
                }} 
                entry={entry} 
                highlight={highlighted == i}
                
                bind:selectFrom
                index={i}

                handleRangeSelect={() => {
                    if(selectFrom == -1) {
                        selectFrom = i;
                        EntrySelection.select(entry.path);
                    }else{
                        let max = Math.max(selectFrom, i);
                        for(let j = Math.min(selectFrom, i); j <= max; j ++) {
                            EntrySelection.select(directory.entries[j].path);
                        }
                    }
                }}

                
                />
        {/each}

        <li style:display={(creating ? "grid" : "none")}>
            <span>{@html folderIcon}</span>
            <input bind:this={folderCreateInput}
                on:focusout={cancelFolderCreate}
                on:keydown={(e) => {
                    if(e.key == "Escape") {
                        cancelFolderCreate();
                    }
                    if(e.key == "Enter") {
                        finishFolderCreate();
                    }
                }}
            />
        </li>
    </ul>


    <RightResizeArea bind:parent={div} bind:width minWidth={200}/>

</div>

<style>
    li {
        
        padding: 2px 0px;
        /* display: contents; */
        background: none;
        border: none;
        outline: none;
        font-family: inherit;
        font-size: inherit;
        color: inherit;
        width: 100%;
        height: max-content;
        display: grid;
        grid-template-columns: 1.5em auto;
        grid-template-rows: 100%;
        text-align: left;

        white-space: nowrap;
        
        color: #ffffff1f;

        padding: 2px 20px;
        position: relative;

    }

    input {
        padding: 0px 20px;
        background: none;
        outline: none;
        border: #a669d8c3 solid 1px;
        width: 100%;

        font-size: inherit;
        color: inherit;
        padding: 0;
    }

    .main {
        position: relative;
        /* padding-bottom: 100%; */
        height: 100%;
        overflow: hidden;
    }
    ul {
        list-style-type: none;
        padding: 0;
        margin: 0;
        font-family: Helvetica, sans-serif;
        font-size: 12px;
        font-weight: 100;
        border-right: #00000011 1px solid;
        overflow-y: auto;
        width: 100%;
        height: 100%;
        overflow-x: auto;
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