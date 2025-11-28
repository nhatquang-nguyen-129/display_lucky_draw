// Logic chỉnh sửa dữ liệu table (draft, edit, delete)

export function applyDraft(data, draftRows) {
    const newData = [...data];
    draftRows.forEach(idx => {
        if (newData[idx] && draftRows[idx]) {
            newData[idx] = { ...newData[idx], ...draftRows[idx] };
        }
    });
    return newData;
}

export function deleteSelectedRows(data, selectedRows) {
    return data.filter((_, idx) => !selectedRows.has(idx));
}
