export function parseCSV(text, delimiter = ",") {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(delimiter).map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(delimiter);
    const obj = {};

    headers.forEach((header, i) => {
      obj[header] = values[i]?.trim() || "";
    });

    return obj;
  });
}