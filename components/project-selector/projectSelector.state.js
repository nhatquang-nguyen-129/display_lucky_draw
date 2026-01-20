export const ProjectState = {
    projects: [],
    selected: null
};

export function setProjects(list) {
    ProjectState.projects = list;
}

export function selectProject(project) {
    ProjectState.selected = project;
}
