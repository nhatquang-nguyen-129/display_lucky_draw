// Hiển thị màn hình Loading / App Loader
export function renderLoadingScreen(container, onContinue) {
    container.innerHTML = `
        <div class="app-loader-screen" style="background-image: url('assets/app-loading-screen.jpg'); background-size: cover; background-position: center; width: 100%; height: 100vh;">
            <div class="loader-text">
                Press Any Button to Continue
            </div>
        </div>
    `;

    // Cho phép nhấn bất kỳ phím nào để tiếp tục
    const keyListener = () => {
        document.removeEventListener('keydown', keyListener);
        onContinue();
    };
    document.addEventListener('keydown', keyListener);
}
