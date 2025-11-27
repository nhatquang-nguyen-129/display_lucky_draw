// components/TableEditor.js
import { loadComponentCSS } from "../utils/loadComponentCSS.js";

// Gộp dashboard + editor css
loadComponentCSS("../styles/dashboard.css");
loadComponentCSS("../styles/TableEditor.css");

export function renderTableEditor(container, initialData = []) {
    let data = initialData;
    let selectedRows = new Set();
    let duplicateRows = new Set();
    let dedupColumns = [];

    container.innerHTML = `
        <div id="dashboard-container">
            <div class="csv-toolbar">
                <button id="importBtn">Import</button>
                <button id="editBtn" class="secondary">Edit</button>
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

    // Render Table dù chưa có dữ liệu
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
        // Header
        const thead = document.createElement("thead");
        const trHead = document.createElement("tr");
        trHead.appendChild(document.createElement("th")); // checkbox cột đầu
        headers.forEach(h => {
            const th = document.createElement("th");
            th.textContent = h;
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement("tbody");
        data.forEach((row, i) => {
            const tr = document.createElement("tr");
            if (selectedRows.has(i)) tr.classList.add("selected-row");
            if (duplicateRows.has(i)) tr.classList.add("duplicate-row");

            // checkbox
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
                td.contentEditable = true;
                td.textContent = row[col];
                td.addEventListener("input", () => {
                    row[col] = td.textContent;
                    duplicateRows.clear();
                });
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
    }

    // Buttons
    importBtn.addEventListener("click", async () => {
        if (!window.api || !window.api.loadCSV) return;
        const result = await window.api.loadCSV();
        if (result?.data?.length) {
            data = result.data;
            renderTable();
            importBtn.textContent = "Replace";
        }
    });

    editBtn.addEventListener("click", () => {
        // Edit + Save logic
        console.log("Edited data:", data);
        alert(`Saved ${data.length} rows`);
    });

    dedupBtn.addEventListener("click", () => {
        if (!data.length) return;
        if (!dedupColumns.length) {
            // Show dropdown chọn columns (simplified)
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
                cb.addEventListener("change", e => {
                    dedupColumns = Array.from(dropdown.querySelectorAll("input:checked")).map(i => i.value);
                });
            });
            container.querySelector(".csv-toolbar").appendChild(dropdown);
            return;
        }

        // highlight duplicate rows theo key
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
