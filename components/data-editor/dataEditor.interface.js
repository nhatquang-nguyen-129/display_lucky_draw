// components/data-editor/dataEditor.interface.js
console.log('[DATA_EDITOR][INTERFACE] loaded');

export function renderDataEditorLayout(container) {
    container.innerHTML = `
        <div class="data-editor">
            <h2>Data Editor</h2>

            <input type="file" id="data-file-input" />

            <div class="table-container">
                <table id="data-table"></table>
            </div>
        </div>
    `;
}

export function renderTable(headers, rows) {
    const table = document.getElementById('data-table');
    if (!table) return;

    let html = '<thead><tr>';
    headers.forEach(h => {
        html += `<th>${h}</th>`;
    });
    html += '</tr></thead><tbody>';

    rows.forEach(row => {
        html += '<tr>';
        headers.forEach(h => {
            html += `<td>${row[h] ?? ''}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody>';
    table.innerHTML = html;
}
