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
                <div style="position: relative; display: flex; align-items: center;">
                    <button id="editBtn" class="secondary">Edit</button>
                    <button id="editSubBtn" class="secondary" style="margin-left:4px;">▼</button>
                    <div id="editDropdown" class="edit-dropdown" style="display:none;">
                        <button id="saveDraftBtn">Save</button>
                        <button id="saveAllDraftsBtn">Save All Drafts</button>
                        <button id="discardAllDraftsBtn">Discard All Drafts</button>
                        <button id="deleteSelectedBtn">Delete Selected Rows</button>
                        <button id="editAllBtn">Edit All Rows</button>
                    </div>
                </div>
                <div style="position: relative; display: flex; align-items: center;">
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
    const editSubBtn = container.querySelector("#editSubBtn");
    const dedupBtn = container.querySelector("#dedupBtn");
    const editDropdown = container.querySelector("#editDropdown");
    const dedupDropdown = container.querySelector("#dedupDropdown");
    const saveDraftBtn = editDropdown.querySelector("#saveDraftBtn");
    const saveAllDraftsBtn = editDropdown.querySelector("#saveAllDraftsBtn");
    const discardAllDraftsBtn = editDropdown.querySelector("#discardAllDraftsBtn");
    const deleteSelectedBtn = editDropdown.querySelector("#deleteSelectedBtn");
    const editAllBtn = editDropdown.querySelector("#editAllBtn");

    // ================== HELPER FUNCTIONS ==================
    function updateDraftCount() {
        const count = draftRows.size;
        editBtn.textContent = isEditing ? `Save (${count})` : `Edit${count ? ` (${count})` : ""}`;
    }

    function toggleEditSubBtn() {
        editSubBtn.style.display = "inline-block";
        editSubBtn.style.height = `${editBtn.offsetHeight}px`;
    }

    function getPreviewData() {
        if (!dedupColumns.length) return data.map((row, idx) => ({ row, idx }));
        const groups = new Map();
        const uniqueRows = [];
        data.forEach((row, idx) => {
            const key = dedupColumns.map(c => row[c]).join("|");
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ row, idx });
        });
        const sortedData = [];
        duplicateRows.clear();
        groups.forEach(group => {
            if (group.length > 1) {
                group.forEach(({ row, idx }) => {
                    sortedData.push({ row, idx });
                    duplicateRows.add(sortedData.length - 1);
                });
            } else uniqueRows.push(group[0]);
        });
        uniqueRows.forEach(item => sortedData.push(item));
        return sortedData;
    }

    function renderTable() {
        table.innerHTML = "";

        if (!data.length) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 2;
            td.textContent = "No data yet";
            td.style.textAlign = "center";
            tr.appendChild(td);
            table.appendChild(tr);
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
        const previewData = getPreviewData();
        let lastKey = null;
        let duplicateGroupCounter = -1;

        previewData.forEach(({ row, idx }, displayIdx) => {
            const tr = document.createElement("tr");
            const key = dedupColumns.map(c => row[c]).join("|");

            if (dedupColumns.length > 0 && duplicateRows.has(displayIdx)) {
                if (key !== lastKey) duplicateGroupCounter++;
                lastKey = key;
                const shade = duplicateGroupCounter % 2 === 0 ? 'rgba(255, 99, 71, 0.15)' : 'rgba(255, 99, 71, 0.25)';
                tr.style.backgroundColor = shade;
                tr.classList.add("duplicate-row");
            }

            if (isEditing && selectedRows.has(idx)) tr.classList.add("editing-row");
            else if (draftRows.has(idx)) tr.classList.add("draft-row");
            if (selectedRows.has(idx)) tr.classList.add("selected-row");

            const tdCheck = document.createElement("td");
            tdCheck.style.textAlign = "center";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = selectedRows.has(idx);
            cb.addEventListener("change", () => {
                if (cb.checked) selectedRows.add(idx);
                else selectedRows.delete(idx);
                renderTable();
                toggleEditSubBtn();
            });
            tdCheck.appendChild(cb);
            tr.appendChild(tdCheck);

            headers.forEach(col => {
                const td = document.createElement("td");
                td.textContent = row[col];
                td.contentEditable = isEditing && selectedRows.has(idx);
                td.addEventListener("input", () => {
                    if (td.isContentEditable) {
                        row[col] = td.textContent;
                        draftRows.add(idx);
                        updateDraftCount();
                        duplicateRows.clear();
                        toggleEditSubBtn();
                    }
                });
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        updateDraftCount();
        toggleEditSubBtn();
    }

    // ================== BUTTON LOGIC ==================
    importBtn.addEventListener("click", async () => {
        if (!window.api || !window.api.loadCSV) return;
        const result = await window.api.loadCSV();
        if (result?.data?.length) {
            data = result.data;
            draftRows.clear();
            renderTable();
            importBtn.textContent = "Replace";
        }
    });

    saveBtn.addEventListener("click", async () => {
        if (!projectName) return alert("Project name not specified.");
        if (!window.api || !window.api.saveProjectData) return alert("Save API not available.");
        try {
            await window.api.saveProjectData(projectName, data);
            draftRows.clear();
            selectedRows.clear();
            alert("Project saved successfully!");
            renderTable();
        } catch (err) {
            console.error(err);
            alert("Error saving project: " + err.message);
        }
    });

    editBtn.addEventListener("click", () => {
        isEditing = true;
        if (!selectedRows.size) data.forEach((_, idx) => selectedRows.add(idx));
        selectedRows.forEach(idx => {
            if (!originalRows.has(idx)) originalRows.set(idx, { ...data[idx] });
        });
        renderTable();
    });

    editSubBtn.addEventListener("click", () => {
        editDropdown.style.display = editDropdown.style.display === "none" ? "block" : "none";
    });

    // Edit Dropdown Actions
    saveDraftBtn.addEventListener("click", () => {
        draftRows.forEach(idx => originalRows.set(idx, { ...data[idx] }));
        draftRows.clear();
        renderTable();
    });

    saveAllDraftsBtn.addEventListener("click", () => {
        data.forEach((row, idx) => {
            if (draftRows.has(idx)) originalRows.set(idx, { ...row });
        });
        draftRows.clear();
        renderTable();
    });

    discardAllDraftsBtn.addEventListener("click", () => {
        draftRows.forEach(idx => {
            if (originalRows.has(idx)) data[idx] = { ...originalRows.get(idx) };
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
        data.forEach((_, idx) => selectedRows.add(idx));
        isEditing = true;
        selectedRows.forEach(idx => {
            if (!originalRows.has(idx)) originalRows.set(idx, { ...data[idx] });
        });
        renderTable();
        editDropdown.style.display = "none";
    });

    // Deduplicate Dropdown
    dedupBtn.addEventListener("click", () => {
        dedupDropdown.style.display = dedupDropdown.style.display === "none" ? "block" : "none";
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
            const label = document.createElement("label");
            label.textContent = col;
            div.appendChild(label);
            dedupDropdown.appendChild(div);
        });
    }

    renderTable();

    return { getData: () => data };
}
