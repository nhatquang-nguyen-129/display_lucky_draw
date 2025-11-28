import { textState, updateTextState } from './tableEditorText.state.js';

// Render UI nút chỉnh Case
export function renderTextUI(container, columns, onApplyCase) {
    container.innerHTML = `
        <div class="text-toolbar">
            <select id="columnSelect">
                <option value="">-- Select Column --</option>
                ${columns.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <select id="caseSelect">
                <option value="">-- Select Case --</option>
                <option value="title">Title Case</option>
                <option value="upper">Upper Case</option>
                <option value="lower">Lower Case</option>
            </select>
            <button id="applyCaseBtn">Apply</button>
        </div>
    `;

    const columnSelect = container.querySelector('#columnSelect');
    const caseSelect = container.querySelector('#caseSelect');
    const applyBtn = container.querySelector('#applyCaseBtn');

    applyBtn.addEventListener('click', () => {
        const column = columnSelect.value;
        const caseType = caseSelect.value;
        if (!column || !caseType) return;
        updateTextState(column, caseType);
        onApplyCase(column, caseType);
    });
}
