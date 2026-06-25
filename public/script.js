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

        const interval =
            setInterval(() => {

                element.innerText =
                    randomDigit();

            }, 50);

        setTimeout(() => {

            clearInterval(interval);

            element.innerText =
                finalDigit;

            element.classList.add(
                "stop-bounce"
            );

            setTimeout(() => {

                element.classList.remove(
                    "stop-bounce"
                );

                resolve();

            }, 400);

        }, duration);

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