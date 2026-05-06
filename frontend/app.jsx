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
      <p className="mt-3 text-base text-slate-600">{DESCRIPTION}</p>
    </div>
  );
}

function Alert({ type, message }) {
  if (!message) return null;

  const styles =
    type === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <div className={"rounded-lg border px-4 py-3 text-sm " + styles}>{message}</div>;
}

function Spinner({ className = "h-5 w-5 border-white" }) {
  return (
    <span
      className={"inline-block animate-spin rounded-full border-2 border-t-transparent " + className}
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
