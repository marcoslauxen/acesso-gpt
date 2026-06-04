const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const frontendBundlePath = path.join(__dirname, "frontend", "dist", "main.js");

// Garante que o bundle do frontend exista mesmo se a hospedagem iniciar com
// `node server.js` em vez de `npm start`.
if (!fs.existsSync(frontendBundlePath)) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npmCommand, ["run", "build:frontend"], { stdio: "inherit" });
}

require("./backend/server").startServer();
