// projectSelector.main.js
// ------------------------------------------------------------
// MAIN CONTROLLER cho Project Selector
// Kết nối UI ↔ Logic ↔ API
// ------------------------------------------------------------

import { renderProjectSelectorUI } from "./projectSelector.ui.js";
import {
    loadProjectsFromAPI,
    createNewProject,
} from "../api/project.api.js";
import {
    getCachedProjects,
    setCachedProjects,
    setActiveProject,
} from "./projectSelector.state.js";
import {
    handleProjectAddLogic,
    handleProjectChangeLogic,
} from "./projectSelector.logic.js";

/**
 * Hàm initProjectSelector
 * - Render UI selector
 * - Load project list từ API
 * - Hook các sự kiện từ UI vào logic
 */
export async function initProjectSelector(container, onProjectSelected) {
    // --- Render UI trước (để có khung hiển thị)
    const ui = renderProjectSelectorUI(container);

    // --- Load project list (có cache để giảm call API)
    let cached = getCachedProjects();
    if (!cached) {
        const apiProjects = await loadProjectsFromAPI();
        setCachedProjects(apiProjects);
        cached = apiProjects;
    }

    // --- Render danh sách vào UI
    ui.renderOptions(cached);

    // =====================================================
    // 1) EVENT: Chọn Project
    // =====================================================
    ui.onSelect(async (projectId) => {
        const updatedState = handleProjectChangeLogic(projectId);

        // Lưu vào state global
        setActiveProject(updatedState.activeProject);

        // Callback sang App lớn
        if (onProjectSelected) {
            onProjectSelected(updatedState.activeProject);
        }
    });

    // =====================================================
    // 2) EVENT: Tạo Project mới
    // =====================================================
    ui.onAdd(async (projectName) => {
        const { newProject, updatedList } = await handleProjectAddLogic(
            projectName,
            {
                apiCreate: createNewProject,
                getProjects: getCachedProjects,
                setProjects: setCachedProjects,
            }
        );

        // Render lại danh sách
        ui.renderOptions(updatedList);

        // Set project vừa tạo làm active
        ui.setSelected(newProject.id);
        setActiveProject(newProject);

        if (onProjectSelected) {
            onProjectSelected(newProject);
        }
    });
}
