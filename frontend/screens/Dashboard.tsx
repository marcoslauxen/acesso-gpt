import React from "react";
import { useEffect, useState } from "react";
import Alert from "../components/Alert";
import AppHeader from "../components/AppHeader";
import CodeCard from "../components/CodeCard";
import Spinner from "../components/Spinner";
import { APP_CONFIG } from "../constants/app";
import {
  ApiError,
  fetchEmailCode,
  fetchEmailCodeHistory,
  logout as requestLogout,
  type CodeData,
  type CodeHistoryEntry,
} from "../services/api";

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Dashboard({ token, onLogout }: DashboardProps) {
  const [codeData, setCodeData] = useState<CodeData | null>(null);
  const [history, setHistory] = useState<CodeHistoryEntry[]>([]);
  const [historyFetchedAt, setHistoryFetchedAt] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("success");
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function showMessage(type: "error" | "success", text: string) {
    setMessageType(type);
    setMessage(text);
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const data = await fetchEmailCodeHistory(token);
      setHistory(data.codes);
      setHistoryFetchedAt(new Date().toISOString());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      console.warn("Falha ao carregar historico do Gmail.", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleFetchEmailCode() {
    setLoading(true);
    setMessage("");

    try {
      const data = await fetchEmailCode(token);
      setCodeData(data.code ? data : null);
      await loadHistory();
      showMessage("success", data.message || "Codigo do Gmail encontrado com sucesso.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }

      showMessage("error", err instanceof Error ? err.message : "Falha ao buscar codigo.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(APP_CONFIG.tokenKey);
    onLogout();
  }

  async function handleLogout() {
    try {
      await requestLogout(token);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        console.warn("Nao foi possivel invalidar o token no backend.", err);
      }
    } finally {
      logout();
    }
  }

  useEffect(() => {
    handleFetchEmailCode();
  }, []);

  useEffect(() => {
    if (!historyOpen) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHistoryOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  function openHistoryModal() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    window.setTimeout(() => {
      void loadHistory();
    }, 0);
  }

  async function copyHistoryCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 2000);
    } catch {
      showMessage("error", "Nao foi possivel copiar. Verifique as permissoes do navegador.");
    }
  }

  function closeHistoryModal() {
    setHistoryOpen(false);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ccfbf1,transparent_35%),linear-gradient(135deg,#f8fafc_0%,#eef2ff_52%,#ecfeff_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col justify-center">
        <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-2xl shadow-slate-300/60 backdrop-blur">
          <div className="grid lg:grid-cols-[1fr_340px]">
            <div className="p-5 sm:p-8 lg:p-10">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <AppHeader />

                <div className="flex shrink-0 gap-2">
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-800"
                    onClick={openHistoryModal}
                  >
                    Historico
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-red-700"
                    onClick={handleLogout}
                  >
                    Sair
                  </button>
                </div>
              </div>

              <div className="mt-8 space-y-5">
                <Alert type={messageType} message={message} />
                <CodeCard
                  codeData={codeData}
                  loading={loading}
                  onCopyError={(text) => showMessage("error", text)}
                />

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 font-semibold text-white shadow-lg shadow-cyan-700/20 transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-cyan-300"
                    onClick={handleFetchEmailCode}
                    disabled={loading}
                  >
                    {loading && <Spinner />}
                    {loading ? "Buscando..." : "Buscar no Gmail"}
                  </button>
                  <button
                    className="min-h-12 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:bg-slate-800"
                    onClick={openHistoryModal}
                  >
                    Ver ultimos codigos
                  </button>
                </div>
              </div>
            </div>

            <aside className="border-t border-slate-200 bg-slate-950 p-5 text-white sm:p-8 lg:border-l lg:border-t-0">
              <p className="text-sm font-semibold uppercase text-cyan-300">Resumo</p>
              <div className="mt-6">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-sm text-slate-300">Historico atualizado</p>
                  <p className="mt-2 text-base font-semibold">
                    {historyFetchedAt ? formatDateTime(historyFetchedAt) : "Ainda nao carregado"}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
          onClick={closeHistoryModal}
          role="presentation"
        >
          <div
            className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-modal-title"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="history-modal-title" className="text-xl font-bold text-slate-950">
                  Historico de codigos
                </h2>
              </div>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                onClick={closeHistoryModal}
              >
                Fechar
              </button>
            </div>

            <div
              className="max-h-[62vh] min-h-[220px] overflow-y-auto p-5"
              aria-busy={historyLoading}
            >
              {historyLoading ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center gap-5 rounded-2xl border border-slate-200 bg-slate-50 py-12">
                  <div
                    className="h-11 w-11 shrink-0 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-700"
                    role="status"
                    aria-label="Carregando historico"
                  />
                  <p className="text-base font-semibold text-slate-700">Carregando historico</p>
                </div>
              ) : history.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <p className="font-semibold text-slate-900">Nenhum codigo encontrado no Gmail.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((item, index) => (
                    <div
                      className="flex flex-row flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      key={item.code + item.receivedAt + index}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-2xl font-black text-slate-950 sm:text-3xl">{item.code}</p>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-900"
                            onClick={() => void copyHistoryCode(item.code)}
                          >
                            {copiedCode === item.code ? "Copiado" : "Copiar"}
                          </button>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">Recebido em {formatDateTime(item.receivedAt)}</p>
                      </div>
                      <span className="inline-flex w-fit shrink-0 rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold uppercase text-cyan-800">
                        #{index + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default Dashboard;
