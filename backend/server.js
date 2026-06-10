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
  getRequestStatus,
  getRequestTimeoutMinutes,
} = require("./services/code-requests");
const {
  collectGmailCodes,
  findLatestGmailCode,
  getGmailReceiver,
  getGmailSender,
  getMissingGmailEnvVars,
} = require("./services/gmail");
const {
  createRequestObserver,
  getCodeLookbackMinutes,
} = require("./services/request-observer");
const {
  createUser,
  getUserAvatar,
  listActiveUsers,
  listAdminUsers,
  parseAvatarDataUrl,
  updateUser,
  validateUserInput,
} = require("./services/users");
const {
  GroqConfigurationError,
  GroqRequestError,
  requestGroqChat,
} = require("./services/groq-assistant");

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_PATH = path.join(__dirname, "..", "frontend");

// Este projeto e apenas um prototipo interno.
// Nao use este modelo de autenticacao/token em producao.
app.use(cors());
app.use(express.json({ limit: "1mb" }));
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

const requestObserver = createRequestObserver();
const assistantRateLimits = new Map();
const ASSISTANT_RATE_LIMIT = 20;
const ASSISTANT_RATE_WINDOW_MS = 60 * 1000;

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

function assistantRateLimitMiddleware(req, res, next) {
  const now = Date.now();
  const key = req.ip || "local";
  const recentRequests = (assistantRateLimits.get(key) || []).filter(
    (timestamp) => now - timestamp < ASSISTANT_RATE_WINDOW_MS
  );

  if (recentRequests.length >= ASSISTANT_RATE_LIMIT) {
    return res.status(429).json({
      message: "Muitas perguntas em pouco tempo. Aguarde um minuto e tente novamente.",
    });
  }

  recentRequests.push(now);
  assistantRateLimits.set(key, recentRequests);
  next();
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

app.post("/api/assistant/chat", assistantRateLimitMiddleware, async (req, res) => {
  try {
    const result = await requestGroqChat(req.body.messages);
    return res.json(result);
  } catch (err) {
    if (err instanceof GroqConfigurationError) {
      return res.status(503).json({ message: err.message });
    }

    if (err instanceof GroqRequestError) {
      return res.status(err.status).json({ message: err.message });
    }

    return res.status(500).json({ message: "O assistente encontrou um erro inesperado." });
  }
});

app.get("/api/users", async (req, res, next) => {
  try {
    const users = await listActiveUsers();
    return res.json({ users });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/users/:userId/avatar", async (req, res, next) => {
  if (!/^\d+$/.test(req.params.userId)) {
    return res.status(404).send("Foto nao encontrada.");
  }

  try {
    const avatar = await getUserAvatar(req.params.userId);

    if (!avatar) {
      return res.status(404).send("Foto nao encontrada.");
    }

    res.set({
      "Cache-Control": "public, max-age=300",
      "Content-Type": avatar.mime,
      "X-Content-Type-Options": "nosniff",
    });
    return res.send(avatar.data);
  } catch (err) {
    return next(err);
  }
});

app.post("/api/users", async (req, res, next) => {
  const { name, email, avatarDataUrl, username, password } = req.body;

  if (!adminCredentialsAreValid(username, password)) {
    return res.status(401).json({
      message: "Confirme o usuario e a senha administrativos para salvar o cadastro.",
    });
  }

  const validatedUser = validateUserInput(name, email);

  if (validatedUser.error) {
    return res.status(400).json({ message: validatedUser.error });
  }

  const avatar = parseAvatarDataUrl(avatarDataUrl);

  if (avatar?.error) {
    return res.status(400).json({ message: avatar.error });
  }

  try {
    const user = await createUser(validatedUser.name, validatedUser.email, avatar);
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

app.get("/api/admin/users", authMiddleware, async (req, res, next) => {
  try {
    const users = await listAdminUsers();
    return res.json({ users });
  } catch (err) {
    return next(err);
  }
});

app.put("/api/admin/users/:userId", authMiddleware, async (req, res, next) => {
  if (!/^\d+$/.test(req.params.userId)) {
    return res.status(400).json({ message: "Usuario invalido." });
  }

  const { name, email, avatarDataUrl, removeAvatar } = req.body;
  const validatedUser = validateUserInput(name, email);

  if (validatedUser.error) {
    return res.status(400).json({ message: validatedUser.error });
  }

  let avatarAction = null;

  if (removeAvatar === true) {
    avatarAction = { type: "remove" };
  } else if (avatarDataUrl) {
    const avatar = parseAvatarDataUrl(avatarDataUrl);

    if (avatar?.error) {
      return res.status(400).json({ message: avatar.error });
    }

    avatarAction = { type: "replace", avatar };
  }

  try {
    const user = await updateUser(
      req.params.userId,
      validatedUser.name,
      validatedUser.email,
      avatarAction
    );

    if (!user) {
      return res.status(404).json({ message: "Usuario nao encontrado." });
    }

    return res.json({
      user,
      message: `${user.name} foi atualizado com sucesso.`,
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

    requestObserver.wake();

    return res.status(201).json({
      request: result.request,
      message: `A vez de ${result.request.userName} foi reservada por ate ${getRequestTimeoutMinutes()} minutos. Vamos procurar um codigo recebido nos ultimos ${getCodeLookbackMinutes()} minutos ou aguardar um novo.`,
    });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/requests/:requestId", async (req, res, next) => {
  if (!/^\d+$/.test(req.params.requestId)) {
    return res.status(400).json({ message: "Solicitacao invalida." });
  }

  try {
    const request = await getRequestStatus(req.params.requestId);

    if (!request) {
      return res.status(404).json({ message: "Solicitacao nao encontrada." });
    }

    return res.json({ request });
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
        message: `Nenhum codigo foi encontrado em e-mails recentes de ${getGmailSender()}.`,
      });
    }

    lastCode = gmailCode;

    return res.json({
      ...lastCode,
      message: `Codigo encontrado no Gmail ${getGmailReceiver()}.`,
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
        message: `Nenhum codigo foi encontrado em e-mails recentes de ${getGmailSender()}.`,
      });
    }

    return res.json({
      codes,
      message: `Historico do Gmail (${getGmailReceiver()}).`,
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

  if (process.env.DATABASE_URL && getMissingGmailEnvVars().length === 0) {
    void requestObserver.start();
  } else if (!options.silent) {
    console.warn("Observador de codigos desativado: banco ou Gmail nao configurado.");
  }

  server.on("close", () => requestObserver.stop());

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
