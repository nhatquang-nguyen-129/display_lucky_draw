// components/editor-project-table.js

export function renderTableEditor(container, initialData = [], initialProjectName = "") {
    let projects = {};
    let currentProject = initialProjectName;
    if (initialProjectName) projects[initialProjectName] = initialData;

    let data = initialData;
    let selectedRows = new Set();
    let duplicateRows = new Set();
    let dedupColumns = [];
    let isEditing = false;
    let draftRows = new Set();
    let originalRows = new Map();

    container.innerHTML = `
        <div id="dashboard-container">
            <div id="project-bar" class="project-bar">
                Project: <span id="current-project-name">${currentProject || "None"}</span>
            </div>

            <div id="project-tabs" class="project-tabs"></div>

            <div class="csv-toolbar">
                <button id="importBtn">Import</button>
                <button id="saveBtn">Save</button>

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

    const projectBar = container.querySelector("#project-bar");
    const projectNameEl = container.querySelector("#current-project-name");
    const projectTabs = container.querySelector("#project-tabs");
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

    /* Render số lượng Rows đang Draft */
    function updateDraftCount() {
        const count = draftRows.size;
        editBtn.textContent = isEditing ? `Save (${count}) ▼` : `Edit${count ? ` (${count})` : ""} ▼`;
    }

    function setCurrentProject(name) {
        currentProject = name;
        data = projects[name] || [];
        projectNameEl.textContent = name;
        selectedRows.clear();
        draftRows.clear();
        originalRows.clear();
        renderProjectTabs();
        renderTable();
    }

    /* Render Preview Table sau khi chỉnh sửa*/
    function getPreviewData() {
        if (!dedupColumns.length) return data.map((row, idx) => ({ row, idx }));

        const groups = new Map();
        data.forEach((row, idx) => {
            const key = dedupColumns.map(c => row[c]).join("|");
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ row, idx });
        });

        const duplicatePart = [];
        const uniquePart = [];
        duplicateRows.clear();

        let groupCounter = 0;
        const groupIndexes = new Map(); // idx → groupIndex (0,1,2...)

        groups.forEach((group) => {
            if (group.length > 1) {
                group.forEach(item => {
                    duplicatePart.push(item);
                    duplicateRows.add(item.idx);
                    groupIndexes.set(item.idx, groupCounter);
                });
                groupCounter++;
            } else {
                uniquePart.push(group[0]);
            }
        });

        const preview = [...duplicatePart, ...uniquePart];

        // gắn groupIndex cho zebra coloring
        return preview.map(item => ({
            ...item,
            groupIndex: groupIndexes.get(item.idx) ?? null
        }));
    }

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

        preview.forEach(({ row, idx, groupIndex }) => {
            const tr = document.createElement("tr");

            if (duplicateRows.has(idx)) tr.classList.add("duplicate-row");
            if (selectedRows.has(idx)) tr.classList.add("selected-row");
            if (draftRows.has(idx)) tr.classList.add("draft-row");

    // zebra duplicate group
            if (groupIndex !== null) {
                tr.classList.add(groupIndex % 2 === 0 ? "group-even" : "group-odd");
            }

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

            headers.forEach(col => {
                const td = document.createElement("td");
                td.textContent = row[col];

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
                        projects[currentProject] = data;
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

    // ---------------- Project Tabs ----------------
    function renderProjectTabs() {
        projectTabs.innerHTML = "";
        const tabs = ["Table Editor"];
        tabs.forEach(name => {
            const tab = document.createElement("div");
            tab.className = "project-tab";
            if (name === "Table Editor") tab.classList.add("active");
            tab.textContent = name;
            tab.addEventListener("click", () => {
                alert(`Switched to tab: ${name} (future feature)`);
            });
            projectTabs.appendChild(tab);
        });
    }

    function addProject(name, projectData) {
        if (!projects[name]) projects[name] = projectData || [];
        setCurrentProject(name);
    }

    // ---------------- Buttons ----------------
    importBtn.addEventListener("click", async () => {
        if (!window.api?.loadCSV) return;
        const result = await window.api.loadCSV();
        if (result?.data?.length) {
            data = result.data;
            projects[currentProject] = data;
            draftRows.clear();
            renderTable();
        }
    });

    saveBtn.addEventListener("click", async () => {
        if (!currentProject) return alert("Project name not specified.");
        if (!window.api?.saveProjectData) return alert("Save API not available.");

        const headers = Object.keys(data[0] || {});
        const csvContent = [
            headers.join(","),
            ...data.map(row =>
                headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(",")
            )
        ].join("\n");

        await window.api.saveProjectData(currentProject, csvContent, { isCSV: true });
        draftRows.clear();
        selectedRows.clear();
        projects[currentProject] = data;
        renderTable();
        alert("Saved!");
    });

    editBtn.addEventListener("click", () => {
        editDropdown.style.display = editDropdown.style.display === "none" ? "block" : "none";
    });

    saveDraftBtn.addEventListener("click", () => {
        draftRows.forEach(i => originalRows.set(i, { ...data[i] }));
        draftRows.clear();
        projects[currentProject] = data;
        renderTable();
    });

    saveAllDraftsBtn.addEventListener("click", () => {
        draftRows.forEach(i => originalRows.set(i, { ...data[i] }));
        draftRows.clear();
        projects[currentProject] = data;
        renderTable();
    });

    discardAllDraftsBtn.addEventListener("click", () => {
        draftRows.forEach(i => {
            if (originalRows.has(i)) data[i] = { ...originalRows.get(i) };
        });
        draftRows.clear();
        projects[currentProject] = data;
        renderTable();
    });

    deleteSelectedBtn.addEventListener("click", () => {
        data = data.filter((_, idx) => !selectedRows.has(idx));
        selectedRows.clear();
        draftRows.clear();
        projects[currentProject] = data;
        renderTable();
    });

    editAllBtn.addEventListener("click", () => {
        selectedRows = new Set(data.map((_, i) => i));
        isEditing = true;
        data.forEach((row, idx) => {
            if (!originalRows.has(idx)) originalRows.set(idx, { ...row });
        });
        projects[currentProject] = data;
        renderTable();
        editDropdown.style.display = "none";
    });

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

    // initial render
    renderProjectTabs();
    renderTable();

    return { 
        getData: () => data,
        addProject 
    };
}
