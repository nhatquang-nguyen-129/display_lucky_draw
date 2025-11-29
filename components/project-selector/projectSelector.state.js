// 1.1 Load danh sách Project đã lưu từ localStorage
export function loadProjects() {
    const projects = JSON.parse(localStorage.getItem("projects") || "[]");
    console.log("[PROJECT SELECTOR][STATE] loadProjects:", projects);
    return projects;
}

// 1.2 Ghi danh sách Project vào localStorage
export function saveProjects(projects) {
    console.log("[PROJECT SELECTOR][STATE] saveProjects:", projects);
    localStorage.setItem("projects", JSON.stringify(projects));
}

// 1.3 Thêm Project mới vào danh sách và lưu lại
export function addProject(projects, name) {
    console.log("[PROJECT SELECTOR][STATE] addProject called with name:", name);
    const newProj = { name, data: [] };
    projects.push(newProj);
    saveProjects(projects);
    console.log("[PROJECT SELECTOR][STATE] new project added:", newProj);
    return newProj;
}

// 1.4 Kiểm tra xem Project có tồn tại hay chưa
export function projectExists(projects, name) {
    const exists = projects.some(p => p.name === name);
    console.log("[PROJECT SELECTOR][STATE] projectExists check for:", name, "=>", exists);
    return exists;
}
