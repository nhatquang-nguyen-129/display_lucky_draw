// components/loader-screen-initial.js

// Render hiển thị màn hình Loading Screen
export function renderLoadingScreen(container, onContinue) {
    container.innerHTML = `
        <div class="app-loader-screen" style="background-image: url('assets/app-loading-screen.jpg'); background-size: cover; background-position: center; width: 100%; height: 100vh;">
            <div class="loader-text">
                Press Any Button to Continue
            </div>
        </div>
    `;

// Event nhấn phím bất kỳ để tiếp tục
    const keyListener = () => {
        document.removeEventListener('keydown', keyListener);
        onContinue();
    };
    document.addEventListener('keydown', keyListener);
}