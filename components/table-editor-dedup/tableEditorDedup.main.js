// tableEditorDedup.main.js
// -----------------------------
// Deduplicate UI: dropdown chọn cột, cập nhật table
// -----------------------------

import { getDedupPreview } from "./tableEditorDedup.api.js";

export function initTableEditorDedup({ dedupBtn, dedupDropdown, data, dedupColumns, renderTable, duplicateRows }) {
    dedupBtn.addEventListener("click", () => {
        dedupDropdown.style.display =
            dedupDropdown.style.display === "none" ? "block" : "none";
        renderDedupDropdown();
    });

    function renderDedupDropdown() {
        dedupDropdown.innerHTML = "";
        const headers = Object.keys(data[0] || {});
        headers.forEach(col => {
            const div = document.createElement("div");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = dedupColumns.includes(col);
            cb.addEventListener("change", () => {
                if (cb.checked) dedupColumns.push(col);
                else dedupColumns = dedupColumns.filter(c => c !== col);

                // Cập nhật duplicateRows dựa trên cột đã chọn
                const result = getDedupPreview(data, dedupColumns);
                duplicateRows.clear();
                result.duplicateRows.forEach(idx => duplicateRows.add(idx));

                renderTable();
            });
            div.appendChild(cb);
            div.appendChild(document.createTextNode(col));
            dedupDropdown.appendChild(div);
        });
    }
}
