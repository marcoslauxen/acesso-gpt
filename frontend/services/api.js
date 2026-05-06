async function parseResponse(response, fallbackMessage) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || fallbackMessage);
  }

  return data;
}

async function login(username, password) {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  return parseResponse(response, "Nao foi possivel entrar.");
}

async function fetchEmailCode(token) {
  const response = await fetch("/api/code/email", {
    headers: { Authorization: "Bearer " + token },
  });

  return parseResponse(response, "Nao foi possivel buscar o codigo no Gmail.");
}

window.api = {
  login,
  fetchEmailCode,
};
