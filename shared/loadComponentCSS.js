// shared/css-loader.js

const loadedCSS = new Set();

export function loadComponentCSS(relativePath) {
    if (loadedCSS.has(relativePath)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = relativePath;

    document.head.appendChild(link);

    loadedCSS.add(relativePath);
}
