import { projectSelectorAPI } from './projectSelector.api.js';
import { projectSelectorState } from './projectSelector.state.js';

export function renderProjectSelector(container, onSelect) {
    container.innerHTML = `
        <div class="ps-center-box">

            <h2 class="ps-title">SELECT A PROJECT</h2>

            <!-- ⭐ SEARCH BAR -->
            <div class="ps-search-wrapper">
                <input 
                    id="ps-search-input"
                    class="ps-search-input"
                    placeholder="Search project..."
                    autocomplete="off"
                />
                <ul id="ps-search-dropdown" class="ps-search-dropdown"></ul>
            </div>

            <ul id="ps-list" class="ps-list"></ul>

            <div class="ps-actions">

                <!-- OPEN BUTTON -->
                <button id="ps-open" class="ps-button" disabled>
                    <img class="ps-btn-icon" src="assets/project-selector/button-open-project.svg" />
                    <span>Open</span>
                </button>

                <!-- CREATE BUTTON -->
                <button id="ps-create" class="ps-button">
                    <img class="ps-btn-icon" src="assets/project-selector/button-create-project.svg" />
                    <span>Create</span>
                </button>

                <!-- DELETE BUTTON -->
                <button id="ps-delete" class="ps-button ps-delete" disabled>
                    <img class="ps-btn-icon" src="assets/project-selector/button-delete-project.svg" />
                    <span>Delete</span>
                </button>

            </div>
        </div>

        <!-- Popup -->
        <div id="ps-popup" class="ps-popup">
            <div class="ps-popup-content">
                <h3>Create New Project</h3>
                <input id="ps-popup-input" placeholder="Project name..." />
                <div class="ps-popup-actions">
                    <button id="ps-popup-cancel"></button>
                    <button id="ps-popup-confirm"></button>
                </div>
            </div>
        </div>
    `;

    const list = container.querySelector('#ps-list');
    const searchInput = container.querySelector('#ps-search-input');
    const dropdown = container.querySelector('#ps-search-dropdown');

    const btnOpen = container.querySelector('#ps-open');
    const btnCreate = container.querySelector('#ps-create');
    const btnDelete = container.querySelector('#ps-delete');

    const popup = container.querySelector('#ps-popup');
    const popupInput = container.querySelector('#ps-popup-input');
    const popupCancel = container.querySelector('#ps-popup-cancel');
    const popupConfirm = container.querySelector('#ps-popup-confirm');

    // ⭐ Thêm icon + text vào nút popup
    popupCancel.innerHTML = `<img class="ps-btn-icon" src="assets/project-selector/button-cancel.svg" /><span>Cancel</span>`;
    popupConfirm.innerHTML = `<img class="ps-btn-icon" src="assets/project-selector/button-create-project.svg" /><span>Create</span>`;

    let allProjects = [];

    // ======================================================
    // LOAD + RENDER LIST PROJECT
    // ======================================================
    async function loadProjects() {
        allProjects = await projectSelectorAPI.listProjects();
        renderProjectList(allProjects);
    }

    function renderProjectList(projects) {
        list.innerHTML = "";

        projects.forEach(name => {
            const li = document.createElement("li");
            li.classList.add("ps-item");

            li.innerHTML = `
                <img class="ps-radio-icon" src="assets/project-selector/selector-radio-off.svg" />
                <span class="ps-item-label">${name}</span>
            `;

            if (projectSelectorState.selectedProject === name) {
                li.classList.add("selected");
                li.querySelector(".ps-radio-icon").src = "assets/project-selector/selector-radio-on.svg";
            }

            li.addEventListener("click", () => selectProject(name));

            list.appendChild(li);
        });

        updateButtons();
    }

    // ======================================================
    // ⭐ SELECT HELPER (dùng chung cho dropdown + list)
    // ======================================================
    function selectProject(name) {
        const prev = projectSelectorState.selectedProject;
        projectSelectorState.selectedProject = prev === name ? null : name;

        // Reset list items
        list.querySelectorAll(".ps-item").forEach(item => {
            item.classList.remove("selected");
            item.querySelector(".ps-radio-icon").src = "assets/project-selector/selector-radio-off.svg";
        });

        // Update selected in main list
        list.querySelectorAll(".ps-item").forEach(item => {
            if (item.querySelector("span").innerText === projectSelectorState.selectedProject) {
                item.classList.add("selected");
                item.querySelector(".ps-radio-icon").src = "assets/project-selector/selector-radio-on.svg";
            }
        });

        closeDropdown();
        updateButtons();
    }

    function updateButtons() {
        const selected = projectSelectorState.selectedProject;
        btnOpen.disabled = !selected;
        btnDelete.disabled = !selected;
    }

    // ======================================================
    // ⭐ SEARCH DROPDOWN
    // ======================================================
    searchInput.addEventListener("input", () => {
        const q = searchInput.value.toLowerCase().trim();

        if (q === "") {
            closeDropdown();
            return;
        }

        const filtered = allProjects.filter(name => name.toLowerCase().includes(q));
        renderDropdown(filtered);

        if (filtered.length > 0) dropdown.classList.add("visible");
        else closeDropdown();
    });

    function renderDropdown(projects) {
        dropdown.innerHTML = "";

        projects.forEach(name => {
            const li = document.createElement("li");
            li.classList.add("ps-search-item");

            const isSelected = projectSelectorState.selectedProject === name;

            li.innerHTML = `
                <img class="ps-radio-icon" 
                    src="assets/project-selector/${isSelected ? 'selector-radio-on.svg' : 'selector-radio-off.svg'}" />
                <span>${name}</span>
            `;

            li.addEventListener("click", () => selectProject(name));

            dropdown.appendChild(li);
        });
    }

    function closeDropdown() {
        dropdown.classList.remove("visible");
        dropdown.innerHTML = "";
    }

    // ======================================================
    // ⭐ FIX POPUP INPUT FOCUS
    // ======================================================
    document.addEventListener("click", (e) => {
        // Chỉ close dropdown nếu click ngoài searchInput & dropdown
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            closeDropdown();
        }
    });

    // ======================================================
    // POPUP CREATE PROJECT
    // ======================================================
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
        await loadProjects();
    });

    // ======================================================
    // DELETE PROJECT
    // ======================================================
    btnDelete.addEventListener("click", async () => {
        const name = projectSelectorState.selectedProject;
        if (!name) return;

        const ok = confirm(`Delete project "${name}"?`);
        if (!ok) return;

        await projectSelectorAPI.deleteProjectFolder(name);
        projectSelectorState.selectedProject = null;
        await loadProjects();
    });

    // ======================================================
    // OPEN PROJECT
    // ======================================================
    btnOpen.addEventListener("click", () => {
        if (!projectSelectorState.selectedProject) return;
        onSelect({ name: projectSelectorState.selectedProject });
    });

    // Initial load
    loadProjects();
}
