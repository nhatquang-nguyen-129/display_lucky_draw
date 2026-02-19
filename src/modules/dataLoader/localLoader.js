import fs from "fs";

export function loadLocalFile(path) {
  return fs.readFileSync(path, "utf-8");
}