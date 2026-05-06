export interface LoginResponse {
  token: string;
  message?: string;
}

export interface CodeData {
  code?: string;
  receivedAt?: string;
  message?: string;
}

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || fallbackMessage);
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

export async function fetchEmailCode(token: string): Promise<CodeData> {
  const response = await fetch("/api/code/email", {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse<CodeData>(response, "Nao foi possivel buscar o codigo no Gmail.");
}
