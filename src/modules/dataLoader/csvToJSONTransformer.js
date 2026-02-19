export function csvToJson(raw) {

  const lines = raw.split("\n").filter(Boolean);
  const headers = lines[0].split(",");

  const result = [];

  for (let i = 1; i < lines.length; i++) {

    const values = lines[i].split(",");
    const obj = {};

    headers.forEach((header, index) => {
      obj[header.trim()] = values[index]?.trim();
    });

    result.push(obj);
  }

  return result;
}