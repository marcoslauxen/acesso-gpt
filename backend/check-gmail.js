const { loadEnvFile } = require("./env");
const {
  checkGmailConnection,
  checkGmailPermissions,
  collectGmailCodes,
  getGmailSender,
} = require("./services/gmail");

loadEnvFile();

async function checkGmail() {
  const profile = await checkGmailConnection();
  const permissions = await checkGmailPermissions();
  const recentCodes = await collectGmailCodes(1);

  console.log(`Gmail conectado: ${profile.emailAddress}`);
  console.log(`Remetente observado: ${getGmailSender()}`);
  console.log(`Codigo recente encontrado: ${recentCodes.length > 0 ? "sim" : "nao"}`);

  if (permissions.missingScopes.length > 0) {
    throw new Error(`Permissoes ausentes: ${permissions.missingScopes.join(", ")}`);
  }

  console.log("Permissoes de leitura e envio validadas.");
}

checkGmail().catch((err) => {
  console.error(`Falha ao validar Gmail: ${err.message}`);
  process.exitCode = 1;
});
