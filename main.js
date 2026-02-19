/* RANDOMIZER SETTINGS */

const RANDOMIZER_SESSION_SETTINGS = {
  sessionId: "campaign-2026-01"
};


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
    
        weightKey: "PutYourWeightKeyHere",
        /*
            weightKey: Nhập tên field chứa weight trong object
        */
        
        defaultWeight: 1
    },

  mappingMode: {
    
    mappingKey: "PutYourMappingKeysHere",
    /*
        mappingKey: Field dùng để so sánh
    */
    
    mappingTable: [
      { min: 0, max: 1, weight: 1 },
      { min: 2, max: 3, weight: 3 },
      { min: 4, max: Infinity, weight: 6 }
    ],
    defaultWeight: 1
  },
    /*
        mappingTable: Can use "Infinity"
        - min: giá trị tối thiểu (bao gồm)
        - max: giá trị tối đa (bao gồm)
        - weight: trọng số áp dụng
    */

  formulaMode: {
    
    formula: (item) => {
    /*
        Dưới đây là công thức mẫu
    */

      // VIP: mua nhiều + giá trị cao
      if (item.orderCount >= 3 && item.averageOrder >= 500000)
        return 10;
      
      // Mua nhiều nhưng giá trị thấp
      if (item.orderCount >= 3)
        return 6;
      
      // Trung bình
      if (item.orderCount === 2)
        return 3;
      
      // Cơ bản
      return 1;
    }
  }
};


/* IMPORT LANDING PAGE */
import landingA from "./landings/landingA.js";
import landingB from "./landings/landingB.js";

const CURRENT_LANDING = "landingA";

const LANDING_MAP = {
  landingA,
  landingB
};

const landingData = LANDING_MAP[CURRENT_LANDING];

/* IMPORT RANDOMIZER*/
import { createRandomizer } from "./randomizer.js";

const randomizer = createRandomizer({
  sessionSettings: RANDOMIZER_SESSION_SETTINGS,
  duplicateSettings: RANDOMIZER_DUPLICATE_SETTINGS,
  strategy: RANDOMIZER_STRATEGY_SETTINGS,
  weightSettings: RANDOMIZER_WEIGHT_SETTINGS
});

/* ===============================
   EXECUTION FLOW
================================ */

function runSpin() {

  const result = randomizer.pick(landingData);

  console.log("Spin Result:", result);

  if (RANDOMIZER_SESSION_SETTINGS.requireConfirm) {
    console.log("Waiting confirm before finalizing...");
    return result;
  }

  return result;
}

/* MAIN ENTRYPOINT */

runSpin();