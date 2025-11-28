import { dedupState, updateDedupState } from "./tableEditorDedup.state.js";

// Render dropdown checkbox các cột dedup
export function renderDedupDropdown(dropdown, headers, data, renderTable) {
    dropdown.innerHTML = "";

    headers.forEach(col => {
        const div = document.createElement("div");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = dedupState.dedupColumns.includes(col);

        cb.addEventListener("change", () => {
            const newCols = cb.checked
                ? [...dedupState.dedupColumns, col]
                : dedupState.dedupColumns.filter(c => c !== col);

            updateDedupState(newCols, data);
            renderTable();
        });

        div.appendChild(cb);
        div.appendChild(document.createTextNode(col));
        dropdown.appendChild(div);
    });
}