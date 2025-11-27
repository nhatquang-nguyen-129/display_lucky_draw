// components/TableEditor.js

// ================== 1. IMPORTS ==================
import { loadComponentCSS } from "../utils/loadComponentCSS.js";

// 1.1 Gộp CSS cho dashboard + table editor
loadComponentCSS("../styles/dashboard.css");
loadComponentCSS("../styles/TableEditor.css");

// ================== 2. RENDER TABLE EDITOR ==================
export function renderTableEditor(container, initialData = []) {
    let data = initialData;                 
    let selectedRows = new Set();           
    let duplicateRows = new Set();          
    let dedupColumns = [];                  
    let isEditing = false;                  
    let draftRows = new Set(); // row đã chỉnh sửa (Draft)

    container.innerHTML = `
        <div id="dashboard-container">
            <div class="csv-toolbar">
                <button id="importBtn">Import</button>
                <div style="position: relative;">
                    <button id="editBtn" class="secondary">Edit</button>
                    <div id="editDropdown" class="edit-dropdown" style="display:none;position:absolute;top:100%;left:0;background:#fff;border:1px solid #ccc;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.15);z-index:10;">
                        <div id="saveBtn" style="padding:5px 10px;cursor:pointer;">Save</div>
                        <div id="discardBtn" style="padding:5px 10px;cursor:pointer;">Discard</div>
                    </div>
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
    const dedupBtn = container.querySelector("#dedupBtn");
    const editDropdown = container.querySelector("#editDropdown");
    const saveBtn = container.querySelector("#saveBtn");
    const discardBtn = container.querySelector("#discardBtn");

    function updateDraftCount() {
        const count = draftRows.size;
        editBtn.textContent = isEditing ? `Save (${count})` : `Edit${count ? ` (${count})` : ""}`;
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
        data.forEach((row, i) => {
            const tr = document.createElement("tr");

            if (duplicateRows.has(i)) tr.classList.add("duplicate-row");
            if (selectedRows.has(i)) tr.classList.add("selected-row");
            if (isEditing && selectedRows.has(i)) tr.classList.add("editing-row");
            if (draftRows.has(i)) tr.classList.add("draft-row");

            const tdCheck = document.createElement("td");
            tdCheck.style.textAlign = "center";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = selectedRows.has(i);
            cb.addEventListener("change", () => {
                if (cb.checked) selectedRows.add(i);
                else selectedRows.delete(i);
                renderTable();
            });
            tdCheck.appendChild(cb);
            tr.appendChild(tdCheck);

            headers.forEach(col => {
                const td = document.createElement("td");
                td.textContent = row[col];
                td.contentEditable = isEditing && selectedRows.has(i);

                td.addEventListener("input", () => {
                    if (td.isContentEditable) {
                        row[col] = td.textContent;
                        draftRows.add(i);
                        updateDraftCount();
                        duplicateRows.clear();
                    }
                });

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        updateDraftCount();
    }

    // ================== 4. BUTTON LOGIC ==================

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

    // Edit button toggle
    editBtn.addEventListener("click", (e) => {
        if (!selectedRows.size && !isEditing) return alert("Select at least one row to edit");
        if (!isEditing) {
            isEditing = true;
            editDropdown.style.display = "block";
        } else {
            // Khi click lần nữa trong trạng thái editing -> toggle dropdown
            editDropdown.style.display = editDropdown.style.display === "block" ? "none" : "block";
        }
        renderTable();
    });

    // Save
    saveBtn.addEventListener("click", () => {
        console.log("Saved rows:", Array.from(draftRows).map(i => data[i]));
        draftRows.clear();
        updateDraftCount();
        isEditing = false;
        editDropdown.style.display = "none";
        renderTable();
    });

    // Discard
    discardBtn.addEventListener("click", () => {
        // Reload data từ trạng thái trước khi chỉnh sửa (Draft)
        draftRows.forEach(i => {
            // reset các ô về data gốc trước khi edit
            // do đây demo, coi như dữ liệu gốc vẫn giữ
        });
        draftRows.clear();
        updateDraftCount();
        isEditing = false;
        editDropdown.style.display = "none";
        renderTable();
    });

    // Deduplicate
    dedupBtn.addEventListener("click", () => {
        if (!data.length) return;

        if (!dedupColumns.length) {
            const dropdown = document.createElement("div");
            dropdown.classList.add("dedup-dropdown");
            const headers = Object.keys(data[0]);
            headers.forEach(h => {
                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.value = h;
                const label = document.createElement("label");
                label.textContent = h;
                label.prepend(cb);
                dropdown.appendChild(label);
                dropdown.appendChild(document.createElement("br"));
                cb.addEventListener("change", () => {
                    dedupColumns = Array.from(dropdown.querySelectorAll("input:checked")).map(i => i.value);
                });
            });
            container.querySelector(".csv-toolbar").appendChild(dropdown);
            return;
        }

        const seen = new Map();
        duplicateRows.clear();
        data.forEach((row, i) => {
            const key = dedupColumns.map(c => row[c]).join("|");
            if (seen.has(key)) duplicateRows.add(i);
            else seen.set(key, i);
        });
        renderTable();
    });

    renderTable();

    return { getData: () => data };
}
