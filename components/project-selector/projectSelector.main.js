import {
    listProjects,
    createProject,
    deleteProject,
    renameProject
} from "./projectSelector.api.cjs";

import {
    setProjects,
    selectProject,
    ProjectState
} from "./projectSelector.state.js";

import { renderProjectSelector } from "./projectSelector.interface.js";

export function initProjectSelector(container, onSelect) {
    renderProjectSelector(container);

    const listEl = container.querySelector("#project-list");
    const modal = container.querySelector("#modal");
    const btnCreate = container.querySelector("#btn-create");

    function refresh() {
        const projects = listProjects();
        setProjects(projects);

        listEl.innerHTML = "";

        projects.forEach(p => {
            const row = document.createElement("div");
            row.className = "ps-item";
            row.innerHTML = `
                <span>${p.name}</span>
                <button data-act="rename">✏️</button>
                <button data-act="delete">🗑️</button>
            `;

            row.querySelector("span").onclick = () => {
                selectProject(p);
                onSelect?.(p);
            };

            row.querySelector('[data-act="delete"]').onclick = () => {
                if (confirm(`Delete project "${p.name}"?`)) {
                    deleteProject(p.name);
                    refresh();
                }
            };

            row.querySelector('[data-act="rename"]').onclick = () => {
                const newName = prompt("New project name", p.name);
                if (newName && newName !== p.name) {
                    renameProject(p.name, newName);
                    refresh();
                }
            };

            listEl.appendChild(row);
        });
    }

    btnCreate.onclick = () => {
        modal.classList.remove("hidden");

        modal.innerHTML = `
            <div class="modal-box">
                <input id="project-name-input" placeholder="Project name" />
                <div class="actions">
                    <button id="confirm-create">Create</button>
                    <button id="cancel-create">Cancel</button>
                </div>
            </div>
        `;

        const input = modal.querySelector("#project-name-input");
        const btnConfirm = modal.querySelector("#confirm-create");
        const btnCancel = modal.querySelector("#cancel-create");

        btnConfirm.onclick = () => {
            const name = input.value.trim();
            if (!name) {
                alert("Project name is required");
                return;
            }

            try {
                createProject(name);
                modal.classList.add("hidden");
                refresh();
            } catch (e) {
                alert(e.message);
            }
        };

        btnCancel.onclick = () => {
            modal.classList.add("hidden");
        };
    };

    refresh();
}
