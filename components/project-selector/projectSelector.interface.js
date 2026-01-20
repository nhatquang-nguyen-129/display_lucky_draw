export function renderProjectSelector(container) {
    container.innerHTML = `
        <div class="ps-root">
            <div class="ps-header">
                <button id="btn-create">Create Project</button>
            </div>

            <div id="project-list" class="ps-list"></div>

            <div id="modal" class="ps-modal hidden"></div>
        </div>
    `;
}
