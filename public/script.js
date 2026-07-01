let participants = [];

let isDrawing = false;

const digit1 = document.getElementById("digit1");
const digit2 = document.getElementById("digit2");
const digit3 = document.getElementById("digit3");

async function loadParticipants() {

    const response =
        await fetch("/participants");

    participants =
        await response.json();

    console.log(
        `Loaded ${participants.length} participants`
    );
}

function randomDigit() {

    return Math.floor(
        Math.random() * 10
    );
}

function spinDigit(
    element,
    finalDigit,
    duration
) {

    return new Promise(resolve => {

        let current =
            Math.floor(Math.random() * 10);

        element.innerText = current;

        const interval = 70;

        const start = Date.now();

        function roll() {

            const elapsed =
                Date.now() - start;

            // Kết thúc
            if (elapsed >= duration) {

                element.innerText =
                    finalDigit;

                element.style.transition =
                    "transform .25s";

                element.style.transform =
                    "translateY(-18px)";

                requestAnimationFrame(() => {

                    requestAnimationFrame(() => {

                        element.style.transform =
                            "translateY(0px)";

                    });

                });

                setTimeout(resolve,300);

                return;

            }

            // Random số tiếp theo
            current =
                Math.floor(
                    Math.random() * 10
                );

            // Trượt xuống
            element.style.transition =
                "none";

            element.style.transform =
                "translateY(-70px)";

            element.style.opacity =
                "0";

            requestAnimationFrame(() => {

                element.innerText =
                    current;

                element.style.transition =
                    "transform 70ms linear, opacity 70ms linear";

                element.style.transform =
                    "translateY(0px)";

                element.style.opacity =
                    "1";

            });

            setTimeout(
                roll,
                interval
            );

        }

        roll();

    });

}

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
            .padStart(3,"0");

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

document
    .getElementById("drawBtn")
    .addEventListener(
        "click",
        drawWinner
    );

loadParticipants();