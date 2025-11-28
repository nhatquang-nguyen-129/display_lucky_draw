// Logic xử lý text case

/**
 * Chuyển string sang Title Case
 */
export function toTitleCase(str) {
    return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

/**
 * Chuyển string sang Upper Case
 */
export function toUpperCase(str) {
    return str.toUpperCase();
}

/**
 * Chuyển string sang Lower Case
 */
export function toLowerCase(str) {
    return str.toLowerCase();
}

/**
 * Áp dụng function case lên cột được chọn
 * @param {Array<Object>} data 
 * @param {string} column 
 * @param {function} caseFunc 
 */
export function applyCaseToColumn(data, column, caseFunc) {
    return data.map(row => ({
        ...row,
        [column]: caseFunc(row[column] || '')
    }));
}
