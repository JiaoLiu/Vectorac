const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const generated = fs.readFileSync(
  path.join(root, ".vuepress/components/slime-worker-url.generated.js"),
  "utf8"
);
const match = generated.match(/export default "([^"]+)"/);
if (!match) throw new Error("Cannot read generated slime worker URL");

const workerPath = path.join(root, "public", match[1].replace(/^\//, ""));
if (!fs.existsSync(workerPath) || fs.statSync(workerPath).size < 1000)
  throw new Error(`Slime worker missing from build: ${workerPath}`);

const chunksDir = path.join(root, "public/assets/js");
const referenced = fs
  .readdirSync(chunksDir)
  .filter(name => name.endsWith(".js"))
  .some(name =>
    fs.readFileSync(path.join(chunksDir, name), "utf8").includes(match[1])
  );
if (!referenced) throw new Error(`Built site does not reference ${match[1]}`);

console.log(`Verified ${match[1]} (${fs.statSync(workerPath).size} bytes)`);
