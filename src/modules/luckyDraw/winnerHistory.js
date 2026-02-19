export function createHistoryManager(options = {}) {

  /* =============================
     CONFIG
  ============================= */

  const {
    persist = false,
    storageKey = "lottery_history",
    requireConfirmation = false,
    uniqueKey = "id"
  } = options;


  /* =============================
     INTERNAL STATE
  ============================= */

  let state = {
    draws: []
  };

  let winnerIndex = new Map();


  /* =============================
     STORAGE
  ============================= */

  function load() {
    if (!persist) return;

    const saved = localStorage.getItem(storageKey);
    if (!saved) return;

    try {
      state = JSON.parse(saved);

      state.draws.forEach(draw => {
        if (draw.status === "confirmed") {
          winnerIndex.set(draw.player[uniqueKey], true);
        }
      });

    } catch {
      state = { draws: [] };
    }
  }

  function save() {
    if (!persist) return;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  load();


  /* =============================
     DRAW RECORD
  ============================= */

  function record(player, { prizeType, meta = {} } = {}) {

    if (!player) return null;

    const draw = {
      id: crypto.randomUUID?.() || Date.now().toString(),
      prizeType,
      player,
      status: requireConfirmation ? "pending" : "confirmed",
      createdAt: Date.now(),
      confirmedAt: requireConfirmation ? null : Date.now(),
      meta
    };

    state.draws.push(draw);

    if (draw.status === "confirmed") {
      winnerIndex.set(player[uniqueKey], true);
    }

    save();

    return draw;
  }


  /* =============================
     STATUS CONTROL
  ============================= */

  function confirm(drawId) {
    const draw = state.draws.find(d => d.id === drawId);
    if (!draw) return false;

    draw.status = "confirmed";
    draw.confirmedAt = Date.now();

    winnerIndex.set(draw.player[uniqueKey], true);

    save();
    return true;
  }

  function invalidate(drawId) {
    const draw = state.draws.find(d => d.id === drawId);
    if (!draw) return false;

    draw.status = "invalid";

    winnerIndex.delete(draw.player[uniqueKey]);

    save();
    return true;
  }


  /* =============================
     QUERY
  ============================= */

  function isWinner(value) {
    return winnerIndex.has(value);
  }

  function getAll() {
    return structuredClone
      ? structuredClone(state.draws)
      : JSON.parse(JSON.stringify(state.draws));
  }

  function getByPrize(prizeType) {
    return state.draws.filter(d => d.prizeType === prizeType);
  }

  function reset() {
    state = { draws: [] };
    winnerIndex.clear();
    save();
  }


  /* =============================
     PUBLIC API
  ============================= */

  return {
    record,
    confirm,
    invalidate,
    isWinner,
    getAll,
    getByPrize,
    reset
  };
}