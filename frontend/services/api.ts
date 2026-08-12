export interface LoginResponse {
  token: string;
  message?: string;
}

export interface AppUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface AdminUser extends AppUser {
  email: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RequestStatus = "waiting" | "processing" | "sent" | "expired" | "canceled" | "failed";

export interface CodeRequest {
  id: string;
  userId: string;
  userName: string;
  status?: RequestStatus;
  requestedAt: string;
  expiresAt: string;
  completedAt?: string | null;
}

export interface UsersResponse {
  users: AppUser[];
}

export interface RequestResponse {
  request: CodeRequest | null;
  message?: string;
}

export interface RequestHistoryEntry {
  userName: string;
  requestedAt: string;
}

export interface RequestHistoryResponse {
  requests: RequestHistoryEntry[];
}

export interface CreateUserInput {
  name: string;
  email: string;
  avatarDataUrl?: string;
  username: string;
  password: string;
}

export interface UpdateUserInput {
  name: string;
  email: string;
  avatarDataUrl?: string;
  removeAvatar?: boolean;
}

export interface CodeData {
  code?: string;
  receivedAt?: string;
  message?: string;
}

export interface CodeHistoryEntry {
  code: string;
  receivedAt: string;
}

export interface EmailCodeHistoryResponse {
  codes: CodeHistoryEntry[];
  message?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data.message || fallbackMessage, response.status);
  }

  return data as T;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  return parseResponse<LoginResponse>(response, "Nao foi possivel entrar.");
}

export async function logout(token: string): Promise<{ message?: string }> {
  const response = await fetch("/api/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse<{ message?: string }>(response, "Nao foi possivel sair.");
}

export async function fetchEmailCode(token: string): Promise<CodeData> {
  const response = await fetch("/api/code/email", {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse<CodeData>(response, "Nao foi possivel buscar o codigo no Gmail.");
}

export async function fetchEmailCodeHistory(token: string): Promise<EmailCodeHistoryResponse> {
  const response = await fetch("/api/code/email/history", {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse<EmailCodeHistoryResponse>(
    response,
    "Nao foi possivel carregar o historico do Gmail."
  );
}

export async function fetchUsers(): Promise<UsersResponse> {
  const response = await fetch("/api/users");
  return parseResponse<UsersResponse>(response, "Nao foi possivel carregar os usuarios.");
}

export async function fetchAdminUsers(token: string): Promise<{ users: AdminUser[] }> {
  const response = await fetch("/api/admin/users", {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse<{ users: AdminUser[] }>(
    response,
    "Nao foi possivel carregar os dados dos usuarios."
  );
}

export async function updateAdminUser(
  token: string,
  userId: string,
  input: UpdateUserInput
): Promise<{ user: AdminUser; message?: string }> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseResponse<{ user: AdminUser; message?: string }>(
    response,
    "Nao foi possivel atualizar o usuario."
  );
}

export async function deleteAdminUser(
  token: string,
  userId: string
): Promise<{ deletedUserId: string; message?: string }> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse<{ deletedUserId: string; message?: string }>(
    response,
    "Nao foi possivel excluir o usuario."
  );
}

export async function createUser(input: CreateUserInput): Promise<{ user: AppUser; message?: string }> {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse<{ user: AppUser; message?: string }>(
    response,
    "Nao foi possivel cadastrar o usuario."
  );
}

export async function fetchCurrentRequest(): Promise<RequestResponse> {
  const response = await fetch("/api/requests/current");
  return parseResponse<RequestResponse>(response, "Nao foi possivel consultar a vez atual.");
}

export async function fetchRequestHistory(): Promise<RequestHistoryResponse> {
  const response = await fetch("/api/requests/history?limit=10");
  return parseResponse<RequestHistoryResponse>(
    response,
    "Nao foi possivel carregar o historico de solicitacoes."
  );
}

export async function createCodeRequest(userId: string): Promise<RequestResponse> {
  const response = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  return parseResponse<RequestResponse>(response, "Nao foi possivel solicitar o codigo.");
}

export async function fetchRequest(requestId: string): Promise<RequestResponse> {
  const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}`);
  return parseResponse<RequestResponse>(response, "Nao foi possivel acompanhar a solicitacao.");
}
