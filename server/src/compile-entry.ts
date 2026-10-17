// Entry point for the compiled executable: serve the embedded web app and open the browser.
import assets from "./assets.gen";
import { main } from "./index";

globalThis.__CC_ASSETS = assets;
void main({ open: !process.argv.includes("--no-open") });
