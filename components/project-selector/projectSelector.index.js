import { loadComponentCSS } from "../shared/componentCSSLoader.js";
loadComponentCSS(new URL("./projectSelector.style.css", import.meta.url).href);

await import(new URL("./projectSelector.api.js", import.meta.url));
await import(new URL("./projectSelector.state.js", import.meta.url));
await import(new URL("./projectSelector.interface.js", import.meta.url));
await import(new URL("./projectSelector.main.js", import.meta.url));

export { initProjectSelector } from "./projectSelector.main.js";
