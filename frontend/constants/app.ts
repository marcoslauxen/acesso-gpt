interface AppConfig {
  appName: string;
  title: string;
  description: string;
  tokenKey: string;
}
export const APP_CONFIG: AppConfig = {
  appName: "Acesso OpenAI",
  title: "Painel de Acesso OpenAI",
  description: "Consulte de forma rápida o último código de acesso autorizado.",
  tokenKey: "acesso-openai-token",
};
