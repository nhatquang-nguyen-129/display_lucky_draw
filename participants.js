const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { createObjectCsvWriter } = require("csv-writer");

const INPUT_FILE = path.join(__dirname, "data", "participants.csv");
const OUTPUT_FILE = path.join(__dirname, "data", "cleanedParticipants.csv");

function normalizePhone(phone) {
  return String(phone || "")
    .replace(/\D/g, "")
    .trim();
}

async function processParticipants() {
  const rows = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(INPUT_FILE)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", async () => {
        try {
          const uniquePhones = new Map();
          const duplicates = [];

          rows.forEach((row, index) => {
            const phone = normalizePhone(row.phone_number);

            if (!phone) {
              console.log(
                `[SKIP] Row ${index + 1} - phone_number rỗng`
              );
              return;
            }

            if (uniquePhones.has(phone)) {
              duplicates.push({
                row: index + 1,
                phone,
                data: row
              });
            } else {
              uniquePhones.set(phone, {
                ...row,
                phone_number: phone,
                lucky_number: phone.slice(-3)
              });
            }
          });

          const cleanedData = Array.from(
            uniquePhones.values()
          );

          const headers = Object.keys(cleanedData[0]).map(
            key => ({
              id: key,
              title: key
            })
          );

          const csvWriter = createObjectCsvWriter({
            path: OUTPUT_FILE,
            header: headers
          });

          await csvWriter.writeRecords(cleanedData);

          console.log("\n========================");
          console.log("DUPLICATE RECORDS");
          console.log("========================");

          duplicates.forEach(item => {
            console.log(
              `[REMOVE] Row ${item.row} | Phone: ${item.phone}`
            );
          });

          console.log("\n========================");
          console.log("SUMMARY");
          console.log("========================");
          console.log(`Input Records   : ${rows.length}`);
          console.log(`Duplicate Found : ${duplicates.length}`);
          console.log(`Output Records  : ${cleanedData.length}`);
          console.log(
            `Output File     : ${OUTPUT_FILE}`
          );

          resolve(cleanedData);
        } catch (err) {
          reject(err);
        }
      })
      .on("error", reject);
  });
}

processParticipants()
  .then(() => console.log("\nDone"))
  .catch(console.error);