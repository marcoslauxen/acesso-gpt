import React from "react";
import { useState } from "react";
import Dashboard from "./screens/Dashboard";
import LoginScreen from "./screens/LoginScreen";
import { APP_CONFIG } from "./constants/app";

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(APP_CONFIG.tokenKey));

  return token ? (
    <Dashboard token={token} onLogout={() => setToken(null)} />
  ) : (
    <LoginScreen onLogin={setToken} />
  );
}

export default App;
