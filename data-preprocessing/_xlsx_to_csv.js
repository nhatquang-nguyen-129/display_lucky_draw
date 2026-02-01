/**
 * The XLSX to CSV format adapter
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

const XLSX = require("xlsx");
const fs = require("fs");
const config = require("./preprocessing.config");
const { preprocess, toCSV } = require("./preprocessing.engine");

const INPUT_XLSX_FILE = "./data-source/raw.xlsx";
const SHEET_NAME = "Sheet1";

const wb = XLSX.readFile(INPUT_XLSX_FILE);
const sheet = wb.Sheets[SHEET_NAME];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const result = preprocess(rows, config);
fs.writeFileSync(config.OUTPUT_CSV_FILE, toCSV(result.data), "utf8");

console.log("✅ XLSX → CSV done");
console.log("• Output rows:", result.data.length);
console.log("• Invalid skipped:", result.invalidCount);
