/* components/project-selector/projectSelector.ui.js
Render UI chính của Project Selector
- Render HTML selector
- Render danh sách project
- Tạo các element như createBtn, openBtn
- Modal nhập tên project
*/

// 1. RENDER UI TỔNG THỂ CỦA PROJECT SELECTOR

// 1.1. Render UI lựa chọn Project
export function renderProjectSelectorUI(container) {
    container.innerHTML = `
        <div id="project-selector">
            <div class="project-toolbar">
                <button id="createProjectBtn">Create</button>
                <button id="openProjectBtn">Open</button>
            </div>
            <div class="project-list"></div>
        </div>
    `;

    return {
        projectListEl: container.querySelector(".project-list"),
        createBtn: container.querySelector("#createProjectBtn"),
        openBtn: container.querySelector("#openProjectBtn"),
    };
}

// 1.2. Render danh sách project từ mảng vào UI
export function renderProjectList(projectListEl, projects, onSelectProject) {
    projectListEl.innerHTML = "";

    projects.forEach((proj, idx) => {
        const div = document.createElement("div");
        div.className = "project-item";
        div.textContent = proj.name;
        div.dataset.idx = idx;

        div.addEventListener("click", () => onSelectProject(proj));

        projectListEl.appendChild(div);
    });
}

// ------------------------------------------------------------
// 2. MODAL NHẬP TÊN PROJECT
// ------------------------------------------------------------

// 2.1. Hiển thị Modal nhập tên project và Callback khi nhấn OK
export function showCreateProjectModal(onSubmit) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal">
            <h3>Create New Project</h3>
            <input type="text" id="projectNameInput" placeholder="Project name" />
            <div class="modal-buttons">
                <button id="cancelBtn">Cancel</button>
                <button id="okBtn">OK</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector("#projectNameInput");
    input.focus();

    // Đóng modal
    overlay.querySelector("#cancelBtn").addEventListener("click", () => overlay.remove());

    // Submit modal
    overlay.querySelector("#okBtn").addEventListener("click", () => {
        const name = input.value.trim();
        if (name) onSubmit(name);
        overlay.remove();
    });

    // Keyboard control
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") overlay.querySelector("#okBtn").click();
        if (e.key === "Escape") overlay.remove();
    });
}
