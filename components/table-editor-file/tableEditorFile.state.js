// State module TableEditorFile
export const fileState = {
    currentFileName: null,
    data: []
};

/**
 * Cập nhật data module
 * @param {Array<Object>} newData
 */
export function updateFileData(newData) {
    fileState.data = newData;
}
