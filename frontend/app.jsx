const { useState } = React;

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(window.APP_CONFIG.tokenKey));

  return token ? (
    <Dashboard token={token} onLogout={() => setToken(null)} />
  ) : (
    <LoginScreen onLogin={setToken} />
  );
}

window.App = App;
