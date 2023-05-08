<script>

    import DropdownOptions from "./components/DropdownOptions.svelte";
    import DirectoryView from "./views/DirectoryView.svelte";
    import FileItemView from "./views/FileItemView.svelte";
    import FolderColumnView from "./views/FolderColumnView.svelte";
    import MenuBar from "./views/MenuBar.svelte";
    import { Directory } from "./directory-store.js";

    import { Dropdown } from "./dropdown-store.js";

    import { Keyboard } from "./keyboard.js";

    // let baseName = "C://";
    let baseName = "C:/Users/Andrew/stable-diffusion-webui";
    let settings = {
        backgroundColor: "#282b3f"
    };

    Directory.setBase(baseName);

    Dropdown.hideDropdown();
</script>

<div
    class="content"
    style:--background-color={settings.backgroundColor}
    >
    <MenuBar/>
    <div class="toolbar">
        <input />
    </div>
    <DirectoryView />


    
    <DropdownOptions bind:x={$Dropdown.x} bind:y={$Dropdown.y} bind:show={$Dropdown.show}
        options={$Dropdown.options}
    />
</div>

<svelte:window on:keydown={Keyboard.handleDown} on:keyup={Keyboard.handleUp}></svelte:window>

<style>
    .toolbar {
        padding: 20px;
    }
    .content {
        background-color: var(--background-color);
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-columns: 100%;
        grid-template-rows: 30px max-content auto;
        overflow: hidden;

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