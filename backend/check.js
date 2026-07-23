const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");

const required = [
  "frontend/index.html",
  "frontend/styles.css",
  "frontend/app.js",
  "backend/server.js"
];

for (const file of required) {
  readFileSync(join(__dirname, "..", file), "utf8");
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk(join(__dirname, "..", "backend")).filter((item) => item.endsWith(".js"))) {
  new Function(readFileSync(file, "utf8"));
}

console.log("Project files and backend JavaScript parsed successfully.");
