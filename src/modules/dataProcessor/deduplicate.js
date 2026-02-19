export function deduplicate(data, uniqueKeys = []) {
  const seen = new Set();

  return data.filter(item => {
    const key = uniqueKeys.map(k => item[k]).join("|");

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}