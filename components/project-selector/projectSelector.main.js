/* components/project-selector/projectSelector.main.js
// ------------------------------------------------------------
Main Entrypoint Controller cho Project Selector module
- Kết nối UI ↔ Logic ↔ API
*/

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

/* 1. Hàm initProjectSelector  Render UI selector
 * - Load project list từ API
 * - Hook các sự kiện từ UI vào logic
 */

//. 1.1. Khởi tạo Project Selector
export async function initProjectSelector(container, onProjectSelected) {
    
    // 1.1.1. Trigger to render UI
    const ui = renderProjectSelectorUI(container);

    // 1.1.2. Trigger to get project list with cached to reduce API call
    let cached = getCachedProjects();
    if (!cached) {
        const apiProjects = await loadProjectsFromAPI();
        setCachedProjects(apiProjects);
        cached = apiProjects;
    }

    // 1.1.3. Trigger to render project list into UI
    ui.renderOptions(cached);

    // 1.1.4. Trigger to send project select event
    ui.onSelect(async (projectId) => {
        const updatedState = handleProjectChangeLogic(projectId);
        
        setActiveProject(updatedState.activeProject);
        
        if (onProjectSelected) {
            onProjectSelected(updatedState.activeProject);
        }
    });

    // 1.1.5. Trigger to send project create event
    ui.onAdd(async (projectName) => {
        const { newProject, updatedList } = await handleProjectAddLogic(
            projectName,
            {
                apiCreate: createNewProject,
                getProjects: getCachedProjects,
                setProjects: setCachedProjects,
            }
        );


        ui.renderOptions(updatedList);

        ui.setSelected(newProject.id);
        setActiveProject(newProject);

        if (onProjectSelected) {
            onProjectSelected(newProject);
        }
    });
}
