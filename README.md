# Acesso GPT

Aplicacao interna para cadastrar destinatarios e controlar quem esta aguardando
o proximo codigo recebido no Gmail.

## Como rodar localmente

Instale as dependencias:

```bash
npm install
```

Crie um arquivo `.env` com base no `.env.example` e preencha suas credenciais.

Crie as tabelas no PostgreSQL:

```bash
npm run db:migrate
```

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

Execute `npm run db:migrate` uma vez depois de criar ou atualizar o banco.

## Variaveis de ambiente

```env
APP_USER=
APP_PASSWORD=
DATABASE_URL=
DATABASE_SSL=false
REQUEST_TIMEOUT_MINUTES=5
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GMAIL_SENDER=
GMAIL_RECEIVER=
GMAIL_POLL_INTERVAL_SECONDS=10
GMAIL_CODE_LOOKBACK_MINUTES=5
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
```

Use `DATABASE_SSL=true` quando o provedor do PostgreSQL exigir SSL.

## Gpteco

O Gpteco e o assistente virtual flutuante da aplicacao. Ele usa um modelo Llama
pela API da Groq para responder duvidas gerais e ajudar com estudos, textos,
ideias, tecnologia e pequenos trechos de codigo.

O assistente:

- nao aceita nem envia anexos;
- envia para a Groq somente as mensagens digitadas no chat;
- mantem a chave da API exclusivamente no backend;
- guarda o historico apenas na memoria da pagina;
- limita cada conversa a 12 mensagens recentes;
- aceita no maximo 20 solicitacoes por minuto por endereco IP;
- nao possui acesso automatico a internet ou a informacoes em tempo real.

Crie uma chave em `https://console.groq.com/keys` e configure no `.env`:

```env
GROQ_API_KEY=sua_chave
GROQ_MODEL=llama-3.3-70b-versatile
```

Em uma hospedagem como Render ou Railway, configure essas duas variaveis no
painel do servico. Sem `GROQ_API_KEY`, o restante do aplicativo continua
funcionando e o Gpteco informa que precisa ser configurado.

## Banco de dados

As migrations criam estas tabelas:

- `app_users`: nomes, e-mails e fotos opcionais dos usuarios.
- `code_requests`: solicitacoes, expiracao e controle da vez exclusiva.
- `delivery_history`: resultado dos envios, sem armazenar o codigo.

Quando um usuario reserva a vez, o backend primeiro procura um codigo recebido
nos cinco minutos anteriores e, se nao encontrar um codigo disponivel, consulta
o Gmail a cada dez segundos durante no maximo cinco minutos. Sem solicitacao
ativa, o observador fica desligado. Cada mensagem do Gmail pode ser usada uma
unica vez e o codigo nao e armazenado no banco.

Para visualizar os usuarios, a solicitacao atual e as ultimas solicitacoes sem
instalar um aplicativo de banco:

```bash
npm run db:inspect
```

Para validar a autenticacao e as permissoes de leitura e envio do Gmail sem
enviar e-mail:

```bash
npm run gmail:check
```

## APIs da primeira etapa

- `GET /api/users`: lista nomes ativos sem expor e-mails.
- `POST /api/users`: cadastra nome e e-mail mediante confirmacao administrativa.
- `GET /api/users/:userId/avatar`: entrega a foto publica do usuario, quando existir.
- `GET /api/admin/users`: lista dados completos usando token administrativo.
- `PUT /api/admin/users/:userId`: altera nome, e-mail e foto usando token administrativo.
- `GET /api/requests/current`: informa quem esta aguardando.
- `POST /api/requests`: reserva a vez exclusiva por cinco minutos.
- `GET /api/requests/:requestId`: informa o resultado de uma solicitacao.
- `DELETE /api/requests/current`: cancela a solicitacao usando o token administrativo.
- `POST /api/assistant/chat`: envia o historico recente ao Gpteco e retorna a resposta.

## Observacoes de seguranca

Este projeto e um prototipo interno.

- Nao envie o arquivo `.env` para o GitHub.
- Nao coloque credenciais reais no frontend.
- O token de login e mantido em memoria e nao deve ser usado como autenticacao final de producao.
- O Gmail e acessado pelo backend usando OAuth.
- A chave da Groq e usada somente pelo backend e nao deve ser enviada ao frontend.
- Apenas nomes sao retornados na lista publica; os e-mails ficam no banco e no backend.
