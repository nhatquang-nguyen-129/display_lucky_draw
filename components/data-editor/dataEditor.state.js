// components/data-editor/dataEditor.state.js
console.log('[DATA_EDITOR][STATE] init');

export const dataEditorState = {
    headers: [],
    rows: []
};

export function setTableData(headers, rows) {
    dataEditorState.headers = headers;
    dataEditorState.rows = rows;
    console.log('[DATA_EDITOR][STATE] set data', {
        headers,
        rowsCount: rows.length
    });
}
