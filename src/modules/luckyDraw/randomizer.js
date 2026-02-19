/* RANDOMIZER SETTINGS */

const RANDOMIZER_DUPLICATE_SETTINGS = {
  allowDuplicate: false,
  maxDuplicatePerItem: Infinity
};

/*
    allowDuplicate:
    - false: Mỗi item chỉ được chọn 1 lần duy nhất
    - true: Cho phép có thể trùng có hoặc không giới hạn

    maxDuplicatePerItem:
    - Infinity: không giới hạn số lần trùng lặp
    - 1 2 hoặc tùy chọn: Mỗi item chỉ được chọn tối đa 1 - 2 lần
*/

const RANDOMIZER_STRATEGY_SETTINGS = "normal";

/*
    STRATEGY:
    - "normal": Equal probability for all eligible items
    If normal mod was chosen, the settings section is skippable

    - "weight": Random theo trọng số
    Nếu chọn Weight thì chọn Settings chi tiết trọng số bên dưới
*/


const RANDOMIZER_WEIGHT_SETTINGS = {

  mode: "formula",
  /*
    mode: Chỉ chọn duy nhất 1 mode
    - "field"   : Lấy weight trực tiếp từ data
    - "mapping" : Chia nhóm theo khoảng giá trị
    - "formula" : Viết logic tính weight bằng JS
  */

  fieldMode: {
  /*
    Field mode sử dụng khi có sẵn dữ liệu làm trọng số
  */

    weightKey: "PutYourWeightKeyHere",
    /*
        weightKey: Nhập tên field chứa weight trong object
    */

    defaultWeight: 1
    /*
    `defaultWeight: Nếu item không có weight hoặc weight không hợp lệ
    */

  },

  mappingMode: {
  /*
    Maping mode dùng khi muốn chia nhóm theo khoảng giá trị
  */

    mappingKey: "PutYourMappingKeysHere",
    /*
    mappingKey: Field dùng để so sánh
    */

    mappingTable: [
      { min: 0, max: 1, weight: 1 },
      { min: 2, max: 3, weight: 3 },
      { min: 4, max: Infinity, weight: 6 }
    ],
    /*
        mappingTable: Can use "Infinity"
        - min: giá trị tối thiểu (bao gồm)
        - max: giá trị tối đa (bao gồm)
        - weight: trọng số áp dụng
    */

    defaultWeight: 1
    /*
        If not match any rule
    */

  },


  formulaMode: {
  /*
    Formula mode khi có điều kiện phức tạp
  */

    formula: (item) => {

      /*
      Ví dụ data:

      {
        name: "A",
        orderCount: 4,
        averageOrder: 650000,
        totalSpent: 2600000
      }
      */

      // VIP: mua nhiều + giá trị cao
      if (item.orderCount >= 3 && item.averageOrder >= 500000) {
        return 10;
      }

      // Mua nhiều nhưng giá trị thấp
      if (item.orderCount >= 3) {
        return 6;
      }

      // Trung bình
      if (item.orderCount === 2) {
        return 3;
      }

      // Cơ bản
      return 1;
    }

  }

};

/* RANDOMIZER ENGINE */

export function createRandomizer() {

  const duplicateMap = new Map();
  /*
    duplicateMap:
    - Key   : Unique item key
    - Value : Number of times the item has been picked
  */

  // Public pick function
  function pick(array, uniqueKey = "id") {
    if (!Array.isArray(array) || !array.length) return null;

    switch (RANDOMIZER_STRATEGY_SETTINGS) {

      case "weight":
        return weightedPick(array, uniqueKey);

      case "normal":
      default:
        return normalPick(array, uniqueKey);
    }
  }

  //Equal probability selection
  function normalPick(array, uniqueKey) {

    const eligible = array.filter(item =>
      canPick(item, uniqueKey)
    );

    if (!eligible.length) return null;

    const index = Math.floor(getRandom() * eligible.length);
    const selected = eligible[index];

    recordPick(selected, uniqueKey);

    return selected;
  }

  // Weighted probability selection
  function weightedPick(array, uniqueKey) {

    const eligible = array.filter(item =>
      canPick(item, uniqueKey)
    );

    if (!eligible.length) return null;

    const totalWeight = eligible.reduce((sum, item) => {
      return sum + resolveWeight(item);
    }, 0);

    if (totalWeight <= 0) return null;

    const randomValue = getRandom() * totalWeight;

    let cumulative = 0;

    for (let item of eligible) {

      cumulative += resolveWeight(item);

      if (randomValue <= cumulative) {
        recordPick(item, uniqueKey);
        return item;
      }
    }

    return eligible[eligible.length - 1];
  }

  // Weight probability resolver
  function resolveWeight(item) {

    const settings = RANDOMIZER_WEIGHT_SETTINGS;
    const mode = settings.mode;

    if (mode === "field") {

      const { weightKey, defaultWeight } =
        settings.fieldMode;

      const value = Number(item[weightKey]);

      return value > 0 ? value : defaultWeight;
    }

    if (mode === "mapping") {

      const { mappingKey, mappingTable, defaultWeight } =
        settings.mappingMode;

      const value = Number(item[mappingKey]);

      for (let rule of mappingTable) {
        if (value >= rule.min && value <= rule.max) {
          return rule.weight;
        }
      }

      return defaultWeight;
    }

    if (mode === "formula") {

      const { formula } =
        settings.formulaMode;

      const value = Number(formula(item));

      return value > 0 ? value : 1;
    }

    return 1;
  }

  // Duplicate control
  function canPick(item, uniqueKey) {

    const key = item[uniqueKey];

    if (!RANDOMIZER_DUPLICATE_SETTINGS.allowDuplicate) {
      return !duplicateMap.has(key);
    }

    const currentCount =
      duplicateMap.get(key) || 0;

    return currentCount <
      RANDOMIZER_DUPLICATE_SETTINGS.maxDuplicatePerItem;
  }

  function recordPick(item, uniqueKey) {

    const key = item[uniqueKey];

    const currentCount =
      duplicateMap.get(key) || 0;

    duplicateMap.set(key, currentCount + 1);
  }

  // Default random generator
  function getRandom() {
    return Math.random();
  }

  // Clear duplicate tracking
  function reset() {
    duplicateMap.clear();
  }

/* RANDOMIZER PUBLIC API */

  return {
    pick,
    reset
  };
}