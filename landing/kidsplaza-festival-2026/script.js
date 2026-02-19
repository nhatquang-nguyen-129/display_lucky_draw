const UI_CONFIG = {
  digitCount: 3,
  spinDuration: 2000,
  digitDelay: 700
};

let currentResult = null;
let isSpinning = false;

/* MAKE API CALL TO EXPRESS SERVER */

// Make API call for spinning result
async function requestSpin() {
  const response = await fetch("/api/spin", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });

  if (!response.ok) {
    throw new Error("Spin failed");
  }

  return await response.json();
}

// Make API call for result confirmation
async function confirmResult(data) {
  await fetch("/api/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

// Make API call for result reject
async function rejectResult(data) {
  await fetch("/api/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

/* RESULT PROCESSING SECTION */

// Validate that value is exactly 3 numeric digits
function validateThreeDigitFormat(value) {

  const regex = /^\d{3}$/;

  if (!regex.test(value)) {
    throw new Error(
      `Invalid display format: "${value}". 
Expected exactly 3 numeric digits. 
Check backend field mapping or formatting.`
    );
  }

  return true;
}

//
function extractDisplayNumber(result) {
  if (!result) return "000";

  // Example priority:
  if (result.code) return result.code;
  if (result.id) return result.id;

  // fallback
  return "000";
}


/********************************************************************
 *  =======================
 *  UI EFFECT SECTION
 *  =======================
 * 
 *  ONLY this section should change between landing themes.
 *  Everything above stays identical.
 ********************************************************************/

/**
 * Get digit elements
 */
function getDigitElements() {
  return document.querySelectorAll(".digit");
}

/**
 * Reset digits to "---"
 */
function resetDigits() {
  const digits = getDigitElements();
  digits.forEach(d => {
    d.textContent = "-";
  });
}

/**
 * Rolling animation for one digit
 */
function rollDigit(element, finalValue, duration) {
  return new Promise(resolve => {

    let start = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - start;

      if (elapsed >= duration) {
        clearInterval(interval);
        element.textContent = finalValue;
        resolve();
        return;
      }

      element.textContent = Math.floor(Math.random() * 10);
    }, 50);

  });
}

/**
 * Sequential rolling effect
 */
async function playRollingAnimation(numberString) {
  const digits = getDigitElements();

  for (let i = 0; i < UI_CONFIG.digitCount; i++) {

    const digitValue = numberString[i] || "0";

    await rollDigit(
      digits[i],
      digitValue,
      UI_CONFIG.spinDuration
    );

    await delay(UI_CONFIG.digitDelay);
  }
}

/**
 * Utility delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/********************************************************************
 *  =======================
 *  MAIN CONTROL FLOW SECTION
 *  =======================
 ********************************************************************/

/**
 * Handle spin button click
 */
async function handleSpin() {

  if (isSpinning) return;

  try {

    isSpinning = true;
    resetDigits();

    // 1️⃣ Ask backend for result
    const result = await requestSpin();
    currentResult = result;

    const numberString = extractDisplayNumber(result);

  // 🔎 Validate before animation
  validateThreeDigitFormat(numberString);

    // 2️⃣ Play UI animation
    await playRollingAnimation(numberString);

  } catch (err) {

    alert("Error: " + err.message);

  } finally {

    isSpinning = false;
  }
}


/**
 * Handle confirm button
 */
async function handleConfirm() {

  if (!currentResult) return;

  await confirmResult(currentResult);
  currentResult = null;

  resetDigits();
}


/**
 * Handle reject button
 */
async function handleReject() {

  if (!currentResult) return;

  await rejectResult(currentResult);
  currentResult = null;

  resetDigits();
}


/********************************************************************
 *  INIT SECTION
 ********************************************************************/

document.addEventListener("DOMContentLoaded", () => {

  const spinBtn = document.getElementById("spinBtn");
  const confirmBtn = document.getElementById("confirmBtn");
  const rejectBtn = document.getElementById("rejectBtn");

  spinBtn.addEventListener("click", handleSpin);
  confirmBtn.addEventListener("click", handleConfirm);
  rejectBtn.addEventListener("click", handleReject);

  resetDigits();

});
