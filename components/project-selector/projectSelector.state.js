/* components/project-selector/projectSelector.state.js
Quản lý dữ liệu project trong localStorage
- Load danh sách project
- Lưu danh sách project
- Thêm project
- Kiểm tra project tồn tại
*/

// 1. LƯU/LOAD DANH SÁCH PROJECT TRONG LOCAL STORAGE

// 1.1. Load danh sách Project đã lưu từ localStorage
export function loadProjects() {
    return JSON.parse(localStorage.getItem("projects") || "[]");
}

// 1.2. Ghi danh sách Project vào localStorage.
export function saveProjects(projects) {
    localStorage.setItem("projects", JSON.stringify(projects));
}

// 1.3. Thêm Project mới vào danh sách và lưu lại
export function addProject(projects, name) {
    const newProj = { name, data: [] };
    projects.push(newProj);
    saveProjects(projects);
    return newProj;
}

// 1.4. Kiểm tra xem Project có tồn tại hay chưa
export function projectExists(projects, name) {
    return projects.some(p => p.name === name);
}