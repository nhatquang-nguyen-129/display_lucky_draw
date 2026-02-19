/* ======================================================
   LUCKY DRAW GLOBAL CONFIG
   Chỉnh toàn bộ rule tại đây
====================================================== */

// ===== PLAYER CONFIG =====
const UNIQUE_KEY = "phone";
const DISPLAY_DIGIT_COUNT = 3;
const ALLOW_DUPLICATE_WINNER = false;

// ===== RANDOM CONFIG =====
const RANDOM_CONFIG = {
  useSeed: false,
  seed: 12345,
  freeze: false
};

// ===== HISTORY CONFIG =====
const HISTORY_CONFIG = {
  persist: false,
  storageKey: "lucky_draw_history"
};

// ===== PRIZE CONFIG =====
const PRIZE_CONFIG = {
  special: 1,
  first: 2,
  second: 3
};

const PRIZE_ORDER = [
    "special", 
    "first", 
    "second"
];

// ===== CUSTOM FILTER =====
function customFilter(player) {
  return true;
}


/* ======================================================
   LOGIC
====================================================== */

import { createRandomizer } from "./randomizer.js";
import { createWinnerHistory } from "./winnerHistory.js";

export function createLuckyDraw(data) {
  const randomizer = createRandomizer(RANDOM_CONFIG);
  const history = createWinnerHistory(HISTORY_CONFIG);

  function extractLuckyNumber(value) {
    return value.slice(-DISPLAY_DIGIT_COUNT);
  }

  function getAvailablePlayers() {
    return data.filter(player => {
      if (!customFilter(player)) return false;

      if (!ALLOW_DUPLICATE_WINNER) {
        return !history.isWinner(UNIQUE_KEY, player[UNIQUE_KEY]);
      }

      return true;
    });
  }

  function drawByPrize(prizeType) {
    const available = getAvailablePlayers();
    if (!available.length) return null;

    const winner = randomizer.pick(available);

    const result = {
      ...winner,
      prize: prizeType,
      luckyNumber: extractLuckyNumber(winner[UNIQUE_KEY])
    };

    history.add(prizeType, result);
    return result;
  }

  function autoDrawNextPrize() {
    for (let prize of PRIZE_ORDER) {
      const currentCount = history.getByPrize(prize).length;
      const maxCount = PRIZE_CONFIG[prize];

      if (currentCount < maxCount) {
        return drawByPrize(prize);
      }
    }

    return null;
  }

  return {
    drawByPrize,
    autoDrawNextPrize,
    getHistory: history.getAll,
    reset: history.reset
  };
}
