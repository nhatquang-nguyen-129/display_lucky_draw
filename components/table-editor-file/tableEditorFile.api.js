// Logic xử lý file import/replace/save

/**
 * Parse CSV text thành mảng object
 * @param {string} csvText
 * @returns {Array<Object>}
 */
export function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (!lines.length) return [];

    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, idx) => obj[h] = values[idx] || '');
        return obj;
    });
}

/**
 * Export mảng object thành CSV string
 * @param {Array<Object>} data
 * @returns {string}
 */
export function exportCSV(data) {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const lines = data.map(row => headers.map(h => row[h]).join(','));
    return [headers.join(','), ...lines].join('\n');
}
