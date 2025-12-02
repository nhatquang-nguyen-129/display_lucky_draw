import { editState } from './tableEditorEdit.state.js';

// Render dropdown / toolbar / nút edit
export function renderEditUI(container) {
    container.innerHTML = `
        <div class="edit-toolbar">
            <button id="editAllBtn">Edit All</button>
            <button id="saveDraftBtn">Save Draft</button>
            <button id="saveAllDraftsBtn">Save All Drafts</button>
            <button id="discardAllDraftsBtn">Discard All Drafts</button>
            <button id="deleteSelectedBtn">Delete Selected</button>
            <div class="edit-dropdown" id="edit-dropdown"></div>
        </div>
    `;

    return {
        editDropdown: container.querySelector('#edit-dropdown'),
        saveDraftBtn: container.querySelector('#saveDraftBtn'),
        saveAllDraftsBtn: container.querySelector('#saveAllDraftsBtn'),
        discardAllDraftsBtn: container.querySelector('#discardAllDraftsBtn'),
        deleteSelectedBtn: container.querySelector('#deleteSelectedBtn'),
        editAllBtn: container.querySelector('#editAllBtn')
    };
}

/**
 * Render bảng checkbox row selected
 * @param {HTMLTableElement} tableEl 
 * @param {Set<number>} selectedRows 
 */
export function renderRowSelection(tableEl, selectedRows) {
    Array.from(tableEl.rows).forEach((row, idx) => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = selectedRows.has(idx);
    });
}
