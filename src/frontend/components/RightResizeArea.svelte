<script>
    export let parent;
    export let width = 200;
    export let minWidth = 200;
    let resizing = false;

    $: if(parent) parent.style.minWidth = `${width}px`;
</script>

<div class="right-resize"
    on:mousedown={(e) => {
        resizing = true;
        e.stopPropagation();
    }} 
></div>

<svelte:window on:mousemove= {(e) => {
    if(resizing){
        const rect = parent.getBoundingClientRect();
        width = Math.max(minWidth, e.clientX - rect.x);
        parent.style.minWidth = `${width}px`;
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
    }} on:mouseup={(e) => {
        resizing = false;

    }} ></svelte:window>


<style> 
    .right-resize {
        height:100%;
        top: 0;
        position: absolute;
        right: 0;
        width: 10px;
        transform: translateX(50%);
        cursor: ew-resize;
        /* background-color: #000000; */
    }
</style>