import { loadLocalFile } from "./localLoader.js";
import { csvToJson } from "./csvToJsonTransformer.js";
import { xlsxToJson } from "./xlsxToJSONTransformer.js";

export async function loadData(config) {

  const { sourceType, storage, direction } = config;

  if (!sourceType || !storage || !direction) {
    throw new Error("Missing required data config fields");
  }

  let rawData;

  if (storage === "local") {
    rawData = await loadLocalFile(direction);
  } else {
    throw new Error("Storage type not supported yet");
  }

  let jsonData;

  if (sourceType === "csv") {
    jsonData = csvToJson(rawData);
  } else if (sourceType === "xlsx") {
    jsonData = await xlsxToJson(direction); 

  } else {
    throw new Error("Unsupported source type");
  }

  return jsonData;
}