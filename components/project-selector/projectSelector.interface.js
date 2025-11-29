import { projectSelectorState } from './projectSelector.state.js';

export function renderProjectSelector(container, onSelect) {
    container.innerHTML = `
        <div id="project-selector">
            <input id="ps-input" class="ps-input" placeholder="Enter project name..." />
            <button id="ps-create" class="ps-button">Create Project</button>
        </div>
    `;

    const input = container.querySelector('#ps-input');
    const btn = container.querySelector('#ps-create');

    btn.addEventListener('click', () => {
        projectSelectorState.currentProjectName = input.value.trim();
        if (!projectSelectorState.currentProjectName) return alert("Please enter name");

        onSelect({
            name: projectSelectorState.currentProjectName
        });
    });
}
