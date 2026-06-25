const express = require("express");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const app = express();

app.use(express.static("public"));

app.get("/participants", (req, res) => {
  const rows = [];

  fs.createReadStream(
    path.join(__dirname, "data", "cleanedParticipants.csv")
  )
    .pipe(csv())
    .on("data", row => rows.push(row))
    .on("end", () => {
      res.json(rows);
    });
});

app.listen(3000, () => {
  console.log("Lucky Draw Running");
  console.log("http://localhost:3000");
});