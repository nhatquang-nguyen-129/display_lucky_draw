// components/TableEditor.js

import { loadComponentCSS } from "../utils/loadComponentCSS.js";

loadComponentCSS("../styles/TableEditor.css");

export function renderTableEditor(container, initialData = []) {
    let data = initialData;                 
    let selectedRows = new Set();           
    let duplicateRows = new Set();          
    let dedupColumns = [];                  
    let isEditing = false;                  
    let draftRows = new Set();

    container.innerHTML = `
        <div id="dashboard-container">
            <div class="csv-toolbar">
                <button id="importBtn">Import</button>
                <div style="position: relative; display: flex; align-items: center;">
                    <button id="editBtn" class="secondary">Edit</button>
                    <button id="editSubBtn" class="secondary" style="margin-left:4px;display:none;">▼</button>
                    <div id="editDropdown" class="edit-dropdown" style="display:none;"></div>
                </div>
                <button id="dedupBtn" class="secondary">Deduplicate</button>
            </div>
            <div class="csv-table-wrapper">
                <table id="csvTable" class="csv-table"></table>
            </div>
        </div>
    `;

    const table = container.querySelector("#csvTable");
    const importBtn = container.querySelector("#importBtn");
    const editBtn = container.querySelector("#editBtn");
    const editSubBtn = container.querySelector("#editSubBtn");
    const dedupBtn = container.querySelector("#dedupBtn");
    const editDropdown = container.querySelector("#editDropdown");

    function updateDraftCount() {
        const count = draftRows.size;
        editBtn.textContent = isEditing ? `Save (${count})` : `Edit${count ? ` (${count})` : ""}`;
    }

    function toggleEditSubBtn() {
        if (isEditing && (selectedRows.size || draftRows.size)) {
            editSubBtn.style.display = "inline-block";
            editSubBtn.style.height = `${editBtn.offsetHeight}px`;
        } else editSubBtn.style.display = "none";
    }

    // ================== PREVIEW DATA SORT DUPLICATES ==================
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
            } else {
                uniqueRows.push(group[0]);
            }
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

    editBtn.addEventListener("click", () => {
        if (!selectedRows.size && !isEditing && !draftRows.size) return alert("Select at least one row to edit");
        isEditing = true;
        renderTable();
    });

    editSubBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editDropdown.innerHTML = "";

        if (draftRows.size) {
            const saveAllDrafts = document.createElement("div");
            saveAllDrafts.textContent = `Save All Drafts (${draftRows.size})`;
            saveAllDrafts.style.padding = "5px 10px";
            saveAllDrafts.style.cursor = "pointer";
            saveAllDrafts.addEventListener("click", () => {
                console.log("Saved all draft rows:", Array.from(draftRows).map(i => data[i]));
                draftRows.clear();
                isEditing = false;
                renderTable();
                editDropdown.style.display = "none";
            });
            editDropdown.appendChild(saveAllDrafts);
        }

        if (selectedRows.size) {
            const saveSelected = document.createElement("div");
            saveSelected.textContent = "Save Selected";
            saveSelected.style.padding = "5px 10px";
            saveSelected.style.cursor = "pointer";
            saveSelected.addEventListener("click", () => {
                console.log("Saved selected rows:", Array.from(draftRows).filter(i => selectedRows.has(i)).map(i => data[i]));
                selectedRows.forEach(i => draftRows.delete(i));
                renderTable();
                editDropdown.style.display = "none";
            });
            editDropdown.appendChild(saveSelected);

            const discardSelected = document.createElement("div");
            discardSelected.textContent = "Discard Selected";
            discardSelected.style.padding = "5px 10px";
            discardSelected.style.cursor = "pointer";
            discardSelected.addEventListener("click", () => {
                selectedRows.forEach(i => draftRows.delete(i));
                renderTable();
                editDropdown.style.display = "none";
            });
            editDropdown.appendChild(discardSelected);
        }

        editDropdown.style.display = editDropdown.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", (e) => {
        if (!editDropdown.contains(e.target) && e.target !== editSubBtn) {
            editDropdown.style.display = "none";
        }
    });

    // ================== DEDUPLICATE SUB BUTTON FIXED ==================
    const dedupContainer = document.createElement("div");
    dedupContainer.style.position = "relative"; // quan trọng để dropdown căn theo đây
    dedupContainer.style.display = "inline-flex";
    dedupContainer.style.alignItems = "center";
    dedupContainer.style.marginLeft = "4px";

    const dedupSubBtn = document.createElement("button");
    dedupSubBtn.id = "dedupSubBtn";
    dedupSubBtn.className = "secondary";
    dedupSubBtn.textContent = "▼";
    dedupSubBtn.style.width = "24px";
    dedupSubBtn.style.height = "36px";
    dedupSubBtn.style.fontSize = "0";
    dedupSubBtn.style.padding = "0";
    dedupSubBtn.style.marginLeft = "2px";

    const dedupDropdown = document.createElement("div");
    dedupDropdown.className = "dedup-dropdown";
    dedupDropdown.style.top = "100%";
    dedupDropdown.style.left = "0";

    dedupContainer.appendChild(dedupSubBtn);
    dedupContainer.appendChild(dedupDropdown);

    container.querySelector(".csv-toolbar").appendChild(dedupContainer);

    function renderDedupColumns() {
        dedupDropdown.innerHTML = "";
        if (!data.length) return;

        Object.keys(data[0]).forEach(col => {
            const label = document.createElement("label");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.value = col;
            cb.checked = dedupColumns.includes(col);
            cb.addEventListener("change", () => {
                dedupColumns = Array.from(dedupDropdown.querySelectorAll("input:checked")).map(i => i.value);
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(col));
            dedupDropdown.appendChild(label);
        });
    }

    dedupSubBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        renderDedupColumns();
        dedupDropdown.style.display = dedupDropdown.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", e => {
        if (!dedupDropdown.contains(e.target) && e.target !== dedupSubBtn) {
            dedupDropdown.style.display = "none";
        }
    });

    dedupBtn.addEventListener("click", () => {
        if (!data.length || !dedupColumns.length) return;

        const groups = new Map();
        data.forEach((row, i) => {
            const key = dedupColumns.map(c => row[c]).join("|");
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        });

        const newData = [];
        duplicateRows.clear();
        groups.forEach(group => {
            group.forEach((row, idx) => {
                if (idx > 0) duplicateRows.add(newData.length);
                newData.push({ ...row });
            });
        });

        data = newData;
        renderTable();
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && isEditing) {
            draftRows.clear();
            isEditing = false;
            editDropdown.style.display = "none";
            renderTable();
        }
    });

    renderTable();

    return { getData: () => data };
}
