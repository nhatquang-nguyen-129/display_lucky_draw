export const projectSelectorAPI = {
    
    // API tạo Folder Project
    createProjectFolder: async (name) => {
        return await window.api.createProjectFolder(name);
    },

    // API hiển thị danh sách Project
    listProjects: async () => {
        return await window.api.listProjects();
    }
};
