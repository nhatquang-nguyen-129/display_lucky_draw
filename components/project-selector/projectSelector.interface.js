/* components/project-selector/projectSelector.ui.js
Render UI chính của Project Selector
*/

// 1.1. Render UI lựa chọn Project
export function renderProjectSelectorUI(container) {
    console.log("[PROJECT SELECTOR][UI] renderProjectSelectorUI called");

    container.innerHTML = `
        <div id="project-selector">
            <div class="project-toolbar">
                <button id="createProjectBtn">Create</button>
                <button id="openProjectBtn">Open</button>
            </div>
            <div class="project-list"></div>
        </div>
    `;

    const ui = {
        projectListEl: container.querySelector(".project-list"),
        createBtn: container.querySelector("#createProjectBtn"),
        openBtn: container.querySelector("#openProjectBtn"),
    };

    console.log("[PROJECT SELECTOR][UI] UI elements rendered:", ui);
    return ui;
}

// 1.2. Render danh sách project từ mảng vào UI
export function renderProjectList(projectListEl, projects, onSelectProject) {
    console.log("[PROJECT SELECTOR][UI] renderProjectList called with projects:", projects);

    projectListEl.innerHTML = "";

    projects.forEach((proj, idx) => {
        const div = document.createElement("div");
        div.className = "project-item";
        div.textContent = proj.name;
        div.dataset.idx = idx;

        div.addEventListener("click", () => {
            console.log("[PROJECT SELECTOR][UI] Project selected:", proj);
            onSelectProject(proj);
        });

        projectListEl.appendChild(div);
    });

    console.log("[PROJECT SELECTOR][UI] Project list rendered");
}

// 2.1. Hiển thị Modal nhập tên project và Callback khi nhấn OK
export function showCreateProjectModal(onSubmit) {
    console.log("[PROJECT SELECTOR][UI] showCreateProjectModal called");

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

    overlay.querySelector("#cancelBtn").addEventListener("click", () => {
        console.log("[PROJECT SELECTOR][UI] Modal cancelled");
        overlay.remove();
    });

    overlay.querySelector("#okBtn").addEventListener("click", () => {
        const name = input.value.trim();
        console.log("[PROJECT SELECTOR][UI] Modal OK clicked with name:", name);
        if (name) onSubmit(name);
        overlay.remove();
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") overlay.querySelector("#okBtn").click();
        if (e.key === "Escape") {
            console.log("[PROJECT SELECTOR][UI] Modal closed with Escape");
            overlay.remove();
        }
    });
}
