export function createWinnerHistory(options = {}) {
  const {
    persist = false,
    storageKey = "lucky_draw_history"
  } = options;

  let winners = {};

  if (persist) {
    const saved = localStorage.getItem(storageKey);
    if (saved) winners = JSON.parse(saved);
  }

  function save() {
    if (persist) {
      localStorage.setItem(storageKey, JSON.stringify(winners));
    }
  }

  function add(prizeType, player) {
    if (!winners[prizeType]) {
      winners[prizeType] = [];
    }

    winners[prizeType].push(player);
    save();
  }

  function getByPrize(prizeType) {
    return winners[prizeType] || [];
  }

  function getAll() {
    return winners;
  }

  function isWinner(uniqueKey, value) {
    return Object.values(winners).some(list =>
      list.some(p => p[uniqueKey] === value)
    );
  }

  function reset() {
    winners = {};
    save();
  }

  return {
    add,
    getByPrize,
    getAll,
    isWinner,
    reset
  };
}