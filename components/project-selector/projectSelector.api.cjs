const fs = require("fs");
const path = require("path");

const PROJECTS_DIR = path.join(process.cwd(), "projects");

export function ensureProjectsDir() {
    if (!fs.existsSync(PROJECTS_DIR)) {
        fs.mkdirSync(PROJECTS_DIR);
    }
}

export function listProjects() {
    ensureProjectsDir();

    return fs.readdirSync(PROJECTS_DIR)
        .filter(name =>
            fs.statSync(path.join(PROJECTS_DIR, name)).isDirectory()
        )
        .map(name => ({ name }));
}

export function createProject(name) {
    const projectPath = path.join(PROJECTS_DIR, name);
    if (fs.existsSync(projectPath)) {
        throw new Error("Project already exists");
    }

    fs.mkdirSync(projectPath);
    fs.writeFileSync(
        path.join(projectPath, "meta.json"),
        JSON.stringify({ name, createdAt: Date.now() }, null, 2)
    );
}

export function deleteProject(name) {
    const projectPath = path.join(PROJECTS_DIR, name);
    fs.rmSync(projectPath, { recursive: true, force: true });
}

export function renameProject(oldName, newName) {
    fs.renameSync(
        path.join(PROJECTS_DIR, oldName),
        path.join(PROJECTS_DIR, newName)
    );
}
