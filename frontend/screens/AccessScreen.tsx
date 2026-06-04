import React from "react";
import { useEffect, useMemo, useState } from "react";
import Alert from "../components/Alert";
import AppHeader from "../components/AppHeader";
import { EyeIcon, EyeOffIcon } from "../components/EyeIcons";
import Spinner from "../components/Spinner";
import { APP_CONFIG } from "../constants/app";
import {
  ApiError,
  createCodeRequest,
  createUser,
  fetchAdminUsers,
  fetchCurrentRequest,
  fetchRequest,
  fetchUsers,
  login as adminLogin,
  logout as adminLogout,
  updateAdminUser,
  type AdminUser,
  type AppUser,
  type CodeRequest,
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

function Avatar({ name, avatarUrl, selected = false, className = "h-11 w-11" }: AvatarProps) {
  const styles = `${className} flex shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-black ${
    selected ? "bg-cyan-700 text-white" : "bg-slate-100 text-slate-700"
  }`;

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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#cffafe,transparent_32%),radial-gradient(circle_at_bottom_right,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc_0%,#eef2ff_52%,#ecfeff_100%)] px-4 py-5 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-6xl">
        <header className="flex flex-col gap-5 rounded-3xl border border-white/80 bg-white/75 p-5 shadow-xl shadow-slate-300/40 backdrop-blur sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <AppHeader />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-800"
              onClick={() => setManageOpen(true)}
            >
              Gerenciar pessoas
            </button>
            <button
              type="button"
              className="shrink-0 rounded-xl border border-cyan-200 bg-cyan-50 px-5 py-3 text-sm font-bold text-cyan-900 transition hover:border-cyan-400 hover:bg-cyan-100"
              onClick={() => setRegisterOpen(true)}
            >
              Cadastrar pessoa
            </button>
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
          <section className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-300/40 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Passo 1</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Selecione seu nome</h2>
                <p className="mt-1 text-sm text-slate-500">Seu e-mail nunca aparece nesta lista.</p>
              </div>
              <label className="block sm:w-64">
                <span className="sr-only">Buscar nome</span>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar nome..."
                />
              </label>
            </div>

            <div className="mt-6">
              {loading ? (
                <div className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
                  <Spinner className="h-5 w-5 border-cyan-700" />
                  <span className="font-semibold">Carregando pessoas...</span>
                </div>
              ) : users.length === 0 ? (
                <div className="min-h-64 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-100 text-xl font-black text-cyan-800">+</div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">Nenhuma pessoa cadastrada</h3>
                  <p className="mt-2 text-sm text-slate-500">Cadastre a primeira pessoa para começar.</p>
                  <button
                    type="button"
                    className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
                    onClick={() => setRegisterOpen(true)}
                  >
                    Cadastrar pessoa
                  </button>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-600">
                  Nenhum nome encontrado.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredUsers.map((user) => {
                    const selected = user.id === selectedUserId;
                    const waiting = user.id === currentRequest?.userId;
                    return (
                      <button
                        type="button"
                        key={user.id}
                        className={`relative flex min-h-24 items-center gap-3 rounded-2xl border p-4 text-left transition ${
                          selected
                            ? "border-cyan-500 bg-cyan-50 ring-4 ring-cyan-100"
                            : "border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/40"
                        }`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <Avatar name={user.name} avatarUrl={user.avatarUrl} selected={selected} />
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-slate-950">{user.name}</span>
                          <span className={`mt-1 block text-xs font-semibold ${waiting ? "text-amber-700" : "text-slate-400"}`}>
                            {waiting ? "Aguardando codigo" : selected ? "Selecionado" : "Selecionar"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
              <Alert type={messageType} message={message} />
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-cyan-700 px-5 py-4 text-base font-black text-white shadow-lg shadow-cyan-700/20 transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                disabled={!selectedUser || requesting || requestActive}
                onClick={() => void handleRequest()}
              >
                {requesting && <Spinner />}
                {requesting
                  ? "Solicitando..."
                  : requestActive
                    ? selectedUserWaiting
                      ? "Procurando codigo"
                      : `${currentRequest?.userName} esta na vez`
                    : selectedUser
                      ? `Enviar codigo para ${selectedUser.name}`
                      : "Selecione seu nome"}
              </button>
            </div>
          </section>

          <aside className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-400/30 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Status agora</p>
            {currentRequest ? (
              <div className="mt-6">
                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-5">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-300" />
                    </span>
                    <span className="text-sm font-bold text-amber-100">
                      {currentRequest.status === "processing" ? "Enviando por e-mail" : "Procurando codigo"}
                    </span>
                  </div>
                  <p className="mt-5 text-2xl font-black">{currentRequest.userName}</p>
                  <p className="mt-1 text-sm text-slate-300">esta na vez no momento.</p>
                  <div className="mt-5 rounded-xl bg-slate-950/50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Tempo restante</p>
                    <p className="mt-1 font-mono text-3xl font-black text-white">
                      {formatRemaining(currentRequest.expiresAt, now)}
                    </p>
                  </div>
                </div>
                {currentRequest.userId !== selectedUserId && (
                  <p className="mt-4 text-sm leading-6 text-slate-400">
                    Quando esta solicitação terminar, outra pessoa poderá pedir o próximo código.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-emerald-300" />
                  <span className="text-sm font-bold text-emerald-100">Disponível</span>
                </div>
                <p className="mt-5 text-2xl font-black">Ninguém está aguardando</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">Selecione seu nome para reservar a vez por até 5 minutos.</p>
              </div>
            )}

            <div className="mt-6 space-y-3 border-t border-white/10 pt-6 text-sm text-slate-300">
              <p><strong className="text-white">1.</strong> No ChatGPT, solicite o código por e-mail.</p>
              <p><strong className="text-white">2.</strong> Selecione seu nome aqui.</p>
              <p><strong className="text-white">3.</strong> Clique em enviar código.</p>
              <p><strong className="text-white">4.</strong> Confira seu e-mail pessoal.</p>
            </div>
          </aside>
        </div>
      </section>

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
        />
      )}
    </main>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="register-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Novo cadastro</p>
            <h2 id="register-title" className="mt-2 text-2xl font-black text-slate-950">Cadastrar pessoa</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">O e-mail será usado somente para enviar o código solicitado.</p>
          </div>
          <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100" onClick={onClose}>Fechar</button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Alert type="error" message={error} />
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Avatar name={name || "Nova pessoa"} avatarUrl={avatarDataUrl} className="h-16 w-16" />
            <div className="min-w-0 flex-1">
              <label className="inline-flex cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-800">
                Escolher foto
                <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleAvatarFile(event.target.files?.[0])} />
              </label>
              <p className="mt-2 text-xs text-slate-500">Opcional. JPG, PNG ou WebP.</p>
            </div>
            {avatarDataUrl && (
              <button type="button" className="text-xs font-bold text-red-600 hover:text-red-800" onClick={() => setAvatarDataUrl("")}>Remover</button>
            )}
          </div>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Nome</span>
            <input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome que aparecerá na lista" autoComplete="name" required />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">E-mail pessoal</span>
            <input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@exemplo.com" autoComplete="email" required />
          </label>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-950">Confirmação administrativa</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">Necessária somente para salvar um novo cadastro.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Usuário</span>
                <input className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Senha</span>
                <span className="relative mt-2 block">
                  <input className="w-full rounded-xl border border-amber-200 bg-white px-4 py-3 pr-12 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}>
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </span>
              </label>
            </div>
          </div>

          <button type="submit" disabled={loading} className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-slate-950 px-5 py-3.5 font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
            {loading && <Spinner />}
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
}

function ManageUsersModal({ onClose, onUpdated }: ManageUsersModalProps) {
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") void closeModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [token]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-4 py-6 backdrop-blur-sm" onClick={() => void closeModal()}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="manage-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Área protegida</p>
            <h2 id="manage-title" className="mt-2 text-2xl font-black text-slate-950">Gerenciar pessoas</h2>
            <p className="mt-2 text-sm text-slate-500">Confirme o acesso administrativo para visualizar e editar os dados.</p>
          </div>
          <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100" onClick={() => void closeModal()}>Fechar</button>
        </div>

        {!token ? (
          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <Alert type="error" message={error} />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Usuário administrativo</span>
              <input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Senha administrativa</span>
              <span className="relative mt-2 block">
                <input className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}>
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </span>
            </label>
            <button type="submit" disabled={loading} className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-slate-950 px-5 py-3.5 font-black text-white transition hover:bg-slate-800 disabled:bg-slate-300">
              {loading && <Spinner />}
              {loading ? "Confirmando..." : "Visualizar dados"}
            </button>
          </form>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              {users.map((user) => (
                <button key={user.id} type="button" className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selectedId === user.id ? "border-cyan-500 bg-cyan-50" : "border-slate-200 hover:border-cyan-300"}`} onClick={() => selectUser(user)}>
                  <Avatar name={user.name} avatarUrl={user.avatarUrl} selected={selectedId === user.id} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">{user.name}</span>
                    <span className="block truncate text-xs text-slate-500">{user.email}</span>
                  </span>
                </button>
              ))}
            </div>

            {selectedUser && (
              <form className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4" onSubmit={handleSave}>
                <Alert type="error" message={error} />
                <Alert type="success" message={message} />
                <div className="flex flex-wrap items-center gap-4">
                  <Avatar name={name || selectedUser.name} avatarUrl={avatarPreview} className="h-20 w-20" />
                  <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-cyan-400">
                    Trocar foto
                    <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleAvatarFile(event.target.files?.[0])} />
                  </label>
                  {avatarPreview && (
                    <button type="button" className="text-sm font-bold text-red-600" onClick={() => { setAvatarDataUrl(""); setRemoveAvatar(true); }}>Remover foto</button>
                  )}
                </div>
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">Nome</span>
                  <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={name} onChange={(event) => setName(event.target.value)} required />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">E-mail</span>
                  <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </label>
                <button type="submit" disabled={loading} className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-cyan-700 px-5 py-3.5 font-black text-white transition hover:bg-cyan-800 disabled:bg-slate-300">
                  {loading && <Spinner />}
                  {loading ? "Salvando..." : "Salvar alterações"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AccessScreen;
