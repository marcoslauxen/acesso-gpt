interface AppConfig {
  appName: string;
  title: string;
  description: string;
  tokenKey: string;
  requestKey: string;
}
export const APP_CONFIG: AppConfig = {
  appName: "Acesso OpenAI",
  title: "Receba seu codigo por e-mail",
  description: "Selecione seu nome e aguarde. Assim que um novo codigo chegar, enviaremos para o seu e-mail cadastrado.",
  tokenKey: "acesso-openai-token",
  requestKey: "acesso-openai-request-id",
};
