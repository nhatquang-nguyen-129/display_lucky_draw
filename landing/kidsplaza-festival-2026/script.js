const spinBtn = document.getElementById("spinBtn");
const rejectBtn = document.getElementById("rejectBtn");
const confirmBtn = document.getElementById("confirmBtn");

const actionButtons = document.querySelector(".action-buttons");

const slots = [
  document.getElementById("slot1"),
  document.getElementById("slot2"),
  document.getElementById("slot3")
];

let currentResult = null;



/* ===============================
   SPIN HANDLER
================================ */

spinBtn.addEventListener("click", async () => {

  spinBtn.disabled = true;
  actionButtons.classList.add("hidden");

  const response = await fetch("/api/spin", {
    method: "POST"
  });

  const data = await response.json();

  currentResult = data;

  await animateSlots(data.numbers);

  actionButtons.classList.remove("hidden");
});



/* ===============================
   SLOT ANIMATION
================================ */

function animateSingleSlot(slot, finalNumber, delay) {

  return new Promise(resolve => {

    let counter = 0;
    let speed = 50;

    const interval = setInterval(() => {

      slot.textContent = Math.floor(Math.random() * 10);

      counter += speed;

      if (counter > delay) {
        clearInterval(interval);
        slot.textContent = finalNumber;
        resolve();
      }

      speed += 10;

    }, speed);
  });
}

async function animateSlots(numbers) {

  await animateSingleSlot(slots[0], numbers[0], 800);
  await animateSingleSlot(slots[1], numbers[1], 1200);
  await animateSingleSlot(slots[2], numbers[2], 1600);
}



/* ===============================
   CONFIRM / REJECT
================================ */

confirmBtn.addEventListener("click", async () => {

  await fetch("/api/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentResult)
  });

  resetUI();
});

rejectBtn.addEventListener("click", async () => {

  await fetch("/api/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentResult)
  });

  resetUI();
});



function resetUI() {

  spinBtn.disabled = false;
  actionButtons.classList.add("hidden");

  currentResult = null;
}