// tableEditorEdit.main.js
import * as TableEditAPI from "./tableEditorEdit.api.js";

/**
 * Gắn sự kiện Edit toolbar cho Table Editor
 * @param {Object} config
 *   - editDropdown: HTMLElement dropdown chứa các nút Edit
 *   - data: Array bảng dữ liệu
 *   - draftRows: Set các row đang chỉnh sửa
 *   - selectedRows: Set các row được chọn
 *   - originalRows: Map row gốc
 *   - renderTable: function render lại bảng
 */
export function initTableEditorEdit({
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
}) {
    // Save draft row hiện tại
    saveDraftBtn.addEventListener("click", () => {
        TableEditAPI.saveDraft(draftRows, originalRows, data);
        renderTable();
    });

    // Save all drafts (giống saveDraft cho tất cả)
    saveAllDraftsBtn.addEventListener("click", () => {
        TableEditAPI.saveDraft(draftRows, originalRows, data);
        renderTable();
    });

    // Discard draft row
    discardAllDraftsBtn.addEventListener("click", () => {
        TableEditAPI.discardDraft(draftRows, originalRows, data);
        renderTable();
    });

    // Delete selected row
    deleteSelectedBtn.addEventListener("click", () => {
        data = TableEditAPI.deleteSelectedRows(selectedRows, draftRows, data);
        renderTable();
    });

    // Edit all rows
    editAllBtn.addEventListener("click", () => {
        TableEditAPI.editAllRows(data, selectedRows, originalRows);
        renderTable();
    });
}
