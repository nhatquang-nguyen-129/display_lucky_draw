import { projectSelectorState } from './projectSelector.state.js';
import { projectSelectorAPI } from './projectSelector.api.js';

export async function renderProjectSelector(container, onSelect) {

    // ============================================
    // UI Layout:
    // - Danh sách project có sẵn
    // - Select radio (chọn 1)
    // - Nút Open (chỉ sáng khi có selection)
    // - Khu vực tạo project mới (logic cũ)
    // ============================================
    container.innerHTML = `
        <div id="project-selector">

            <h3 class="ps-title">Existing Projects</h3>
            <div id="ps-project-list" class="ps-list">
                <div class="ps-loading">Loading...</div>
            </div>

            <button id="ps-open" class="ps-button ps-open" disabled>Open</button>

            <hr class="ps-divider"/>

            <h3 class="ps-title">Create New Project</h3>
            <input id="ps-input" class="ps-input" placeholder="Enter project name..." />
            <button id="ps-create" class="ps-button">Create Project</button>

        </div>
    `;

    // DOM refs
    const listEl   = container.querySelector('#ps-project-list');
    const btnOpen  = container.querySelector('#ps-open');
    const input    = container.querySelector('#ps-input');
    const btnCreate = container.querySelector('#ps-create');


    // =======================================================
    // 1) Load danh sách project từ API
    // =======================================================
    async function loadProjects() {
        const projects = await projectSelectorAPI.listProjects();

        if (!projects || projects.length === 0) {
            listEl.innerHTML = `<div class="ps-empty">No projects found.</div>`;
            return;
        }

        // Render dạng radio select
        listEl.innerHTML = projects.map(name => `
            <label class="ps-item">
                <input type="radio" name="projectRadio" value="${name}" />
                <span>${name}</span>
            </label>
        `).join('');

        // Add event listener cho radio
        const radios = listEl.querySelectorAll('input[type="radio"]');
        radios.forEach(r => {
            r.addEventListener('change', () => {
                projectSelectorState.selectedProject = r.value;
                btnOpen.disabled = false; // bật nút Open
            });
        });
    }

    await loadProjects();


    // =======================================================
    // 2) Nút Open – gọi onSelect(project)
    // =======================================================
    btnOpen.addEventListener('click', () => {
        if (!projectSelectorState.selectedProject) return;

        onSelect({
            name: projectSelectorState.selectedProject
        });
    });


    // =======================================================
    // 3) Create Project (logic gốc — giữ nguyên)
    // =======================================================
    btnCreate.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) return alert("Please enter name");

        await projectSelectorAPI.createProjectFolder(name);

        projectSelectorState.currentProjectName = name;

        // Tạo xong thì reload danh sách
        await loadProjects();

        onSelect({ name });
    });
}
