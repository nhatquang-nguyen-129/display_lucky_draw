/* components/project-selector/projectSelector.ui.js
Render UI chính của Project Selector
- Render HTML selector
- Render danh sách project
- Tạo các element như createBtn, openBtn
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
