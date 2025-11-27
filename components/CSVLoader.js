import { renderTableEditor } from "./TableEditor.js";

export function renderCSVModule(container) {

    const div = document.createElement('div');
    div.id = 'csvLoader';
    div.innerHTML = `
        <h2>CSV Data Loader</h2>
        <button id="loadBtn" class="btn-primary">Select Data Source</button>
        <p id="status">No file loaded</p>
        <div id="editorContainer"></div>
    `;
    container.appendChild(div);

    let csvData = [];

    document.getElementById('loadBtn').addEventListener('click', async () => {
        if (!window.api || !window.api.loadCSV) {
            alert("loadCSV API not found");
            return;
        }

        try {
            const result = await window.api.loadCSV();

            // result trả về dạng:
            // { filePath, rows, data }
            if (result && result.data && result.data.length > 0) {
                csvData = result.data;

                document.getElementById('status').innerText =
                    `✅ Loaded ${csvData.length} rows from: ${result.filePath.split("\\").pop()}`;

                const editorContainer = document.getElementById('editorContainer');
                editorContainer.innerHTML = ""; // clear UI cũ

                renderTableEditor(editorContainer, csvData);

            } else {
                document.getElementById('status').innerText = "⚠ No data loaded";
            }
        } catch (err) {
            console.error(err);
            document.getElementById('status').innerText = "❌ Error loading file";
        }
    });

    return {
        getData: () => csvData
    };
}
