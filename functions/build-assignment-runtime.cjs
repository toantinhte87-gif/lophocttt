// Bundle the same assignment logic used by Hosting; no second scheduling algorithm.
const fs = require("node:fs");
const path = require("node:path");
const destination = path.join(__dirname, "assignment-runtime");
fs.mkdirSync(destination, { recursive: true });
const files = ["assignment-lifecycle.js", "assignment-deadline.js", "assignment-stats.js", "question-history.js", "utils.js"];
for (const file of files) {
  const source = fs.readFileSync(path.join(__dirname, "../public/js", file), "utf8");
  fs.writeFileSync(path.join(destination, file), source.replace(/(\.\/[^"']+\.js)\?v=\d+/g, "$1"));
}
fs.writeFileSync(path.join(destination, "package.json"), '{"type":"module","private":true}\n');
fs.copyFileSync(path.join(__dirname, "firestore-adapter.mjs"), path.join(destination, "services.js"));
console.log("Assignment runtime: synchronized 5 shared modules.");
