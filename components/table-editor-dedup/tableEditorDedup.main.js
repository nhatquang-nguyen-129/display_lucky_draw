import { renderDedupDropdown } from "./tableEditorDedup.ui.js";

export function initTableEditorDedup(config) {
    const { dedupBtn, dedupDropdown, data, renderTable } = config;

    dedupBtn.addEventListener("click", () => {
        dedupDropdown.style.display =
            dedupDropdown.style.display === "none" ? "block" : "none";
        renderDedupDropdown(dedupDropdown, Object.keys(data[0] || {}), data, renderTable);
    });
}