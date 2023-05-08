

<script>
    export let file;

    export let association;
    export let extension;
    export let type;
    export let imageWidth;
    export let imageHeight;
    export let isImage;
    export let isText;

    const KB = 1024;
    const MB = KB * KB;
    const GB = KB * MB
    const TB = KB * GB;
    const PB = KB * TB;

    function formatBytes(size) {
        if(size < KB) {
            return `${size} bytes`;
        }else if(size < MB) {
            return `${(size / KB).toFixed(1)} KB`;
        }else if(size < GB) {
            return `${(size / MB).toFixed(1)} MB`;
        }else if(size < TB) {
            return `${(size / GB).toFixed(1)} GB`;
        }else if(size < PB) {
            return `${(size / TB).toFixed(1)} TB`;
        }else {
            return `${(size / PB).toFixed(1)} PB`;
        }
    }
</script>

<div>
    <span class="title">{file.name}</span><br/>
    <span>{file.path} </span>
    
    <table>
        <tr>
            <th>Size</th>
            <td>{formatBytes(file.size)}</td>
        </tr>
        <tr>
            <th>Encoding</th>
            <td>{type}</td>
        </tr>
        <tr>
            <th>File Type</th>
            <td> ({extension}) "{association}"</td>
        </tr>

        {#if isImage}
        <tr>
            <th>Dimensions</th>
            <td>{imageWidth}x{imageHeight}</td>
        </tr>
        {/if}
    </table>
</div>

<style>
    div {
        font-size: 16px;
    }

    table {
        font-size: 12px;
    }

    .title,th {
        color: #ffffff99;
    }
</style>