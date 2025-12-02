import { editState, updateDraft, updateSelected } from './tableEditorEdit.state.js';
import { applyDraft, deleteSelectedRows } from './tableEditor.api.js';
import { renderRowSelection } from './tableEditorEdit.ui.js';

export function initTableEditorEdit(config) {
    const {
        editDropdown,
        saveDraftBtn,
        saveAllDraftsBtn,
        discardAllDraftsBtn,
        deleteSelectedBtn,
        editAllBtn,
        data,
        draftRows,
        selectedRows,
        originalRows,
        renderTable
    } = config;

    // Bind nút save draft
    saveDraftBtn.addEventListener('click', () => {
        draftRows.clear(); // ví dụ chỉ clear hoặc lưu tạm, tùy logic
        renderTable();
    });

    saveAllDraftsBtn.addEventListener('click', () => {
        // Áp dụng tất cả draft lên data
        const newData = applyDraft(data, draftRows);
        draftRows.clear();
        renderTable(newData);
    });

    discardAllDraftsBtn.addEventListener('click', () => {
        draftRows.clear();
        renderTable();
    });

    deleteSelectedBtn.addEventListener('click', () => {
        const newData = deleteSelectedRows(data, selectedRows);
        selectedRows.clear();
        renderTable(newData);
    });

    editAllBtn.addEventListener('click', () => {
        // Logic edit tất cả row, ví dụ hiện modal chỉnh sửa (nếu có)
    });
}
