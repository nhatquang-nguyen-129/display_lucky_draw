import { parseCSV } from "./parseCSV.js";
import { normalizeName } from "./normalizeName.js";
import { normalizePhone } from "./normalizePhone.js";
import { deduplicate } from "./deduplicate.js";

export function processData(csvText, options = {}) {
  const {
    uniqueKeys = ["phone"],
    normalizeNameField = "name",
    normalizePhoneField = "phone"
  } = options;

  let data = parseCSV(csvText);

  data = data.map(item => ({
    ...item,
    [normalizeNameField]: normalizeName(item[normalizeNameField] || ""),
    [normalizePhoneField]: normalizePhone(item[normalizePhoneField] || "")
  }));

  data = deduplicate(data, uniqueKeys);

  return data;
}