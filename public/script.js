// ================================
// Danh sách người tham gia
// ================================
let participants = [];

// Đang quay hay không
let isDrawing = false;

// Lấy 3 cột số
const digit1 = document.getElementById("digit1");
const digit2 = document.getElementById("digit2");
const digit3 = document.getElementById("digit3");

// ===================================
// Chiều cao mỗi số (phải trùng CSS)
// ===================================
const DIGIT_HEIGHT = 120;

// ===================================
// Tạo danh sách số cho mỗi cột
// 0-9 lặp nhiều lần để quay dài
// ===================================
function createDigitStrip(element) {

    element.innerHTML = "";

    for (let loop = 0; loop < 30; loop++) {

        for (let i = 0; i <= 9; i++) {

            const div =
                document.createElement("div");

            div.className = "digit";

            div.innerText = i;

            element.appendChild(div);

        }

    }

}

// Khởi tạo 3 cột số
createDigitStrip(digit1);
createDigitStrip(digit2);
createDigitStrip(digit3);

// ================================
// Load danh sách người tham gia
// ================================
async function loadParticipants() {

    const response =
        await fetch("/participants");

    participants =
        await response.json();

    console.log(
        `Loaded ${participants.length} participants`
    );

}

// =======================================================
// Hàm randomDigit vẫn giữ nguyên
// (Hiện không còn dùng nhưng giữ để không đổi logic khác)
// =======================================================
function randomDigit() {

    return Math.floor(
        Math.random() * 10
    );

}

// ======================================
// Quay 1 cột số
// ======================================
function spinDigit(
    element,
    finalDigit,
    duration
) {

    return new Promise(resolve => {

        // Reset về đầu
        element.style.transition = "none";

        element.style.transform =
            "translateY(0px)";

        // Ép browser render
        element.offsetHeight;

        // Số vòng quay
        const loops = 20;

        // Vị trí cuối
        const finalIndex =
            loops * 10 +
            Number(finalDigit);

        // Khoảng dịch
        const translateY =
            finalIndex *
            DIGIT_HEIGHT;

        // Hiệu ứng chậm dần
        element.style.transition =
            `transform ${duration}ms cubic-bezier(0.15,0.85,0.25,1)`;

        element.style.transform =
            `translateY(-${translateY}px)`;

        // Sau khi quay xong
        setTimeout(() => {

            element.classList.add(
                "stop-bounce"
            );

            setTimeout(() => {

                element.classList.remove(
                    "stop-bounce"
                );

                resolve();

            }, 300);

        }, duration);

    });

}

// ======================================
// Quay thưởng
// ======================================
async function drawWinner() {

    if (isDrawing) return;

    isDrawing = true;

    document
        .getElementById("winnerName")
        .innerHTML = "";

    document
        .getElementById("congrats")
        .classList.remove("show");

    const winner =
        participants[
            Math.floor(
                Math.random()
                *
                participants.length
            )
        ];

    const lucky =
        winner.lucky_number
            .toString()
            .padStart(3, "0");

    await spinDigit(
        digit1,
        lucky[0],
        1500
    );

    await spinDigit(
        digit2,
        lucky[1],
        2200
    );

    await spinDigit(
        digit3,
        lucky[2],
        3000
    );

    document
        .getElementById("congrats")
        .classList.add("show");

    document
        .getElementById("winnerName")
        .innerHTML =
        winner.full_name ||
        winner.customer_name ||
        winner.name ||
        "Unknown";

    isDrawing = false;

}

// ================================
// Nút quay
// ================================
document
    .getElementById("drawBtn")
    .addEventListener(
        "click",
        drawWinner
    );

// Load dữ liệu
loadParticipants();