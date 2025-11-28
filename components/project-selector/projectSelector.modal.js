/* components/project-selector/projectSelector.modal.js
UI modal nhập tên Project
- Tạo modal popup
- Gắn sự kiện OK / Cancel
- Gọi callback onSubmit(name) sau khi nhập tên
*/

// 1. MODAL NHẬP TÊN PROJECT

// 1.1. Hiển thị Modal nhập tên project và Callback khi nhấn OK
 export function showCreateProjectModal(onSubmit) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    // 1.1.1. CSS riêng cho Modal
    overlay.innerHTML = `
        <div class="modal">
            <h3>Create New Project</h3>
            <input type="text" id="projectNameInput" placeholder="Project name" />
            <div class="modal-buttons">
                <button id="cancelBtn">Cancel</button>
                <button id="okBtn">OK</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector("#projectNameInput");
    input.focus();

    // Đóng modal
    overlay.querySelector("#cancelBtn").addEventListener("click", () => overlay.remove());

    // Submit modal
    overlay.querySelector("#okBtn").addEventListener("click", () => {
        const name = input.value.trim();
        if (name) onSubmit(name);
        overlay.remove();
    });

    // Keyboard control
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") overlay.querySelector("#okBtn").click();
        if (e.key === "Escape") overlay.remove();
    });
}
