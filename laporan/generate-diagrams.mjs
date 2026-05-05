import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const diagramsDir = path.join(__dirname, "diagrams");
const assetsDir = path.join(__dirname, "assets");
fs.mkdirSync(assetsDir, { recursive: true });

const files = fs.readdirSync(diagramsDir).filter((f) => f.endsWith(".mmd"));

for (const name of files) {
  const mmd = fs.readFileSync(path.join(diagramsDir, name), "utf8");
  const res = await fetch("https://kroki.io/mermaid/png", {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: mmd,
  });
  if (!res.ok) {
    console.error(name, res.status, await res.text());
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const out = path.join(assetsDir, name.replace(".mmd", ".png"));
  fs.writeFileSync(out, buf);
  console.log("OK", out);
}
