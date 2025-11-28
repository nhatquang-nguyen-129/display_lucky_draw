// State cho TableEditorEdit module

export const editState = {
    draftRows: new Map(),    // idx → draft data
    selectedRows: new Set(), // row được chọn
    originalRows: new Map()  // idx → original row data
};

/**
 * Cập nhật draft row
 * @param {number} idx 
 * @param {Object} draftData 
 */
export function updateDraft(idx, draftData) {
    editState.draftRows.set(idx, draftData);
}

/**
 * Cập nhật selected row
 * @param {number} idx 
 * @param {boolean} isSelected 
 */
export function updateSelected(idx, isSelected) {
    if (isSelected) editState.selectedRows.add(idx);
    else editState.selectedRows.delete(idx);
}
