/**
 * The CSV to CSV format adapter
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the website, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * ABSPATH
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/
 *
 * @package WordPress
 */

const fs = require("fs");
const config = require("./preprocessing.config");
const { preprocess, toCSV } = require("./preprocessing.engine");

const INPUT_CSV_FILE = "./data-source/raw.csv";

function parseCSV(text) {
  const [header, ...rows] = text.trim().split("\n");
  const keys = header.split(",").map(k => k.trim());

  return rows.map(row => {
    const values = row.split(",").map(v => v.trim());
    return Object.fromEntries(keys.map((k, i) => [k, values[i] || ""]));
  });
}

const raw = fs.readFileSync(INPUT_CSV_FILE, "utf8");
const rows = parseCSV(raw);

const result = preprocess(rows, config);
fs.writeFileSync(config.OUTPUT_CSV_FILE, toCSV(result.data), "utf8");

console.log("✅ CSV → CSV done");
console.log("• Output rows:", result.data.length);
console.log("• Invalid skipped:", result.invalidCount);