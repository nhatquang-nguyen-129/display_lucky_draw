export async function initProjectSelector(container, onProjectSelected) {
    console.log("[PROJECT SELECTOR][MAIN] initProjectSelector called");

    // 1.1.1 Render UI
    const ui = renderProjectSelectorUI(container);

    // Thêm wrapper methods để main.js dễ dùng
    ui.renderOptions = (projects) => {
        console.log("[PROJECT SELECTOR][MAIN] ui.renderOptions called", projects);
        renderProjectList(ui.projectListEl, projects, (proj) => {
            if (ui._onSelect) ui._onSelect(proj.id);
        });
    };

    ui.onSelect = (callback) => {
        console.log("[PROJECT SELECTOR][MAIN] ui.onSelect set");
        ui._onSelect = callback;
    };

    ui.onAdd = (callback) => {
        console.log("[PROJECT SELECTOR][MAIN] ui.onAdd set");
        ui.createBtn.addEventListener("click", () => {
            console.log("[PROJECT SELECTOR][MAIN] Create button clicked");
            showCreateProjectModal(callback);
        });
    };

    ui.setSelected = (projectId) => {
        console.log("[PROJECT SELECTOR][MAIN] ui.setSelected called with id:", projectId);
        const items = ui.projectListEl.querySelectorAll(".project-item");
        items.forEach(item => {
            if (item.dataset.idx == projectId) item.classList.add("selected");
            else item.classList.remove("selected");
        });
    };

    // 1.1.2 Trigger to get project list
    let cached = getCachedProjects();
    console.log("[PROJECT SELECTOR][MAIN] cached projects before API:", cached);

    if (!cached) {
        const apiProjects = await loadProjectsFromAPI();
        console.log("[PROJECT SELECTOR][MAIN] projects loaded from API:", apiProjects);
        setCachedProjects(apiProjects);
        cached = apiProjects;
    }

    // 1.1.3 Render project list into UI
    ui.renderOptions(cached);

    // 1.1.4 Setup onSelect
    ui.onSelect(async (projectId) => {
        console.log("[PROJECT SELECTOR][MAIN] project selected with id:", projectId);
        const updatedState = handleProjectChangeLogic(projectId);
        setActiveProject(updatedState.activeProject);

        if (onProjectSelected) {
            onProjectSelected(updatedState.activeProject);
        }
    });

    // 1.1.5 Setup onAdd
    ui.onAdd(async (projectName) => {
        console.log("[PROJECT SELECTOR][MAIN] Adding new project:", projectName);
        const { newProject, updatedList } = await handleProjectAddLogic(
            projectName,
            {
                apiCreate: createNewProject,
                getProjects: getCachedProjects,
                setProjects: setCachedProjects,
            }
        );

        console.log("[PROJECT SELECTOR][MAIN] New project added:", newProject);
        console.log("[PROJECT SELECTOR][MAIN] Updated project list:", updatedList);

        ui.renderOptions(updatedList);
        ui.setSelected(newProject.id);
        setActiveProject(newProject);

        if (onProjectSelected) {
            onProjectSelected(newProject);
        }
    });
}
