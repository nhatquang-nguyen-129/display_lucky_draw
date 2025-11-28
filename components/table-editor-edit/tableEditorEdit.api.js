/* components/table-editor-edit/tableEditorEdit.api.js
API logic cho Table Editor - Edit
- Lưu các row đã chỉnh sửa vào originalRows, xóa khỏi draftRows
*/

// 1.1. Save Draft
export function saveDraft(
    draftRows, 
    originalRows, 
    data
) {
    draftRows.forEach(idx => originalRows.set(idx, { ...data[idx] }));
    draftRows.clear();
}

// 1.2. Discard DraftRows to originalRows
export function discardDraft(
    draftRows, 
    originalRows, 
    data
) {
        draftRows.forEach(idx => {
        if (originalRows.has(idx)) data[idx] = { ...originalRows.get(idx) };
    });
    draftRows.clear();
}

// 1.3. Delete selected rows
export function deleteSelectedRows(selectedRows, draftRows, data) {
    draftRows.clear();
    selectedRows.clear();
    return data.filter((_, idx) => !selectedRows.has(idx));
}

// 1.4. Select all rows
 export function editAllRows(data, selectedRows, originalRows) {
    selectedRows.clear();
    data.forEach((row, idx) => {
        selectedRows.add(idx);
        if (!originalRows.has(idx)) originalRows.set(idx, { ...row });
    });
}
