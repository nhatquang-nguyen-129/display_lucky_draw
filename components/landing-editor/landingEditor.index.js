export function initLandingEditor(container, { project }) {
    container.innerHTML = `
        <h2>Landing Page Editor</h2>
        <p>Project: ${project?.name}</p>

        <button id="to-runtime">Run Landing</button>
    `;

    document
        .getElementById("to-runtime")
        .addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("navigate", { detail: "runtime" })
            );
        });
}
