import React from "react";
import { useEffect, useState } from "react";
import Alert from "../components/Alert";
import AppHeader from "../components/AppHeader";
import CodeCard from "../components/CodeCard";
import Spinner from "../components/Spinner";
import { APP_CONFIG } from "../constants/app";
import { fetchEmailCode, type CodeData } from "../services/api";

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

function Dashboard({ token, onLogout }: DashboardProps) {
  const [codeData, setCodeData] = useState<CodeData | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("success");
  const [loading, setLoading] = useState(false);

  function showMessage(type: "error" | "success", text: string) {
    setMessageType(type);
    setMessage(text);
  }

  async function handleFetchEmailCode() {
    setLoading(true);
    setMessage("");

    try {
      const data = await fetchEmailCode(token);
      setCodeData(data.code ? data : null);
      showMessage("success", data.message || "Codigo do Gmail encontrado com sucesso.");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Falha ao buscar codigo.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(APP_CONFIG.tokenKey);
    onLogout();
  }

  useEffect(() => {
    handleFetchEmailCode();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl shadow-slate-200 sm:p-8">
        <AppHeader />

        <div className="mt-8 space-y-5">
          <Alert type={messageType} message={message} />
          <CodeCard codeData={codeData} loading={loading} />

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
              onClick={handleFetchEmailCode}
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

export default Dashboard;
