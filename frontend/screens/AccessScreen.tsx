import React from "react";
import { useEffect, useMemo, useState } from "react";
import Alert from "../components/Alert";
import { EyeIcon, EyeOffIcon } from "../components/EyeIcons";
import Spinner from "../components/Spinner";
import { APP_CONFIG } from "../constants/app";
import {
  ApiError,
  createCodeRequest,
  createUser,
  deleteAdminUser,
  fetchAdminUsers,
  fetchCurrentRequest,
  fetchRequest,
  fetchRequestHistory,
  fetchUsers,
  login as adminLogin,
  logout as adminLogout,
  updateAdminUser,
  type AdminUser,
  type AppUser,
  type CodeRequest,
  type RequestHistoryEntry,
  type RequestStatus,
} from "../services/api";
import { prepareAvatar } from "../utils/avatar";

type MessageType = "error" | "success" | "info";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  selected?: boolean;
  className?: string;
}

function Avatar({ name, avatarUrl, className = "h-11 w-11" }: AvatarProps) {
  const styles = `${className} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#e9eee4] text-sm font-extrabold text-[#17483f]`;

  if (avatarUrl) {
    return <img className={`${styles} object-cover`} src={avatarUrl} alt={`Foto de ${name}`} />;
  }

  return <span className={styles}>{getInitials(name)}</span>;
}

