export function toTitleCase(name) {
  return name
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeName(name) {
  return toTitleCase(name.trim().replace(/\s+/g, " "));
}