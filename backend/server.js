const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_PATH = path.join(__dirname, "..", "frontend");

// Este projeto e apenas um prototipo interno.
// Nao use este modelo de autenticacao/token em producao.

// Carrega variaveis do arquivo .env sem depender de bibliotecas extras.
// O arquivo .env guarda credenciais locais e nao deve ser enviado para GitHub.
function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_PATH));

// Credenciais do painel carregadas do arquivo .env.
// Isso evita deixar usuario e senha diretamente no codigo.
const APP_USER = process.env.APP_USER;
const APP_PASSWORD = process.env.APP_PASSWORD;

// Token simples mantido em memoria para testes.
// Em producao, use uma estrategia segura de autenticacao.
let validToken = null;

// Ultimo codigo recebido, tambem salvo apenas em memoria.
// Ao reiniciar o servidor, esse valor sera perdido.
let lastCode = null;

// Configuracao do e-mail usado para buscar codigos reais.
// A senha do Gmail nunca deve ficar no frontend nem dentro deste arquivo.
const GMAIL_SENDER = "noreply@tm.openai.com";
const GMAIL_RECEIVER = "gptpensador@gmail.com";

function createToken() {
  return `token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Token nao informado." });
  }

  const token = authHeader.replace("Bearer ", "");

  if (!validToken || token !== validToken) {
    return res.status(401).json({ message: "Token invalido ou expirado." });
  }

  next();
}

function getMissingGmailEnvVars() {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"].filter(
    (envName) => !process.env[envName]
  );
}

async function getGmailAccessToken() {
  const missingVars = getMissingGmailEnvVars();

  if (missingVars.length > 0) {
    throw new Error(
      `Configure as variaveis de ambiente para Gmail: ${missingVars.join(", ")}.`
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || "Nao foi possivel autenticar no Gmail.");
  }

  return data.access_token;
}

async function gmailRequest(requestPath, accessToken) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${requestPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Nao foi possivel consultar o Gmail.");
  }

  return data;
}

function decodeBase64Url(value = "") {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractMessageText(payload) {
  if (!payload) {
    return "";
  }

  const currentText = payload.body?.data ? decodeBase64Url(payload.body.data) : "";
  const childText = (payload.parts || []).map(extractMessageText).join("\n");

  return `${currentText}\n${childText}`;
}

function extractReceivedAt(headers = []) {
  const dateHeader = headers.find((header) => header.name.toLowerCase() === "date");

  if (!dateHeader) {
    return new Date().toISOString();
  }

  const parsedDate = new Date(dateHeader.value);
  return Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
}

async function findLatestGmailCode() {
  const accessToken = await getGmailAccessToken();
  const query = encodeURIComponent(`from:${GMAIL_SENDER} newer_than:30d`);
  const list = await gmailRequest(`messages?q=${query}&maxResults=10`, accessToken);

  if (!list.messages || list.messages.length === 0) {
    return null;
  }

  for (const message of list.messages) {
    const details = await gmailRequest(`messages/${message.id}?format=full`, accessToken);
    const text = `${details.snippet || ""}\n${extractMessageText(details.payload)}`;
    const codeMatch = text.match(/\b\d{6}\b/);

    if (codeMatch) {
      return {
        code: codeMatch[0],
        receivedAt: extractReceivedAt(details.payload?.headers),
      };
    }
  }

  return null;
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!APP_USER || !APP_PASSWORD) {
    return res.status(500).json({
      message: "Credenciais do painel nao foram configuradas no .env.",
    });
  }

  if (username !== APP_USER || password !== APP_PASSWORD) {
    return res.status(401).json({ message: "Usuario ou senha invalidos." });
  }

  validToken = createToken();

  return res.json({
    token: validToken,
    message: "Login realizado com sucesso.",
  });
});

app.post("/api/logout", authMiddleware, (req, res) => {
  validToken = null;

  return res.json({
    message: "Logout realizado com sucesso.",
  });
});

app.get("/api/code", authMiddleware, (req, res) => {
  if (!lastCode) {
    return res.json({
      message: "Nenhum codigo foi recebido ainda.",
    });
  }

  return res.json(lastCode);
});

app.post("/api/code", authMiddleware, (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Informe o codigo no campo code." });
  }

  lastCode = {
    code,
    receivedAt: new Date().toISOString(),
  };

  return res.status(201).json(lastCode);
});

app.get("/api/code/email", authMiddleware, async (req, res) => {
  try {
    const gmailCode = await findLatestGmailCode();

    if (!gmailCode) {
      return res.json({
        message: `Nenhum codigo foi encontrado em e-mails recentes de ${GMAIL_SENDER}.`,
      });
    }

    lastCode = gmailCode;

    return res.json({
      ...lastCode,
      message: `Codigo encontrado no Gmail ${GMAIL_RECEIVER}.`,
    });
  } catch (err) {
    return res.status(503).json({
      message: err.message,
    });
  }
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ message: "Rota da API nao encontrada." });
  }

  if (path.extname(req.path)) {
    return res.status(404).send("Arquivo nao encontrado.");
  }

  res.sendFile(path.join(FRONTEND_PATH, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Acesso OpenAI rodando em http://localhost:${PORT}`);
});
