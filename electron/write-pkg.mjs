import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../dist-electron");

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2));