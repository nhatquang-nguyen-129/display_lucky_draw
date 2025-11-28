// tableEditorDedup.api.js
// -----------------------------
// Deduplicate logic: xác định các row trùng dựa trên cột
// -----------------------------

/**
 * Nhóm các row dựa trên cột dedupColumns
 * @param {Array} data - mảng row
 * @param {Array} dedupColumns - mảng tên cột cần dedup
 * @returns {Object} { preview: Array, duplicateRows: Set }
 */
export function getDedupPreview(data, dedupColumns) {
    if (!dedupColumns.length) return { preview: data.map((row, idx) => ({ row, idx })), duplicateRows: new Set() };

    const groups = new Map();
    const duplicateRows = new Set();

    data.forEach((row, idx) => {
        const key = dedupColumns.map(c => row[c]).join("|");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ row, idx });
    });

    const duplicatePart = [];
    const uniquePart = [];

    let groupCounter = 0;
    const groupIndexes = new Map(); // idx → groupIndex

    groups.forEach((group) => {
        if (group.length > 1) {
            group.forEach(item => {
                duplicatePart.push(item);
                duplicateRows.add(item.idx);
                groupIndexes.set(item.idx, groupCounter);
            });
            groupCounter++;
        } else {
            uniquePart.push(group[0]);
        }
    });

    const preview = [...duplicatePart, ...uniquePart];

    return {
        preview: preview.map(item => ({
            ...item,
            groupIndex: groupIndexes.get(item.idx) ?? null
        })),
        duplicateRows
    };
}
