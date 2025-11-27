export function renderTableEditor(container, data) {
    container.innerHTML = `
        <div id="dashboard-container">

            <div class="csv-toolbar">
                <button id="addRowBtn">+ Add Row</button>
                <button id="deleteRowBtn" class="danger">Delete Selected</button>
                <button id="checkDupBtn" class="secondary">Check Duplicates</button>
            </div>

            <div class="csv-table-wrapper">
                <table id="csvTable" class="csv-table"></table>
            </div>
        </div>
    `;

    let selectedRowIndex = null;

    const table = document.getElementById("csvTable");
    const headers = Object.keys(data[0]);

    function renderTable() {
        table.innerHTML = "";

        // Header
        let headerRow = document.createElement("tr");
        headers.forEach(h => {
            const th = document.createElement("th");
            th.textContent = h;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);

        // Rows
        data.forEach((row, rowIndex) => {
            let tr = document.createElement("tr");

            if (rowIndex === selectedRowIndex) tr.style.background = "#333";

            tr.addEventListener("click", () => {
                selectedRowIndex = rowIndex;
                renderTable();
            });

            headers.forEach(col => {
                const td = document.createElement("td");
                td.textContent = row[col];
                td.contentEditable = true;

                td.addEventListener("input", e => {
                    data[rowIndex][col] = e.target.textContent;
                });

                tr.appendChild(td);
            });

            table.appendChild(tr);
        });
    }

    // Toolbar buttons
    document.getElementById("addRowBtn").addEventListener("click", () => {
        const emptyRow = {};
        headers.forEach(h => emptyRow[h] = "");
        data.push(emptyRow);
        renderTable();
    });

    document.getElementById("deleteRowBtn").addEventListener("click", () => {
        if (selectedRowIndex !== null) {
            data.splice(selectedRowIndex, 1);
            selectedRowIndex = null;
            renderTable();
        }
    });

    document.getElementById("checkDupBtn").addEventListener("click", () => {
        const col = headers[0]; // default key column
        const seen = new Set();
        const duplicates = new Set();

        data.forEach(row => {
            const value = row[col].trim();
            if (seen.has(value)) duplicates.add(value);
            seen.add(value);
        });

        [...table.querySelectorAll("td")].forEach(td =>
            td.classList.remove("duplicate-cell")
        );

        data.forEach((row, rowIndex) => {
            if (duplicates.has(row[headers[0]].trim())) {
                table.rows[rowIndex + 1].cells[0].classList.add("duplicate-cell");
            }
        });
    });

    renderTable();

    return {
        getData: () => data
    };
}
