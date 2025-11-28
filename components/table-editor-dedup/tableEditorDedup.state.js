import { getDedupPreview } from "./tableEditorDedup.api.js";

export const dedupState = {
    dedupColumns: [],
    duplicateRows: new Set(),
    previewData: []
};

export function updateDedupState(newColumns, data) {
    dedupState.dedupColumns = [...newColumns];
    const { preview, duplicateRows } = getDedupPreview(data, newColumns);
    dedupState.previewData = preview;
    dedupState.duplicateRows = duplicateRows;
}
