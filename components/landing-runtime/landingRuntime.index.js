export function initLandingRuntime(container, { project }) {
    container.innerHTML = `
        <h2>🎉 LIVE LUCKY DRAW 🎉</h2>
        <p>Project: ${project?.name}</p>

        <button id="back-to-data">Back to Editor</button>
    `;

    document
        .getElementById("back-to-data")
        .addEventListener("click", () => {
            window.dispatchEvent(
                new CustomEvent("navigate", { detail: "data" })
            );
        });
}
