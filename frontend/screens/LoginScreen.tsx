import React from "react";
import { useState } from "react";
import AppHeader from "../components/AppHeader";
import Alert from "../components/Alert";
import { EyeIcon, EyeOffIcon } from "../components/EyeIcons";
import { APP_CONFIG } from "../constants/app";
import { login } from "../services/api";

interface LoginScreenProps {
  onLogin: (token: string) => void;
}

function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await login(username, password);
      localStorage.setItem(APP_CONFIG.tokenKey, data.token);
      onLogin(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ccfbf1,transparent_34%),linear-gradient(135deg,#f8fafc_0%,#eef2ff_52%,#ecfeff_100%)] px-4 py-6 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-2xl shadow-slate-300/60 backdrop-blur lg:grid-cols-[1fr_420px]">
          <div className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-cyan-300">Acesso seguro</p>
              <h2 className="mt-4 text-4xl font-black leading-tight">Entre e consulte seu codigo em poucos segundos.</h2>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-sm text-slate-300">Consulta integrada ao Gmail autorizado.</p>
              </div>
              <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-4">
                <p className="text-sm font-medium text-cyan-50">
                  Depois de entrar, busque o codigo no Gmail ou abra o historico no painel.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8 lg:p-10">
            <AppHeader />

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <Alert type="error" message={error} />

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Usuario</span>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Digite seu usuario"
                  autoComplete="username"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Senha</span>
                <div className="relative mt-2">
                  <input
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                    title={showPassword ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </label>

              <button
                className="w-full rounded-xl bg-cyan-700 px-4 py-3 font-semibold text-white shadow-lg shadow-cyan-700/20 transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-cyan-300"
                type="submit"
                disabled={loading}
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

export default LoginScreen;
