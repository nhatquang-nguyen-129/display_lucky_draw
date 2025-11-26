const fs = require('fs');
const path = require('path');

class CSVLoader {
    constructor() {
        this.data = [];
    }

    async loadCSV(openDialogCallback) {
        try {
            const filePath = await openDialogCallback();

            if (!filePath) {
                console.log("❗ No CSV file selected.");
                return null;
            }

            console.log("📂 CSV File Selected:", filePath);

            const csvContent = fs.readFileSync(filePath, 'utf8');
            this.data = this.parseCSV(csvContent);

            return {
                filePath,
                rows: this.data.length,
                data: this.data
            };

        } catch (error) {
            console.error("❌ Error loading CSV:", error);
            return null;
        }
    }

    parseCSV(csvText) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== "");

        if (lines.length === 0) return [];

        const headers = lines[0].split(",").map(h => h.trim());
        const rows = lines.slice(1);

        const parsed = rows.map(row => {
            const values = row.split(",").map(v => v.trim());
            let obj = {};
            headers.forEach((h, i) => {
                obj[h] = values[i] ?? "";
            });
            return obj;
        });

        return parsed;
    }

    getData() {
        return this.data;
    }
}

module.exports = CSVLoader;
