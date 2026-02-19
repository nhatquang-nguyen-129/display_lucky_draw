import xlsx from "xlsx";

export async function xlsxToJson(path) {

  const workbook = xlsx.readFile(path);

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const json = xlsx.utils.sheet_to_json(sheet);

  return json;
}