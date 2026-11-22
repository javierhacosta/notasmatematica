import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const web = path.join(root, "www");
fs.rmSync(web, { recursive: true, force: true });
fs.mkdirSync(web, { recursive: true });

const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(web, to));
copy("docente.html", "docente.html");
copy("docente.html", "index.html");
copy("login-docente.html", "login-docente.html");
copy("service-worker.js", "service-worker.js");

for (const name of ["docente.html", "index.html"]) {
  const file = path.join(web, name);
  let html = fs.readFileSync(file, "utf8");
  const tag = '<script src="./offline-transfer.js"></script>';
  if (!html.includes(tag)) html = html.replace(/<\/body>/i, tag + "\n</body>");
  if (!html.includes(tag)) throw new Error("No se encontró </body> en " + name);
  fs.writeFileSync(file, html, "utf8");
}

const swPath = path.join(web, "service-worker.js");
let sw = fs.readFileSync(swPath, "utf8");
sw = sw.replace(
  "const CORE = ['./','./docente.html','./login-docente.html'];",
  "const CORE = ['./','./docente.html','./login-docente.html','./offline-transfer.js'];"
);
fs.writeFileSync(swPath, sw, "utf8");
console.log("Archivos web preparados para Android.");
