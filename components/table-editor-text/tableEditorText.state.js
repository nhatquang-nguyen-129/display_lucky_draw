export const textState = {
    selectedColumn: null,
    currentCase: null // 'title', 'upper', 'lower'
};

/**
 * Cập nhật column và case hiện tại
 */
export function updateTextState(column, caseType) {
    textState.selectedColumn = column;
    textState.currentCase = caseType;
}
