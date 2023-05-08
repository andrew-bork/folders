<script>
    import getIcon from "../icons";
    import getAssociation from "../associations";
    import createDoubleClickHandler from "../double-click-handler";
  import { Directory, EntrySelection } from "../directory-store";
  import { Path } from "../path";

  import { tick } from 'svelte';
  import { Dropdown } from "../dropdown-store";
  import { Keyboard } from "../keyboard";

    export let entry = {
            isBlockDevice: false,
            isCharacterDevice: false,
            isDirectory: false,
            isFIFO: false,
            isFile: true,
            isSocket: false,
            isSymbolicLink: false,
            name: entry.name,
        };

    export let highlight = false;
    export let open = () => {};
    export let selectFrom;
    export let handleRangeSelect;
    export let index;
    
    let icon = "";

    $: {
        let iconName = "file.default";
        // console.log(entry, opened);
        if(entry.isDirectory) {
            if(highlight) {
                iconName = "folder.default.open";
            }else {
                iconName = "folder.default";
            }
       }else if(entry.isFile){
            const extension = entry.name.slice(entry.name.lastIndexOf(".")+1);
            const association = getAssociation(extension);
            // console.log(extension, association);
            if(association) iconName = association;
       }

        getIcon(iconName).then((_icon)=>{
            icon=_icon;
        });
    }

    /** @type {HTMLInputElement} */
    let input;
    let button;

    function beginRename() {
        renaming = true;
        input.value = entry.name;
        tick().then(() => {
            input.focus();
        });
    }

    /**
     * 
     * @param {MouseEvent} e
     */
    function clickHandler(e) {
        if(!mousedown) return;
        mousedown = false;
        console.log(e);

        if(e.button == 2) {
            Dropdown.showDropdown(e.x, e.y, [
                {
                    name: "Rename",
                    execute() {
                        beginRename();
                        Dropdown.hideDropdown();
                    }
                },
                {
                    name: "Move to recycle",
                    execute() {
                        Dropdown.hideDropdown();
                        Directory.trash(entry.path);
                    }
                }

            ]);
        }else {
            if(Keyboard.isShiftDown()) {
                handleRangeSelect();
            }else if(Keyboard.isCtrlDown()) {
                EntrySelection.toggle(entry.path);
                selectFrom = index;
            }else {
                open();
                EntrySelection.singleSelect(entry.path);
                selectFrom = index;
            }
        }

        e.stopPropagation();
    };

    let renaming = false;

    let name = "";
    $: name = entry.name;
    
    let selected = false;
    $: selected = $EntrySelection.has(entry.path);

    let mousedown = false;
</script>

<li draggable="true" on:dragstart={(e) => {
        e.dataTransfer.setData("application/json", JSON.stringify(entry));
    }} on:drop={(e) => {
        console.log(e);
    }}>
    <button bind:this={button} 
        class={`${(highlight ? "active " : "")}${(selected ? "selected " : "")}`} 
        on:mousedown={()=>{mousedown = true;}}
        on:mouseup={clickHandler}
        on:keydown={(e) => {
            // console.log("keypress", e);
            if(e.key === "F2") {
                beginRename();
            } 
        }}
    >
        <span>{@html icon}</span>
        <span>

            <span style:display={(!renaming ? "inline" : "none")}>{entry.name}</span>
            <input 
                style:display={(renaming ? "inline" : "none")}
                bind:this={input}
                on:focusout={(e) => {
                    renaming = false;
                }}
                on:keydown={(e) => {
                    if(e.key == "Escape") {
                        button.focus();
                    }
                    if(e.key == "Enter") {
                        const value = e.target.value;
                        const parent = Path.parent(entry.path);
                        Directory.rename(entry.path, Path.join(parent, value));
                        button.focus();
                    }
                    
                }}
            />
            <!-- <input 
                bind:this={input}
                disabled={true} 
                on:focusout={(e) => {
                    editableSpan.disabled = true;
                }}
                on:keypress={(e) => {
                    if(e.key == "Escape") {
                        button.focus();
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    if(e.key == "Enter") {
                        const value = e.value;
                        const parent = Path.parent(entry.path);


                        setTimeout(() =>{
                            Directory.rename(entry.path, Path.join(parent, value));
                        }, 100);
                        
                        button.focus();

                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    
                    console.log(e);
                }}
                > -->

        </span>
    </button>
</li>

<style>

    input {
        background: none;
        outline: none;
        border: #a669d8c3 solid 1px;
        width: 100%;

        font-size: inherit;
        color: inherit;
        padding: 0;
    }

    :global(svg){
        width: 1em;
        height: 1em;
    }
    
    li {

        position: relative;
    }

    button {
        
        padding: 2px 20px;
        /* display: contents; */
        background: none;
        border: none;
        outline: none;
        font-family: inherit;
        font-size: inherit;
        color: inherit;
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-columns: 1.5em auto;
        grid-template-rows: 100%;
        text-align: left;

        white-space: nowrap;
        
        color: #ffffff1f;
    }

    button:hover {
        background-color: #00000024;
        color: #ffffffc1;
    }
    button.active {

        background-color: #ffffff24;
        color: #ffffffe0;
    }
    button.selected {
        background-color: #dd61e877;
        color: #ffffffe0;
    }
</style>