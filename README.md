# Acesso GPT

Painel interno simples para consultar o ultimo codigo de acesso recebido no Gmail.

## Estrutura

```text
backend/server.js    API em Node.js + Express
frontend/index.html  Pagina principal
frontend/app.jsx     Componente principal React
frontend/main.jsx    Renderizacao do React
frontend/components  Componentes reutilizaveis
frontend/screens     Telas da aplicacao
frontend/services    Chamadas para a API
frontend/constants   Configuracoes de exibicao
server.js            Entrada usada pelo npm start/Render
```

## Como rodar localmente

Instale as dependencias:

```bash
npm install
```

Crie um arquivo `.env` com base no `.env.example` e preencha suas credenciais.

Inicie o servidor:

```bash
npm start
```

Acesse:

```text
http://localhost:3000
```

## Publicacao

Em plataformas como Render ou Railway, configure:

```text
Build Command: npm install
Start Command: npm start
```

Depois cadastre as mesmas variaveis de ambiente do `.env.example` no painel da hospedagem.

## Variaveis de ambiente

```env
APP_USER=
APP_PASSWORD=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
```

## Observacoes de seguranca

Este projeto e um prototipo interno.

- Nao envie o arquivo `.env` para o GitHub.
- Nao coloque credenciais reais no frontend.
- O token de login e mantido em memoria e nao deve ser usado como autenticacao final de producao.
- O Gmail e acessado pelo backend usando OAuth.