function formatRemaining(expiresAt?: string, now = Date.now()) {
  if (!expiresAt) {
    return "00:00";
  }

  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const minutesPart = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secondsPart = (seconds % 60).toString().padStart(2, "0");
  return `${minutesPart}:${secondsPart}`;
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

function statusMessage(status?: RequestStatus) {
  switch (status) {
    case "sent":
      return { type: "success" as const, text: "Codigo enviado! Confira a caixa de entrada do seu e-mail." };
    case "expired":
      return { type: "error" as const, text: "Nenhum codigo disponivel foi encontrado em 5 minutos. Solicite novamente quando precisar." };
    case "failed":
      return { type: "error" as const, text: "Encontramos o codigo, mas nao foi possivel enviar o e-mail. Tente novamente." };
    case "canceled":
      return { type: "info" as const, text: "A solicitacao foi cancelada." };
    default:
      return null;
  }
}

function AccessScreen() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [currentRequest, setCurrentRequest] = useState<CodeRequest | null>(null);
  const [ownRequestId, setOwnRequestId] = useState(() => localStorage.getItem(APP_CONFIG.requestKey) || "");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("info");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const selectedUser = users.find((user) => user.id === selectedUserId) || null;
  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedQuery) return users;
    return users.filter((user) => user.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
  }, [query, users]);
  const requestActive = Boolean(currentRequest);
  const selectedUserWaiting = currentRequest?.userId === selectedUserId;

  function showMessage(type: MessageType, text: string) {
    setMessageType(type);
    setMessage(text);
  }

  async function loadUsers() {
    const data = await fetchUsers();
    setUsers(data.users);
  }

  async function loadCurrentRequest() {
    const data = await fetchCurrentRequest();
    setCurrentRequest(data.request);
  }

  async function loadPage() {
    try {
      await Promise.all([loadUsers(), loadCurrentRequest()]);
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Nao foi possivel carregar o aplicativo.");
    } finally {
      setLoading(false);
    }
  }

  async function monitorOwnRequest(requestId: string) {
    try {
      const data = await fetchRequest(requestId);
      const finalMessage = statusMessage(data.request?.status);

      if (finalMessage) {
        showMessage(finalMessage.type, finalMessage.text);
        localStorage.removeItem(APP_CONFIG.requestKey);
        setOwnRequestId("");
        await loadCurrentRequest();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        localStorage.removeItem(APP_CONFIG.requestKey);
        setOwnRequestId("");
        return;
      }
      console.warn("Nao foi possivel acompanhar a solicitacao.", err);
    }
  }

  async function handleRequest() {
    if (!selectedUser) {
      showMessage("error", "Selecione seu nome antes de solicitar.");
      return;
    }

    setRequesting(true);
    setMessage("");

    try {
      const data = await createCodeRequest(selectedUser.id);
      if (data.request) {
        localStorage.setItem(APP_CONFIG.requestKey, data.request.id);
        setOwnRequestId(data.request.id);
        setCurrentRequest(data.request);
      }
      showMessage("info", data.message || "Procurando um codigo recente ou aguardando um novo.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await loadCurrentRequest();
      }
      showMessage("error", err instanceof Error ? err.message : "Nao foi possivel solicitar o codigo.");
    } finally {
      setRequesting(false);
    }
  }

  function handleRegistered(user: AppUser, text: string) {
    setUsers((current) => [...current, user].sort((left, right) => left.name.localeCompare(right.name, "pt-BR")));
    setSelectedUserId(user.id);
    setRegisterOpen(false);
    showMessage("success", text);
  }

  function handleUpdated(user: AppUser, text: string) {
    setUsers((current) =>
      current
        .map((item) => (item.id === user.id ? user : item))
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
    );
    showMessage("success", text);
  }

  function handleDeleted(userId: string, text: string) {
    setUsers((current) => current.filter((user) => user.id !== userId));
    setSelectedUserId((current) => (current === userId ? "" : current));

    if (currentRequest?.userId === userId) {
      setCurrentRequest(null);
      localStorage.removeItem(APP_CONFIG.requestKey);
      setOwnRequestId("");
    }

    showMessage("success", text);
  }

  useEffect(() => {
    void loadPage();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadCurrentRequest().catch((err) => {
        console.warn("Nao foi possivel atualizar a vez atual.", err);
      });
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!ownRequestId) return;
    void monitorOwnRequest(ownRequestId);
    const interval = window.setInterval(() => void monitorOwnRequest(ownRequestId), 3000);
    return () => window.clearInterval(interval);
  }, [ownRequestId]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#f1f4e9] text-[#153f36]">
      <section className="border-b border-[#dddcd2] bg-[#f8f7ef] text-[#153f36]">
        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex flex-col gap-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-[#b7f50d] p-2 shadow-lg shadow-black/10">
                <img src="/assets/app-logo.png" alt="" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-base font-extrabold tracking-tight">{APP_CONFIG.appName}</p>
                <p className="text-xs text-[#6c8079]">Central de códigos</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
              <button
                type="button"
                className="rounded-full border border-[#d5d8cd] px-3 py-2.5 text-xs font-bold text-[#31584d] transition hover:border-[#a9b6a6] hover:bg-white sm:px-5 sm:text-sm"
                onClick={() => setHistoryOpen(true)}
              >
                Histórico
              </button>
              <button
                type="button"
                className="rounded-full border border-[#d5d8cd] px-3 py-2.5 text-xs font-bold text-[#31584d] transition hover:border-[#a9b6a6] hover:bg-white sm:px-5 sm:text-sm"
                onClick={() => setManageOpen(true)}
              >
                Usuários
              </button>
              <button
                type="button"
                className="rounded-full bg-[#153f36] px-3 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#21584c] sm:px-5 sm:text-sm"
                onClick={() => setRegisterOpen(true)}
              >
                + Cadastrar
              </button>
            </div>
          </nav>

        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-[32px] bg-white p-5 shadow-[0_24px_70px_rgba(21,63,54,0.08)] sm:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#578077]">Quem vai receber?</p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-[#153f36]">Escolha seu nome</h2>
                <p className="mt-2 text-sm text-[#6d817a]">O e-mail cadastrado permanece sempre privado.</p>
              </div>
              <label className="relative block md:w-72">
                <span className="sr-only">Buscar nome</span>
                <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#769087]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.2-3.2" />
                </svg>
                <input
                  className="w-full rounded-2xl border border-[#dce3d8] bg-[#f5f7f1] py-3.5 pl-12 pr-4 text-sm font-semibold text-[#153f36] outline-none transition placeholder:text-[#92a199] focus:border-[#8dbe16] focus:bg-white focus:ring-4 focus:ring-[#b7f50d]/20"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar usuário..."
                />
              </label>
            </div>

            <div className="mt-7">
              {loading ? (
                <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl bg-[#f5f7f1] text-[#688078]">
                  <Spinner className="h-5 w-5 border-[#2a5b50]" />
                  <span className="font-bold">Carregando usuários...</span>
                </div>
              ) : users.length === 0 ? (
                <div className="min-h-72 rounded-3xl border border-dashed border-[#b9c8bc] bg-[#f5f7f1] p-10 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#b7f50d] text-2xl font-black text-[#153f36]">+</div>
                  <h3 className="mt-5 text-xl font-extrabold text-[#153f36]">Nenhum usuário cadastrado</h3>
                  <p className="mt-2 text-sm text-[#71837d]">Cadastre o primeiro usuário para começar.</p>
                  <button type="button" className="mt-6 rounded-full bg-[#153f36] px-6 py-3 text-sm font-extrabold text-white transition hover:bg-[#21584c]" onClick={() => setRegisterOpen(true)}>
                    Cadastrar usuário
                  </button>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#b9c8bc] bg-[#f5f7f1] p-10 text-center text-sm font-bold text-[#688078]">
                  Nenhum nome encontrado.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredUsers.map((user) => {
                    const selected = user.id === selectedUserId;
                    const waiting = user.id === currentRequest?.userId;
                    return (
                      <button
                        type="button"
                        key={user.id}
                        className={`group relative flex min-h-24 items-center gap-3 rounded-2xl border p-4 text-left transition duration-200 ${
                          selected
                            ? "border-[#153f36] bg-[#153f36] text-white shadow-lg shadow-[#153f36]/15"
                            : "border-[#e0e5dc] bg-[#f8f9f5] text-[#153f36] hover:-translate-y-0.5 hover:border-[#9bbd64] hover:bg-white hover:shadow-md"
                        }`}
                        onClick={() => setSelectedUserId((current) => (current === user.id ? "" : user.id))}
                      >
                        <Avatar name={user.name} avatarUrl={user.avatarUrl} selected={selected} className="h-12 w-12" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-extrabold">{user.name}</span>
                          <span className={`mt-1 block text-xs font-bold ${waiting ? "text-[#b7f50d]" : selected ? "text-white/55" : "text-[#87978f]"}`}>
                            {waiting ? "Código solicitado" : selected ? "Perfil selecionado" : "Selecionar perfil"}
                          </span>
                        </span>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black ${selected ? "border-[#b7f50d] bg-[#b7f50d] text-[#153f36]" : "border-[#cdd7ce] text-transparent group-hover:border-[#8eac65]"}`}>
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-7 rounded-3xl bg-[#f3f6ed] p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#72877f]">Selecionado</p>
                  <p className="mt-1 truncate text-lg font-extrabold text-[#153f36]">{selectedUser?.name || "Nenhum perfil"}</p>
                </div>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-[#b7f50d] px-7 py-4 text-sm font-extrabold text-[#153f36] shadow-lg shadow-[#7ca800]/15 transition hover:bg-[#c9ff30] disabled:cursor-not-allowed disabled:bg-[#dce3d7] disabled:text-[#8b9b94] disabled:shadow-none sm:w-auto"
                  disabled={!selectedUser || requesting || requestActive}
                  onClick={() => void handleRequest()}
                >
                  {requesting && <Spinner className="h-5 w-5 border-[#153f36]" />}
                  {requesting
                    ? "Solicitando..."
                    : requestActive
                      ? selectedUserWaiting
                        ? "Procurando código"
                        : `${currentRequest?.userName} está na vez`
                      : selectedUser
                        ? "Enviar código por e-mail"
                        : "Selecione seu nome"}
                  {!requesting && <span aria-hidden="true">→</span>}
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="relative overflow-hidden rounded-[32px] bg-[#153f36] p-6 text-white shadow-[0_24px_70px_rgba(21,63,54,0.16)] sm:p-7">
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border border-[#b7f50d]/20" />
              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/50">Status agora</p>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ${currentRequest ? "bg-amber-300/15 text-amber-200" : "bg-[#b7f50d] text-[#153f36]"}`}>
                    <span className={`h-2 w-2 rounded-full ${currentRequest ? "animate-pulse bg-amber-300" : "bg-[#153f36]"}`} />
                    {currentRequest ? "Em andamento" : "Disponível"}
                  </span>
                </div>

                {currentRequest ? (
                  <div className="mt-7">
                    <p className="text-sm font-bold text-white/55">Vez reservada para</p>
                    <p className="mt-1.5 text-2xl font-extrabold tracking-[-0.035em]">{currentRequest.userName}</p>
                    <p className="mt-1.5 text-sm leading-5 text-white/55">
                      {currentRequest.status === "processing" ? "O código está sendo enviado por e-mail." : "Estamos procurando o código mais recente."}
                    </p>
                    <div className="mt-5 flex items-center justify-between gap-4 rounded-3xl bg-white/[0.07] px-5 py-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-white/45">Tempo restante</p>
                      <p className="font-mono text-3xl font-black tracking-tight text-[#b7f50d]">{formatRemaining(currentRequest.expiresAt, now)}</p>
                    </div>
                    {currentRequest.userId !== selectedUserId && (
                      <p className="mt-5 text-xs leading-5 text-white/45">Quando esta solicitação terminar, outro usuário poderá pedir o próximo código.</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-9">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#b7f50d] text-2xl font-black text-[#153f36]">✓</div>
                    <p className="mt-6 text-3xl font-extrabold leading-tight tracking-[-0.035em]">Tudo livre por aqui.</p>
                    <p className="mt-3 text-sm leading-6 text-white/55">Escolha seu nome para reservar a próxima entrega por até 5 minutos.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[32px] border border-[#dce4d8] bg-[#e5f1d1] p-6 sm:p-7">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#567164]">Passo a passo</p>
              <div className="mt-5 space-y-4">
                {[
                  "Solicite o código por e-mail no ChatGPT.",
                  "Escolha seu nome na lista ao lado.",
                  "Envie e acompanhe o status em tempo real.",
                  "Confira seu e-mail pessoal.",
                ].map((step, index) => (
                  <div className="flex gap-3" key={step}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#153f36] text-xs font-black text-[#b7f50d]">{index + 1}</span>
                    <p className="pt-1 text-sm font-bold leading-5 text-[#31584d]">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      {message && (
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-full">
          <div className="pointer-events-auto shadow-xl shadow-[#153f36]/10">
            <Alert type={messageType} message={message} />
          </div>
        </div>
      )}

      {historyOpen && <RequestHistoryModal onClose={() => setHistoryOpen(false)} />}
      {registerOpen && (
        <RegisterModal
          onClose={() => setRegisterOpen(false)}
          onRegistered={handleRegistered}
        />
      )}
      {manageOpen && (
        <ManageUsersModal
          onClose={() => setManageOpen(false)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </main>
  );
}

interface RequestHistoryModalProps {
  onClose: () => void;
}

function RequestHistoryModal({ onClose }: RequestHistoryModalProps) {
  const [requests, setRequests] = useState<RequestHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void fetchRequestHistory()
      .then((data) => {
        if (active) setRequests(data.requests);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Nao foi possivel carregar o historico.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#082d27]/80 px-4 py-6 backdrop-blur-md"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[32px] bg-[#f5f7f1] shadow-2xl shadow-black/30"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-history-title"
      >
        <div className="flex items-start justify-between gap-4 bg-[#153f36] px-5 py-6 text-white sm:px-7">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#b7f50d]">Histórico</p>
            <h2 id="request-history-title" className="mt-2 text-2xl font-extrabold tracking-tight">
              Últimas solicitações
            </h2>
            <p className="mt-1 text-sm text-white/55">Somente o usuário e a data são exibidos.</p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full border border-white/15 px-4 py-2.5 text-sm font-extrabold text-white/75 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>

        <div className="max-h-[62vh] min-h-64 overflow-y-auto p-5 sm:p-7" aria-live="polite">
          {loading ? (
            <div className="flex min-h-52 items-center justify-center gap-3 rounded-3xl bg-[#e9eee4] text-[#597168]">
              <Spinner className="h-5 w-5 border-[#153f36]" />
              <span className="font-bold">Carregando histórico...</span>
            </div>
          ) : error ? (
            <Alert type="error" message={error} />
          ) : requests.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#b9c8bc] bg-[#e9eee4] p-8 text-center">
              <p className="font-bold text-[#153f36]">Nenhuma solicitação registrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((item, index) => (
                <div
                  className="flex items-center justify-between gap-4 rounded-2xl border border-[#dce4d8] bg-white p-4 transition hover:border-[#9ab36a]"
                  key={`${item.userName}-${item.requestedAt}-${index}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-extrabold text-[#153f36]">{item.userName}</p>
                    <time className="mt-1 block text-sm font-semibold text-[#789087]" dateTime={item.requestedAt}>
                      {formatDateTime(item.requestedAt)}
                    </time>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#b7f50d] text-sm font-black text-[#153f36]">
                    {index + 1}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface RegisterModalProps {
  onClose: () => void;
  onRegistered: (user: AppUser, message: string) => void;
}

function RegisterModal({ onClose, onRegistered }: RegisterModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAvatarFile(file?: File) {
    if (!file) return;

    try {
      setError("");
      setAvatarDataUrl(await prepareAvatar(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel preparar a foto.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await createUser({ name, email, avatarDataUrl: avatarDataUrl || undefined, username, password });
      onRegistered(data.user, data.message || `${data.user.name} foi cadastrado com sucesso.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel cadastrar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#082d27]/80 px-4 py-6 backdrop-blur-md" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[32px] bg-[#f7f8f3] p-5 shadow-2xl shadow-black/30 sm:p-7" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="register-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#638076]">Novo cadastro</p>
            <h2 id="register-title" className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-[#153f36]">Cadastrar usuário</h2>
            <p className="mt-2 text-sm leading-6 text-[#6e837b]">O e-mail será usado somente para enviar o código solicitado.</p>
          </div>
          <button type="button" className="rounded-full border border-[#d8e0d5] bg-white px-4 py-2.5 text-sm font-extrabold text-[#5f746c] transition hover:border-[#9db276] hover:text-[#153f36]" onClick={onClose}>Fechar</button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Alert type="error" message={error} />
          <div className="flex items-center gap-4 rounded-3xl border border-[#dce4d8] bg-[#e9eee4] p-4">
            <Avatar name={name || "Novo usuário"} avatarUrl={avatarDataUrl} className="h-16 w-16" />
            <div className="min-w-0 flex-1">
              <label className="inline-flex cursor-pointer rounded-full border border-[#c9d4ca] bg-white px-4 py-2.5 text-sm font-extrabold text-[#31584d] transition hover:border-[#91ad60]">
                Escolher foto
                <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleAvatarFile(event.target.files?.[0])} />
              </label>
              <p className="mt-2 text-xs text-[#71867e]">Opcional. JPG, PNG ou WebP.</p>
            </div>
            {avatarDataUrl && (
              <button type="button" className="text-xs font-bold text-red-600 hover:text-red-800" onClick={() => setAvatarDataUrl("")}>Remover</button>
            )}
          </div>
          <label className="block">
            <span className="text-sm font-extrabold text-[#31584d]">Nome</span>
            <input className="mt-2 w-full rounded-2xl border border-[#d5ded4] bg-white px-4 py-3.5 text-[#153f36] outline-none transition focus:border-[#8dae35] focus:ring-4 focus:ring-[#b7f50d]/20" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome que aparecerá na lista" autoComplete="name" required />
          </label>
          <label className="block">
            <span className="text-sm font-extrabold text-[#31584d]">E-mail pessoal</span>
            <input className="mt-2 w-full rounded-2xl border border-[#d5ded4] bg-white px-4 py-3.5 text-[#153f36] outline-none transition focus:border-[#8dae35] focus:ring-4 focus:ring-[#b7f50d]/20" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@exemplo.com" autoComplete="email" required />
          </label>

          <div className="rounded-3xl bg-[#153f36] p-5 text-white">
            <p className="text-sm font-extrabold">Confirmação administrativa</p>
            <p className="mt-1 text-xs leading-5 text-white/50">Necessária somente para salvar um novo cadastro.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold text-white/70">Usuário</span>
                <input className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none transition focus:border-[#b7f50d] focus:ring-4 focus:ring-[#b7f50d]/15" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-white/70">Senha</span>
                <span className="relative mt-2 block">
                  <input className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 pr-12 text-white outline-none transition focus:border-[#b7f50d] focus:ring-4 focus:ring-[#b7f50d]/15" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-white/55 hover:bg-white/10 hover:text-white" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}>
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </span>
              </label>
            </div>
          </div>

          <button type="submit" disabled={loading} className="flex min-h-[54px] w-full items-center justify-center gap-3 rounded-full bg-[#b7f50d] px-6 py-4 font-extrabold text-[#153f36] transition hover:bg-[#c9ff30] disabled:cursor-not-allowed disabled:bg-[#dce3d7] disabled:text-[#8b9b94]">
            {loading && <Spinner className="h-5 w-5 border-[#153f36]" />}
            {loading ? "Salvando..." : "Salvar cadastro"}
          </button>
        </form>
      </div>
    </div>
  );
}

interface ManageUsersModalProps {
  onClose: () => void;
  onUpdated: (user: AppUser, message: string) => void;
  onDeleted: (userId: string, message: string) => void;
}

function ManageUsersModal({ onClose, onUpdated, onDeleted }: ManageUsersModalProps) {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedUser = users.find((user) => user.id === selectedId) || null;
  const avatarPreview = removeAvatar ? "" : avatarDataUrl || selectedUser?.avatarUrl || "";

  function selectUser(user: AdminUser) {
    setSelectedId(user.id);
    setName(user.name);
    setEmail(user.email);
    setAvatarDataUrl("");
    setRemoveAvatar(false);
    setError("");
    setMessage("");
    setConfirmingDelete(false);
  }

  async function closeModal() {
    if (token) {
      try {
        await adminLogout(token);
      } catch {
        // O token administrativo tambem expira quando o servidor reinicia.
      }
    }
    onClose();
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const loginData = await adminLogin(username, password);
      const data = await fetchAdminUsers(loginData.token);
      setToken(loginData.token);
      setUsers(data.users);
      setUsername("");
      setPassword("");
      if (data.users[0]) selectUser(data.users[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAvatarFile(file?: File) {
    if (!file) return;

    try {
      setError("");
      setAvatarDataUrl(await prepareAvatar(file));
      setRemoveAvatar(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel preparar a foto.");
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await updateAdminUser(token, selectedUser.id, {
        name,
        email,
        avatarDataUrl: avatarDataUrl || undefined,
        removeAvatar,
      });
      setUsers((current) =>
        current
          .map((user) => (user.id === data.user.id ? data.user : user))
          .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
      );
      selectUser(data.user);
      setMessage(data.message || "Dados atualizados com sucesso.");
      onUpdated(data.user, data.message || "Dados atualizados com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel atualizar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!selectedUser || !confirmingDelete) return;

    const deletedUser = selectedUser;
    setDeleting(true);
    setError("");
    setMessage("");

    try {
      const data = await deleteAdminUser(token, deletedUser.id);
      const remainingUsers = users.filter((user) => user.id !== deletedUser.id);

      setUsers(remainingUsers);
      setConfirmingDelete(false);

      if (remainingUsers[0]) {
        selectUser(remainingUsers[0]);
      } else {
        setSelectedId("");
        setName("");
        setEmail("");
        setAvatarDataUrl("");
        setRemoveAvatar(false);
      }

      onDeleted(
        data.deletedUserId,
        data.message || `${deletedUser.name} foi excluido com sucesso.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel excluir o usuario.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (confirmingDelete && !deleting) {
        setConfirmingDelete(false);
        return;
      }

      if (!deleting) void closeModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [token, confirmingDelete, deleting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#082d27]/80 px-4 py-6 backdrop-blur-md" onClick={() => void closeModal()}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-[#f7f8f3] p-5 shadow-2xl shadow-black/30 sm:p-7" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="manage-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#638076]">Área protegida</p>
            <h2 id="manage-title" className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-[#153f36]">Gerenciar usuários</h2>
            <p className="mt-2 text-sm text-[#6e837b]">Confirme o acesso administrativo para visualizar e editar os dados.</p>
          </div>
          <button type="button" className="rounded-full border border-[#d8e0d5] bg-white px-4 py-2.5 text-sm font-extrabold text-[#5f746c] transition hover:border-[#9db276] hover:text-[#153f36]" onClick={() => void closeModal()}>Fechar</button>
        </div>

        {!token ? (
          <form className="mx-auto mt-8 max-w-xl space-y-5 rounded-[28px] bg-[#e9eee4] p-5 sm:p-7" onSubmit={handleLogin}>
            <Alert type="error" message={error} />
            <label className="block">
              <span className="text-sm font-extrabold text-[#31584d]">Usuário administrativo</span>
              <input className="mt-2 w-full rounded-2xl border border-[#d2dcd1] bg-white px-4 py-3.5 text-[#153f36] outline-none transition focus:border-[#8dae35] focus:ring-4 focus:ring-[#b7f50d]/20" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
            </label>
            <label className="block">
              <span className="text-sm font-extrabold text-[#31584d]">Senha administrativa</span>
              <span className="relative mt-2 block">
                <input className="w-full rounded-2xl border border-[#d2dcd1] bg-white px-4 py-3.5 pr-12 text-[#153f36] outline-none transition focus:border-[#8dae35] focus:ring-4 focus:ring-[#b7f50d]/20" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-[#74887f] hover:bg-[#edf2e9] hover:text-[#153f36]" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}>
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </span>
            </label>
            <button type="submit" disabled={loading} className="flex min-h-[54px] w-full items-center justify-center gap-3 rounded-full bg-[#153f36] px-6 py-4 font-extrabold text-white transition hover:bg-[#21584c] disabled:bg-[#cfd8ce] disabled:text-[#8a9a93]">
              {loading && <Spinner className="h-5 w-5 border-[#b7f50d]" />}
              {loading ? "Confirmando..." : "Visualizar dados"}
            </button>
          </form>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-[240px_1fr]">
            <div className="max-h-[58vh] space-y-2 overflow-y-auto rounded-[28px] bg-[#e9eee4] p-3">
              {users.length === 0 && (
                <p className="px-3 py-8 text-center text-sm font-bold leading-6 text-[#71867e]">Nenhum usuário cadastrado.</p>
              )}
              {users.map((user) => (
                <button key={user.id} type="button" className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedId === user.id ? "border-[#153f36] bg-[#153f36] text-white shadow-md" : "border-transparent bg-white text-[#153f36] hover:border-[#9db276]"}`} onClick={() => selectUser(user)}>
                  <Avatar name={user.name} avatarUrl={user.avatarUrl} selected={selectedId === user.id} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold">{user.name}</span>
                    <span className={`block truncate text-xs ${selectedId === user.id ? "text-white/50" : "text-[#74887f]"}`}>{user.email}</span>
                  </span>
                </button>
              ))}
            </div>

            {selectedUser && (
              <form className="space-y-5 rounded-[28px] border border-[#dce4d8] bg-white p-5 sm:p-6" onSubmit={handleSave}>
                <Alert type="error" message={error} />
                <Alert type="success" message={message} />
                <div className="flex flex-wrap items-center gap-4">
                  <Avatar name={name || selectedUser.name} avatarUrl={avatarPreview} className="h-20 w-20" />
                  <label className="cursor-pointer rounded-full border border-[#ccd7cc] bg-[#f5f7f1] px-4 py-2.5 text-sm font-extrabold text-[#31584d] transition hover:border-[#91ad60]">
                    Trocar foto
                    <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleAvatarFile(event.target.files?.[0])} />
                  </label>
                  {avatarPreview && (
                    <button type="button" className="text-sm font-bold text-red-600" onClick={() => { setAvatarDataUrl(""); setRemoveAvatar(true); }}>Remover foto</button>
                  )}
                </div>
                <label className="block">
                  <span className="text-sm font-extrabold text-[#31584d]">Nome</span>
                  <input className="mt-2 w-full rounded-2xl border border-[#d5ded4] bg-[#f8f9f5] px-4 py-3.5 text-[#153f36] outline-none transition focus:border-[#8dae35] focus:bg-white focus:ring-4 focus:ring-[#b7f50d]/20" value={name} onChange={(event) => setName(event.target.value)} required />
                </label>
                <label className="block">
                  <span className="text-sm font-extrabold text-[#31584d]">E-mail</span>
                  <input className="mt-2 w-full rounded-2xl border border-[#d5ded4] bg-[#f8f9f5] px-4 py-3.5 text-[#153f36] outline-none transition focus:border-[#8dae35] focus:bg-white focus:ring-4 focus:ring-[#b7f50d]/20" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </label>
                <button type="submit" disabled={loading || deleting} className="flex min-h-[54px] w-full items-center justify-center gap-3 rounded-full bg-[#b7f50d] px-6 py-4 font-extrabold text-[#153f36] transition hover:bg-[#c9ff30] disabled:bg-[#dce3d7] disabled:text-[#8b9b94]">
                  {loading && <Spinner className="h-5 w-5 border-[#153f36]" />}
                  {loading ? "Salvando..." : "Salvar alterações"}
                </button>
                <button
                  type="button"
                  disabled={loading || deleting}
                  className="flex min-h-[52px] w-full items-center justify-center rounded-full border border-red-200 bg-red-50 px-6 py-3.5 font-extrabold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setConfirmingDelete(true);
                    setError("");
                    setMessage("");
                  }}
                >
                  Excluir usuário
                </button>

                {confirmingDelete && (
                  <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-[#082d27]/60 px-4 py-6 backdrop-blur-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!deleting) setConfirmingDelete(false);
                    }}
                  >
                    <div
                      className="w-full max-w-md rounded-[28px] border border-[#dce4d8] bg-[#fdfefa] p-6 shadow-2xl shadow-black/30 sm:p-7"
                      role="alertdialog"
                      aria-modal="true"
                      aria-labelledby="delete-user-title"
                      aria-describedby="delete-user-description"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-start gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff0ec] text-xl font-black text-[#b54235]" aria-hidden="true">!</span>
                        <div>
                          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#b54235]">Excluir usuário</p>
                          <p id="delete-user-title" className="mt-1.5 text-xl font-extrabold leading-7 text-[#153f36]">Tem certeza que deseja excluir {selectedUser.name}?</p>
                        </div>
                      </div>
                      <p id="delete-user-description" className="mt-4 text-sm leading-6 text-[#62776f]">O usuário será removido das listas e uma solicitação em andamento será cancelada. O histórico anterior será preservado.</p>
                      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={deleting}
                          className="rounded-full border border-[#ccd7cc] bg-white px-5 py-3 text-sm font-extrabold text-[#31584d] transition hover:border-[#9db276] hover:bg-[#f3f6ed] disabled:opacity-50"
                          onClick={() => setConfirmingDelete(false)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={deleting}
                          className="flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-[#b54235] px-5 py-3 text-sm font-extrabold text-white shadow-md shadow-[#b54235]/15 transition hover:bg-[#96362d] disabled:bg-[#d9aaa5] disabled:shadow-none"
                          onClick={() => void handleDelete()}
                        >
                          {deleting && <Spinner className="h-4 w-4 border-white" />}
                          {deleting ? "Excluindo..." : "Confirmar exclusão"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AccessScreen;
