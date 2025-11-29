export const projectSelectorAPI = {
    createProjectFolder: async (name) => {
        return await window.api.createProjectFolder(name);
    }
};
