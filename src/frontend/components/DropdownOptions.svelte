<script>
  import { Dropdown } from "../dropdown-store";

    export let options = [
        {name: "Change View 1", execute: () => {}},
        {name: "Change View 2", execute: () => {}},
        {name: "Change View 3", execute: () => {}},
        {name: "Change View 4", execute: () => {}},
        {name: "Change View 5", execute: () => {}},
        {name: "Change View 6 loooooooooooooong", execute: () => {}},
    ];
    export let show = true;
    export let x = 0;
    export let y = 0;
</script>

{#if show}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<ul style:top={y+"px"} style:left={x+"px"} on:click={(e) => {e.preventDefault(); e.stopPropagation();return false;}}>
    {#each options as option}
    <li><button on:click={option.execute}>{option.name}</button></li>
    {/each}

</ul>

{/if}

<svelte:window on:click={(e) => {Dropdown.hideDropdown();}}/>

<style>
    ul {
        list-style-type: none;
        position: absolute;
        padding: 0;
        word-break: keep-all;

        width:max-content;
        
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: stretch;
    
        background-color: var(--background-color);
        padding: 5px;

        box-shadow: 0px 0px 11px 0px #00000063;
        border-radius: 2px;
    }

    li {
        position: relative;
    }

    button {
        width: 100%;
        border: none;
        background: none;
        text-align: left;
        color: #ffffffc2;
        font-size: 11px;
        padding: 5px 20px;
        border-radius: 2px;
    }

    button:hover {
        background-color: #8e54ba;
    }
</style>