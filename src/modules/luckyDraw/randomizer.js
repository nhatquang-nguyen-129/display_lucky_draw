import fs from "fs";
import path from "path";

export function createRandomizer({
  sessionSettings,
  duplicateSettings,
  strategy,
  weightSettings
}) {

  const sessionId = sessionSettings.sessionId;

  const sessionsDir = path.resolve("./sessions");
  const sessionFile = path.join(sessionsDir, `${sessionId}.json`);

  // Session handler
  function ensureSessionFile() {

    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir);
    }

    if (!fs.existsSync(sessionFile)) {

      const initialData = {
        sessionId,
        createdAt: new Date().toISOString(),
        history: []
      };

      fs.writeFileSync(
        sessionFile,
        JSON.stringify(initialData, null, 2)
      );
    }
  }

  function readSession() {
    ensureSessionFile();
    return JSON.parse(
      fs.readFileSync(sessionFile, "utf-8")
    );
  }

  function writeSession(data) {
    fs.writeFileSync(
      sessionFile,
      JSON.stringify(data, null, 2)
    );
  }

  // Duplication handler
  function buildDuplicateMap(uniqueKey) {

    const sessionData = readSession();
    const map = new Map();

    for (let record of sessionData.history) {

      if (record.status !== "confirmed") continue;

      const key = record.item[uniqueKey];

      const current = map.get(key) || 0;
      map.set(key, current + 1);
    }

    return map;
  }

  // Public pick orchestrator
  function pick(array, uniqueKey = "id") {

    if (!Array.isArray(array) || !array.length) return null;

    const duplicateMap = buildDuplicateMap(uniqueKey);

    switch (strategy) {

      case "weight":
        return weightedPick(array, uniqueKey, duplicateMap);

      case "normal":
      default:
        return normalPick(array, uniqueKey, duplicateMap);
    }
  }

  // Normal pick
  function normalPick(array, uniqueKey, duplicateMap) {

    const eligible = array.filter(item =>
      canPick(item, uniqueKey, duplicateMap)
    );

    if (!eligible.length) return null;

    const index =
      Math.floor(Math.random() * eligible.length);

    return eligible[index];
  }

  // Weighted pick
  function weightedPick(array, uniqueKey, duplicateMap) {

    const eligible = array.filter(item =>
      canPick(item, uniqueKey, duplicateMap)
    );

    if (!eligible.length) return null;

    const totalWeight = eligible.reduce(
      (sum, item) => sum + resolveWeight(item),
      0
    );

    if (totalWeight <= 0) return null;

    const randomValue = Math.random() * totalWeight;

    let cumulative = 0;

    for (let item of eligible) {

      cumulative += resolveWeight(item);

      if (randomValue <= cumulative) {
        return item;
      }
    }

    return eligible[eligible.length - 1];
  }

  // Weight resolver
  function resolveWeight(item) {

    const mode = weightSettings.mode;

    if (mode === "field") {

      const { weightKey, defaultWeight } =
        weightSettings.fieldMode;

      const value = Number(item[weightKey]);

      return value > 0 ? value : defaultWeight;
    }

    if (mode === "mapping") {

      const { mappingKey, mappingTable, defaultWeight } =
        weightSettings.mappingMode;

      const value = Number(item[mappingKey]);

      for (let rule of mappingTable) {
        if (value >= rule.min && value <= rule.max) {
          return rule.weight;
        }
      }

      return defaultWeight;
    }

    if (mode === "formula") {

      const value =
        Number(weightSettings.formulaMode.formula(item));

      return value > 0 ? value : 1;
    }

    return 1;
  }

  // Duplication control
  function canPick(item, uniqueKey, duplicateMap) {

    const key = item[uniqueKey];

    if (!duplicateSettings.allowDuplicate) {
      return !duplicateMap.has(key);
    }

    const current =
      duplicateMap.get(key) || 0;

    return current <
      duplicateSettings.maxDuplicatePerItem;
  }

  // Result confirmation
  function confirm(item) {

    const sessionData = readSession();

    sessionData.history.push({
      item,
      status: "confirmed",
      timestamp: new Date().toISOString()
    });

    writeSession(sessionData);
  }

  function reject(item) {

    const sessionData = readSession();

    sessionData.history.push({
      item,
      status: "rejected",
      timestamp: new Date().toISOString()
    });

    writeSession(sessionData);
  }

  /* PUBLIC API */
  return {
    pick,
    confirm,
    reject
  };
}