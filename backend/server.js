const express = require("express");
const cors = require("cors");
const path = require("path");
const { DatabaseConfigurationError } = require("./database");
const { loadEnvFile } = require("./env");

loadEnvFile();

const {
  cancelCurrentRequest,
  createRequest,
  getCurrentRequest,
  getRequestTimeoutMinutes,
} = require("./services/code-requests");
const { createUser, listActiveUsers, validateUserInput } = require("./services/users");

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_PATH = path.join(__dirname, "..", "frontend");

// Este projeto e apenas um prototipo interno.
// Nao use este modelo de autenticacao/token em producao.
app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_PATH));

// Credenciais do painel carregadas do arquivo .env.
// Isso evita deixar usuario e senha diretamente no codigo.
const APP_USER = process.env.APP_USER;
const APP_PASSWORD = process.env.APP_PASSWORD;

// Tokens simples mantidos em memoria para testes.
// Em producao, use uma estrategia segura de autenticacao.
const activeTokens = new Set();

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

  if (!activeTokens.has(token)) {
    return res.status(401).json({ message: "Token invalido ou expirado." });
  }

  req.token = token;
  next();
}

function adminCredentialsAreValid(username, password) {
  return Boolean(APP_USER && APP_PASSWORD && username === APP_USER && password === APP_PASSWORD);
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

async function collectGmailCodes(maxCodes = 10) {
  const accessToken = await getGmailAccessToken();
  const query = encodeURIComponent(`from:${GMAIL_SENDER}`);
  const listMax = Math.min(100, Math.max(maxCodes * 10, 20));
  const list = await gmailRequest(`messages?q=${query}&maxResults=${listMax}`, accessToken);

  if (!list.messages || list.messages.length === 0) {
    return [];
  }

  const results = [];
  const seen = new Set();

  for (const message of list.messages) {
    if (results.length >= maxCodes) {
      break;
    }

    const details = await gmailRequest(`messages/${message.id}?format=full`, accessToken);
    const text = `${details.snippet || ""}\n${extractMessageText(details.payload)}`;
    const codeMatch = text.match(/\b\d{6}\b/);

    if (!codeMatch) {
      continue;
    }

    const receivedAt = extractReceivedAt(details.payload?.headers);
    const key = `${codeMatch[0]}|${receivedAt}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push({
      code: codeMatch[0],
      receivedAt,
    });
  }

  return results;
}

async function findLatestGmailCode() {
  const codes = await collectGmailCodes(1);
  return codes[0] || null;
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

  const token = createToken();
  activeTokens.add(token);

  return res.json({
    token,
    message: "Login realizado com sucesso.",
  });
});

app.post("/api/logout", authMiddleware, (req, res) => {
  activeTokens.delete(req.token);

  return res.json({
    message: "Logout realizado com sucesso.",
  });
});

app.get("/api/users", async (req, res, next) => {
  try {
    const users = await listActiveUsers();
    return res.json({ users });
  } catch (err) {
    return next(err);
  }
});

app.post("/api/users", async (req, res, next) => {
  const { name, email, username, password } = req.body;

  if (!adminCredentialsAreValid(username, password)) {
    return res.status(401).json({
      message: "Confirme o usuario e a senha administrativos para salvar o cadastro.",
    });
  }

  const validatedUser = validateUserInput(name, email);

  if (validatedUser.error) {
    return res.status(400).json({ message: validatedUser.error });
  }

  try {
    const user = await createUser(validatedUser.name, validatedUser.email);
    return res.status(201).json({
      user,
      message: `${user.name} foi cadastrado com sucesso.`,
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        message: "Ja existe um usuario cadastrado com esse nome ou e-mail.",
      });
    }

    return next(err);
  }
});

app.get("/api/requests/current", async (req, res, next) => {
  try {
    const request = await getCurrentRequest();
    return res.json({ request });
  } catch (err) {
    return next(err);
  }
});

app.post("/api/requests", async (req, res, next) => {
  const userId = String(req.body.userId || "");

  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ message: "Selecione um usuario valido." });
  }

  try {
    const result = await createRequest(userId);

    if (result.userNotFound) {
      return res.status(404).json({ message: "Usuario nao encontrado ou inativo." });
    }

    if (result.conflict) {
      return res.status(409).json({
        request: result.conflict,
        message: `Ops! ${result.conflict.userName} esta aguardando um codigo no momento. Tente novamente em alguns minutos.`,
      });
    }

    return res.status(201).json({
      request: result.request,
      message: `A vez de ${result.request.userName} foi reservada por ate ${getRequestTimeoutMinutes()} minutos.`,
    });
  } catch (err) {
    return next(err);
  }
});

app.delete("/api/requests/current", authMiddleware, async (req, res, next) => {
  try {
    const canceled = await cancelCurrentRequest();
    return res.json({
      canceled,
      message: canceled ? "Solicitacao cancelada." : "Nao ha solicitacao aguardando.",
    });
  } catch (err) {
    return next(err);
  }
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

app.get("/api/code/email/history", authMiddleware, async (req, res) => {
  try {
    const codes = await collectGmailCodes(10);

    if (codes.length === 0) {
      return res.json({
        codes: [],
        message: `Nenhum codigo foi encontrado em e-mails recentes de ${GMAIL_SENDER}.`,
      });
    }

    return res.json({
      codes,
      message: `Historico do Gmail (${GMAIL_RECEIVER}).`,
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

app.use((err, req, res, next) => {
  if (err instanceof DatabaseConfigurationError) {
    return res.status(503).json({ message: err.message });
  }

  console.error(err);
  return res.status(500).json({ message: "Ocorreu um erro interno no servidor." });
});

function startServer(port = PORT, options = {}) {
  const server = app.listen(port, () => {
    if (!options.silent) {
      const address = server.address();
      const activePort = typeof address === "object" && address ? address.port : port;
      console.log(`Acesso OpenAI rodando em http://localhost:${activePort}`);
    }
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
