import puppeteer from "puppeteer";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(
  __dirname,
  "../supabase/functions/_shared/contractTemplate.html",
);
const outputPath = resolve(__dirname, "../docs/avtalsbekraftelse-mall.pdf");

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();

const html = readFileSync(htmlPath, "utf-8");
await page.setContent(html, { waitUntil: "networkidle0" });

await page.pdf({
  path: outputPath,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: false,
  margin: { top: "0", bottom: "0", left: "0", right: "0" },
});

await browser.close();
console.log(`PDF generated: ${outputPath}`);
