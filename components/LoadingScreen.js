// Hiển thị màn hình Loading / App Loader
export function renderLoadingScreen(container, onContinue) {
    container.innerHTML = `
        <div class="app-loader-screen">
            <div class="loader-text">
                Press Any Button to Continue
            </div>
            <button id="continueBtn">Continue</button>
        </div>
    `;

    const btn = container.querySelector('#continueBtn');
    btn.addEventListener('click', onContinue);

    // Cho phép nhấn bất kỳ phím nào cũng tiếp tục
    const keyListener = () => {
        document.removeEventListener('keydown', keyListener);
        onContinue();
    };
    document.addEventListener('keydown', keyListener);
}
