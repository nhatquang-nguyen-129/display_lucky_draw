// Render UI nút import/replace/save
export function renderFileUI(container) {
    container.innerHTML = `
        <div class="file-toolbar">
            <input type="file" id="importFileInput" style="display:none"/>
            <button id="importFileBtn">Import</button>
            <button id="replaceFileBtn">Replace</button>
            <button id="saveFileBtn">Save</button>
        </div>
    `;

    return {
        importFileInput: container.querySelector('#importFileInput'),
        importFileBtn: container.querySelector('#importFileBtn'),
        replaceFileBtn: container.querySelector('#replaceFileBtn'),
        saveFileBtn: container.querySelector('#saveFileBtn')
    };
}