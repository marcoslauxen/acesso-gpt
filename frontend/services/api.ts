export interface LoginResponse {
  token: string;
  message?: string;
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
