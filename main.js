import express from "express";
import { loadData } from "./modules/dataLoader/index.js";
import { createRandomizer } from "./randomizer.js";

/* CONFIG  */

// Data source config

const LOADER_DATA_CONFIG = {
  sourceType: "csv",
/*
    sourceType:
    - xlsx: Excel file
    - csv: CSV file
*/

  storage: "local",
/*
    storage:
    - local: Stored in local memory
*/

  direction: "./data/kidsplaza-festival-2026.csv"
/*
    direction:
    - local: File location in disk
*/

};

// Randomizer config

const RANDOMIZER_SESSION_SETTINGS = {
  sessionId: "TestSession"
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


// Landing page config

const LANDING_PAGE_CONFIG = {
  port: 3000,
  landingFolder: "landing/kidsplaza-festival-2026"
};

/* FLOW */

// Load Data

const dataSource = await loadData(LOADER_DATA_CONFIG);

// Create Randomizer

const randomizer = createRandomizer({
  sessionSettings: RANDOMIZER_SESSION_SETTINGS,
  duplicateSettings: RANDOMIZER_DUPLICATE_SETTINGS,
  strategy: RANDOMIZER_STRATEGY_SETTINGS,
  weightSettings: RANDOMIZER_WEIGHT_SETTINGS
});

// Express server

const app = express();

app.use(express.json());
app.use(express.static(SERVER_CONFIG.landingFolder));

app.post("/api/spin", (req, res) => {

  try {
    const result = randomizer.pick(dataSource);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }

});

app.post("/api/confirm", (req, res) => {

  try {
    randomizer.confirm(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }

});

app.post("/api/reject", (req, res) => {

  try {
    randomizer.reject(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }

});

app.listen(SERVER_CONFIG.port, () => {
  console.log(`Server running at http://localhost:${SERVER_CONFIG.port}`);
});