import { textState } from './tableEditorText.state.js';
import { applyCaseToColumn, toTitleCase, toUpperCase, toLowerCase } from './tableEditorText.api.js';

export function initTableEditorText({ container, data, renderTable }) {
    const columns = Object.keys(data[0] || {});

    // Render UI
    const onApplyCase = (column, caseType) => {
        let caseFunc;
        switch(caseType) {
            case 'title': caseFunc = toTitleCase; break;
            case 'upper': caseFunc = toUpperCase; break;
            case 'lower': caseFunc = toLowerCase; break;
            default: return;
        }
        const newData = applyCaseToColumn(data, column, caseFunc);
        // Cập nhật data gốc
        data.splice(0, data.length, ...newData);
        renderTable();
    };

    import('./tableEditorText.ui.js').then(module => {
        module.renderTextUI(container, columns, onApplyCase);
    });
}
