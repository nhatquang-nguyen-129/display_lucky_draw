console.log('[STATE] init');

export const state = {
    currentProject: null,
    projectPath: null
};

export function setCurrentProject(projectName) {
    state.currentProject = projectName;
    state.projectPath = `projects/${projectName}`;
    console.log('[STATE] currentProject =', state);
}
