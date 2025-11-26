export function renderCSVEditor(container, data) {
    container.innerHTML = `
        <h2>CSV Editor</h2>
        <div id="csv-editor-table" style="overflow:auto; max-height:600px;"></div>
    `;

    const tableContainer = document.getElementById("csv-editor-table");

    if (!data || data.length === 0) {
        tableContainer.innerHTML = "<p>No data loaded.</p>";
        return;
    }

    const headers = Object.keys(data[0]);

    let table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";

    // header row
    let headerRow = document.createElement("tr");
    headers.forEach(h => {
        let th = document.createElement("th");
        th.textContent = h;
        th.style.border = "1px solid #666";
        th.style.padding = "6px";
        th.style.background = "#222";
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    // data rows
    data.forEach((row, rowIndex) => {
        let tr = document.createElement("tr");

        headers.forEach(col => {
            let td = document.createElement("td");
            td.contentEditable = true;
            td.textContent = row[col];
            td.style.border = "1px solid #444";
            td.style.padding = "6px";

            td.addEventListener("input", (e) => {
                data[rowIndex][col] = e.target.textContent;
            });

            tr.appendChild(td);
        });

        table.appendChild(tr);
    });

    tableContainer.appendChild(table);

    return {
        getData: () => data
    };
}
