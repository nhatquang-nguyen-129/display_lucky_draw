// components/editor-project-table.js

import { loadComponentCSS } from "../utils/loadComponentCSS.js";
loadComponentCSS("../styles/TableEditor.css");

export function renderTableEditor(container, initialData = [], projectName = "") {
    let data = initialData;
    let selectedRows = new Set();
    let duplicateRows = new Set();
    let dedupColumns = [];
    let isEditing = false;
    let draftRows = new Set();
    let originalRows = new Map();

    container.innerHTML = `
        <div id="dashboard-container">
            <div class="csv-toolbar">
                <button id="importBtn">Import</button>
                <button id="saveBtn">Save</button>

                <!-- Unified EDIT button (with dropdown) -->
                <div style="position: relative;">
                    <button id="editBtn" class="secondary">Edit ▼</button>
                    <div id="editDropdown" class="edit-dropdown" style="display:none;">
                        <button id="saveDraftBtn">Save</button>
                        <button id="saveAllDraftsBtn">Save All Drafts</button>
                        <button id="discardAllDraftsBtn">Discard All Drafts</button>
                        <button id="deleteSelectedBtn">Delete Selected Rows</button>
                        <button id="editAllBtn">Edit All Rows</button>
                    </div>
                </div>

                <!-- Unified DEDUP button -->
                <div style="position: relative;">
                    <button id="dedupBtn" class="secondary">Deduplicate ▼</button>
                    <div id="dedupDropdown" class="edit-dropdown" style="display:none;"></div>
                </div>
            </div>

            <div class="csv-table-wrapper">
                <table id="csvTable" class="csv-table"></table>
            </div>
        </div>
    `;

    const table = container.querySelector("#csvTable");
    const importBtn = container.querySelector("#importBtn");
    const saveBtn = container.querySelector("#saveBtn");

    const editBtn = container.querySelector("#editBtn");
    const editDropdown = container.querySelector("#editDropdown");

    const dedupBtn = container.querySelector("#dedupBtn");
    const dedupDropdown = container.querySelector("#dedupDropdown");

    const saveDraftBtn = editDropdown.querySelector("#saveDraftBtn");
    const saveAllDraftsBtn = editDropdown.querySelector("#saveAllDraftsBtn");
    const discardAllDraftsBtn = editDropdown.querySelector("#discardAllDraftsBtn");
    const deleteSelectedBtn = editDropdown.querySelector("#deleteSelectedBtn");
    const editAllBtn = editDropdown.querySelector("#editAllBtn");

    // ---------------- Helper ----------------

    function updateDraftCount() {
        const count = draftRows.size;
        editBtn.textContent = isEditing ? `Save (${count}) ▼` : `Edit${count ? ` (${count})` : ""} ▼`;
    }

    function getPreviewData() {
        if (!dedupColumns.length)
            return data.map((row, idx) => ({ row, idx }));

        const groups = new Map();

        // Gom nhóm theo key
        data.forEach((row, idx) => {
            const key = dedupColumns.map(c => row[c]).join("|");
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ row, idx });
        });

        const duplicatePart = [];
        const uniquePart = [];

        duplicateRows.clear();

        // Tách phần duplicate và unique
        groups.forEach((group, key) => {
            if (group.length > 1) {
                group.forEach(item => duplicatePart.push(item));
                group.forEach(item => duplicateRows.add(item.idx));
            } else {
                uniquePart.push(group[0]);
            }
        });

        // 🟢 Sort duplicate lên trước
        return [...duplicatePart, ...uniquePart];
    }

    // ---------------- Render ----------------

    function renderTable() {
        table.innerHTML = "";
        if (!data.length) {
            table.innerHTML = `<tr><td>No data yet</td></tr>`;
            return;
        }

        const headers = Object.keys(data[0]);

        const thead = document.createElement("thead");
        const trHead = document.createElement("tr");
        trHead.appendChild(document.createElement("th"));
        headers.forEach(h => {
            const th = document.createElement("th");
            th.textContent = h;
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        const preview = getPreviewData();

        // ---- NEW: tạo group duplicate để tô màu xen kẽ ----
        const duplicateGroupMap = new Map();
        if (dedupColumns.length) {
            let currentGroupId = 0;
            let lastKey = null;

            preview.forEach(({ row }) => {
                const key = dedupColumns.map(c => row[c]).join("|");

                if (key !== lastKey) currentGroupId++;
                duplicateGroupMap.set(key, currentGroupId);

                lastKey = key;
            });
        }

        preview.forEach(({ row, idx }) => {
            const tr = document.createElement("tr");

            // Remove old inline styling
            tr.style.backgroundColor = "";
            tr.style.outline = "";

            // --- LEGACY CLASS MARKERS (giữ nguyên) ---
            if (duplicateRows.has(idx)) tr.classList.add("duplicate-row");
            if (selectedRows.has(idx)) tr.classList.add("selected-row");
            if (draftRows.has(idx)) tr.classList.add("draft-row");

            // --- NEW COLOR LOGIC ---

            // 🟡 Draft row ALWAYS wins (override duplicate)
            if (draftRows.has(idx)) {
                tr.style.backgroundColor = "#fff6d1 !important";
                tr.dataset.forceColor = "draft"; // chặn màu duplicate
            }

            // Duplicate groups → alternating red shades
            if (duplicateRows.has(idx) && tr.dataset.forceColor !== "draft") {
                const key = dedupColumns.map(c => row[c]).join("|");
                const gid = duplicateGroupMap.get(key) || 0;
                const color = gid % 2 === 0 ? "#ffe5e5" : "#ffd1d1";
                tr.style.backgroundColor = color;
            }

            // Selected row border highlight
            if (selectedRows.has(idx)) {
                tr.style.outline = "2px solid #2d7dff";
            }

            // Checkbox
            const tdCheck = document.createElement("td");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = selectedRows.has(idx);
            cb.addEventListener("change", () => {
                cb.checked ? selectedRows.add(idx) : selectedRows.delete(idx);
                renderTable();
            });
            tdCheck.appendChild(cb);
            tr.appendChild(tdCheck);

            // Cells
            headers.forEach(col => {
                const td = document.createElement("td");
                td.textContent = row[col];

                // Double click --> start editing that row
                td.addEventListener("dblclick", () => {
                    isEditing = true;
                    selectedRows.clear();
                    selectedRows.add(idx);

                    if (!originalRows.has(idx))
                        originalRows.set(idx, { ...row });

                    renderTable();
                });

                td.contentEditable = isEditing && selectedRows.has(idx);

                td.addEventListener("input", () => {
                    if (td.isContentEditable) {
                        row[col] = td.textContent;
                        draftRows.add(idx);
                        updateDraftCount();
                    }
                });

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        updateDraftCount();
    }

    // ---------------- Buttons ----------------

    // Import
    importBtn.addEventListener("click", async () => {
        if (!window.api?.loadCSV) return;
        const result = await window.api.loadCSV();
        if (result?.data?.length) {
            data = result.data;
            draftRows.clear();
            renderTable();
        }
    });

    // Save to backend
    saveBtn.addEventListener("click", async () => {
        if (!projectName) return alert("Project name not specified.");
        if (!window.api?.saveProjectData) return alert("Save API not available.");
        await window.api.saveProjectData(projectName, data);
        draftRows.clear();
        selectedRows.clear();
        renderTable();
        alert("Saved!");
    });

    // EDIT button toggle dropdown
    editBtn.addEventListener("click", () => {
        editDropdown.style.display =
            editDropdown.style.display === "none" ? "block" : "none";
    });

    // Edit actions
    saveDraftBtn.addEventListener("click", () => {
        draftRows.forEach(i => originalRows.set(i, { ...data[i] }));
        draftRows.clear();
        renderTable();
    });

    saveAllDraftsBtn.addEventListener("click", () => {
        draftRows.forEach(i => originalRows.set(i, { ...data[i] }));
        draftRows.clear();
        renderTable();
    });

    discardAllDraftsBtn.addEventListener("click", () => {
        draftRows.forEach(i => {
            if (originalRows.has(i)) data[i] = { ...originalRows.get(i) };
        });
        draftRows.clear();
        renderTable();
    });

    deleteSelectedBtn.addEventListener("click", () => {
        data = data.filter((_, idx) => !selectedRows.has(idx));
        selectedRows.clear();
        draftRows.clear();
        renderTable();
    });

    editAllBtn.addEventListener("click", () => {
        selectedRows = new Set(data.map((_, i) => i));
        isEditing = true;
        data.forEach((row, idx) => {
            if (!originalRows.has(idx)) originalRows.set(idx, { ...row });
        });
        renderTable();
        editDropdown.style.display = "none";
    });

    // DEDUP button toggle dropdown
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
                renderTable();
            });
            div.appendChild(cb);
            div.appendChild(document.createTextNode(col));
            dedupDropdown.appendChild(div);
        });
    }

    renderTable();
    return { getData: () => data };
}
