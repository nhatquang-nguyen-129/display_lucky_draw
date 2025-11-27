// components/ProjectSelector.js
import { loadComponentCSS } from "../utils/loadComponentCSS.js";
loadComponentCSS("../styles/ProjectSelector.css");

// API gọi Electron để tạo folder
async function createProjectFolder(projectName) {
    if (!window.api || !window.api.createProjectFolder) {
        console.warn("API createProjectFolder not defined");
        return { success: false };
    }
    return await window.api.createProjectFolder(projectName);
}

// ================= CUSTOM MODAL =================
function showCreateProjectModal(onSubmit) {
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

    overlay.querySelector("#cancelBtn").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#okBtn").addEventListener("click", () => {
        const name = input.value.trim();
        if (name) onSubmit(name);
        overlay.remove();
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") overlay.querySelector("#okBtn").click();
        if (e.key === "Escape") overlay.remove();
    });
}

// ================= RENDER PROJECT SELECTOR =================
export function renderProjectSelector(container, onSelectProject) {
    let projects = JSON.parse(localStorage.getItem("projects") || "[]");

    container.innerHTML = `
        <div id="project-selector">
            <div class="project-toolbar">
                <button id="createProjectBtn">Create</button>
                <button id="openProjectBtn">Open</button>
            </div>
            <div class="project-list"></div>
        </div>
    `;

    const projectListEl = container.querySelector(".project-list");
    const createBtn = container.querySelector("#createProjectBtn");
    const openBtn = container.querySelector("#openProjectBtn");

    function saveProjects() {
        localStorage.setItem("projects", JSON.stringify(projects));
        renderList();
    }

    function renderList() {
        projectListEl.innerHTML = "";
        projects.forEach((proj, idx) => {
            const div = document.createElement("div");
            div.className = "project-item";
            div.textContent = proj.name;
            div.dataset.idx = idx;
            div.addEventListener("click", () => {
                onSelectProject(proj);
            });
            projectListEl.appendChild(div);
        });
    }

    // ================= CREATE PROJECT =================
    createBtn.addEventListener("click", () => {
        showCreateProjectModal(async (name) => {
            if (projects.some(p => p.name === name)) {
                alert("Project with this name already exists!");
                return;
            }

            const newProj = { name, data: [] };
            projects.push(newProj);

            try {
                const result = await createProjectFolder(name);
                if (!result?.success) {
                    alert("Failed to create folder: " + result?.error);
                    return;
                }
                console.log(`Project folder created: ${name}`);
            } catch (err) {
                alert("Error creating project folder: " + err.message);
                return;
            }

            saveProjects();
        });
    });

    // ================= OPEN PROJECT =================
    openBtn.addEventListener("click", () => {
        const selected = projects[0];
        if (selected) onSelectProject(selected);
        else alert("No project available to open");
    });

    renderList();
}
