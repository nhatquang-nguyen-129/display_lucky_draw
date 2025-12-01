import { projectSelectorAPI } from './projectSelector.api.js';
import { projectSelectorState } from './projectSelector.state.js';

export function renderProjectSelector(container, onSelect) {
    container.innerHTML = `
        <div class="ps-center-box">

            <h2 class="ps-title">Select Project</h2>

            <ul id="ps-list" class="ps-list"></ul>

            <div class="ps-actions">
                <button id="ps-open" class="ps-button" disabled>Open</button>
                <button id="ps-create" class="ps-button">Create</button>
                <button id="ps-delete" class="ps-button ps-delete" disabled>Delete</button>
            </div>
        </div>

        <!-- Popup tạo project -->
        <div id="ps-popup" class="ps-popup">
            <div class="ps-popup-content">
                <h3>Create New Project</h3>
                <input id="ps-popup-input" placeholder="Project name..." />
                <div class="ps-popup-actions">
                    <button id="ps-popup-cancel">Cancel</button>
                    <button id="ps-popup-confirm">Create</button>
                </div>
            </div>
        </div>
    `;

    const list = container.querySelector('#ps-list');
    const btnOpen = container.querySelector('#ps-open');
    const btnCreate = container.querySelector('#ps-create');
    const btnDelete = container.querySelector('#ps-delete');

    const popup = container.querySelector('#ps-popup');
    const popupInput = container.querySelector('#ps-popup-input');
    const popupCancel = container.querySelector('#ps-popup-cancel');
    const popupConfirm = container.querySelector('#ps-popup-confirm');

    // =====================================
    // LOAD LIST PROJECT
    // =====================================
    async function loadProjects() {
        const projects = await projectSelectorAPI.listProjects();
        list.innerHTML = "";

        projects.forEach(name => {
            const li = document.createElement("li");
            li.textContent = name;
            li.classList.add("ps-item");

            if (projectSelectorState.selectedProject === name) {
                li.classList.add("selected");
            }

            li.addEventListener("click", () => {
                if (projectSelectorState.selectedProject === name) {
                    projectSelectorState.selectedProject = null;
                    li.classList.remove("selected");
                } else {
                    projectSelectorState.selectedProject = name;
                    list.querySelectorAll(".ps-item").forEach(i => i.classList.remove("selected"));
                    li.classList.add("selected");
                }
                updateButtons();
            });

            list.appendChild(li);
        });

        updateButtons();
    }

    function updateButtons() {
        const selected = projectSelectorState.selectedProject;
        btnOpen.disabled = !selected;
        btnDelete.disabled = !selected;
    }

    // =====================================
    // POPUP CREATE PROJECT
    // =====================================
    btnCreate.addEventListener("click", () => {
        popup.classList.add("visible");
        popupInput.value = "";
        popupInput.focus();
    });

    popupCancel.addEventListener("click", () => {
        popup.classList.remove("visible");
    });

    popupConfirm.addEventListener("click", async () => {
        const name = popupInput.value.trim();
        if (!name) return alert("Enter project name");

        await projectSelectorAPI.createProjectFolder(name);

        popup.classList.remove("visible");
        loadProjects();
    });

    // =====================================
    // DELETE PROJECT
    // =====================================
    btnDelete.addEventListener("click", async () => {
        const name = projectSelectorState.selectedProject;
        if (!name) return;

        const ok = confirm(`Delete project "${name}"?`);
        if (!ok) return;

        await projectSelectorAPI.deleteProjectFolder(name);
        projectSelectorState.selectedProject = null;

        loadProjects();
    });

    // =====================================
    // OPEN PROJECT
    // =====================================
    btnOpen.addEventListener("click", () => {
        if (!projectSelectorState.selectedProject) return;
        onSelect({ name: projectSelectorState.selectedProject });
    });

    // Initial load
    loadProjects();
}
