const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Este projeto e apenas um prototipo interno.
// Nao use este modelo de autenticacao/token em producao.

// Carrega variaveis do arquivo .env sem depender de bibliotecas extras.
// O arquivo .env guarda credenciais locais e nao deve ser enviado para GitHub.
function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");

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

async function gmailRequest(path, accessToken) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
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
  const list = await gmailRequest(
    `messages?q=${query}&maxResults=10`,
    accessToken
  );

  if (!list.messages || list.messages.length === 0) {
    return null;
  }

  for (const message of list.messages) {
    const details = await gmailRequest(
      `messages/${message.id}?format=full`,
      accessToken
    );
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

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Acesso GPT</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  </head>
  <body class="bg-slate-100 min-h-screen">
    <div id="root"></div>

    <script type="text/babel">
      const { useEffect, useState } = React;

      const APP_NAME = "Acesso GPT";
      const TITLE = "Painel de Acesso GPT";
      const DESCRIPTION = "Consulte de forma rápida o último código de acesso autorizado.";

      function AppHeader() {
        return (
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              {APP_NAME}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
              {TITLE}
            </h1>
            <p className="mt-3 text-base text-slate-600">
              {DESCRIPTION}
            </p>
          </div>
        );
      }

      function Alert({ type, message }) {
        if (!message) return null;

        const styles =
          type === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700";

        return (
          <div className={"rounded-lg border px-4 py-3 text-sm " + styles}>
            {message}
          </div>
        );
      }

      function Spinner({ className = "h-5 w-5 border-white" }) {
        return (
          <span
            className={
              "inline-block animate-spin rounded-full border-2 border-t-transparent " +
              className
            }
          />
        );
      }

      function LoginScreen({ onLogin }) {
        const [username, setUsername] = useState("");
        const [password, setPassword] = useState("");
        const [error, setError] = useState("");
        const [loading, setLoading] = useState(false);

        async function handleSubmit(event) {
          event.preventDefault();
          setError("");
          setLoading(true);

          try {
            const response = await fetch("/api/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.message || "Nao foi possivel entrar.");
            }

            localStorage.setItem("acesso-gpt-token", data.token);
            onLogin(data.token);
          } catch (err) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        }

        return (
          <main className="flex min-h-screen items-center justify-center px-4 py-10">
            <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl shadow-slate-200 sm:p-8">
              <AppHeader />

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <Alert type="error" message={error} />

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Usuário</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Digite seu usuário"
                    autoComplete="username"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Senha</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    required
                  />
                </label>

                <button
                  className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "Entrando..." : "Entrar"}
                </button>
              </form>
            </section>
          </main>
        );
      }

      function Dashboard({ token, onLogout }) {
        const [codeData, setCodeData] = useState(null);
        const [message, setMessage] = useState("");
        const [messageType, setMessageType] = useState("success");
        const [loading, setLoading] = useState(false);

        function showMessage(type, text) {
          setMessageType(type);
          setMessage(text);
        }

        async function fetchEmailCode() {
          setLoading(true);
          setMessage("");

          try {
            const response = await fetch("/api/code/email", {
              headers: { Authorization: "Bearer " + token },
            });

            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.message || "Nao foi possivel buscar o codigo no Gmail.");
            }

            setCodeData(data.code ? data : null);
            showMessage("success", data.message || "Codigo do Gmail encontrado com sucesso.");
          } catch (err) {
            showMessage("error", err.message);
          } finally {
            setLoading(false);
          }
        }

        function logout() {
          localStorage.removeItem("acesso-gpt-token");
          onLogout();
        }

        useEffect(() => {
          fetchEmailCode();
        }, []);

        return (
          <main className="flex min-h-screen items-center justify-center px-4 py-10">
            <section className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl shadow-slate-200 sm:p-8">
              <AppHeader />

              <div className="mt-8 space-y-5">
                <Alert type={messageType} message={message} />

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                  <p className="text-sm font-medium text-slate-500">Último código recebido</p>
                  <div className="mt-3 rounded-xl bg-white px-4 py-6 shadow-inner">
                    {loading ? (
                      <div className="flex min-h-[60px] items-center justify-center gap-3 text-blue-700">
                        <Spinner className="h-8 w-8 border-blue-700" />
                        <span className="text-sm font-semibold">Buscando código no Gmail...</span>
                      </div>
                    ) : (
                      <p className="font-mono text-5xl font-bold tracking-widest text-blue-700">
                        {codeData?.code || "------"}
                      </p>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-slate-600">
                    {loading
                      ? "Aguarde enquanto consultamos os e-mails autorizados."
                      : codeData?.receivedAt
                      ? "Recebido em: " + new Date(codeData.receivedAt).toLocaleString("pt-BR")
                      : "Nenhum código foi recebido ainda."}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    onClick={fetchEmailCode}
                    disabled={loading}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {loading && <Spinner />}
                      {loading ? "Buscando..." : "Buscar no Gmail"}
                    </span>
                  </button>
                  <button
                    className="rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
                    onClick={logout}
                  >
                    Sair
                  </button>
                </div>
              </div>
            </section>
          </main>
        );
      }

      function App() {
        const [token, setToken] = useState(() => localStorage.getItem("acesso-gpt-token"));

        return token ? (
          <Dashboard token={token} onLogout={() => setToken(null)} />
        ) : (
          <LoginScreen onLogin={setToken} />
        );
      }

      ReactDOM.createRoot(document.getElementById("root")).render(<App />);
    </script>
  </body>
</html>`);
});

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

app.listen(PORT, () => {
  console.log(`Acesso GPT rodando em http://localhost:${PORT}`);
});
