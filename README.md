# NeWave

Aplicativo web para acompanhamento de treinos de natação. Reúne o planejamento dos treinos, o registro de tempos e o desempenho do atleta em um só lugar.

## Funcionalidades

- Cadastro, login, logout e "esqueci a senha" com backend próprio (senha com hash, sessão por cookie)
- Treinos organizados por etapa: aquecimento, série principal, velocidade e soltura
- Periodização, volume e intensidade
- Carrossel na Home só com os próximos treinos: o treino de hoje (ou o próximo) fica em destaque, com o botão "Concluir treino"
- Dashboard com gráfico da evolução dos tempos (a partir dos testes registrados) e histórico de treinos (os concluídos e os que passaram da data), que abrem numa janela flutuante
- Feedback com os mesmos treinos do histórico, com busca pelo título ou pela data
- Botão "Gerar treinos": na primeira vez faz a anamnese do atleta (experiência, rotina, piscina, material, lesões e tempo nos 400 m), que fica guardada; toda vez pergunta a prova alvo da preparação (continuar a atual, escolher do calendário, cadastrar uma nova ou treinar sem prova) e mostra um resumo para conferir. Ao confirmar, gera os treinos das próximas duas semanas (primeira versão do gerador, em `server/generator.js`)
- Nível do atleta calculado a partir das respostas (não é perguntado)
- Perfil com o bloco "Meu treino" (preparação atual, nível e respostas, com edição), próxima competição, dados pessoais, pagamentos e suporte

## Tecnologias

- React 19
- Vite
- React Router
- CSS Modules
- Backend em Node.js puro (`http`, `crypto` e `sqlite` nativos, sem dependências extras)

## Como rodar

Pré-requisito: Node.js **22.13 ou mais novo** (confira com `node -v`).

```bash
npm install
```

O app precisa de dois processos rodando ao mesmo tempo, cada um em um terminal:

```bash
npm run server   # backend (API) em http://127.0.0.1:3001
npm run dev      # front-end em http://localhost:5173
```

Abra `http://localhost:5173`. O Vite repassa as chamadas `/api` para o backend automaticamente.

Outros comandos:

```bash
npm run build    # gera a versão de produção
npm run preview  # testa a versão de produção localmente
npm run lint     # verifica o código com o ESLint
npm run test:server  # roda os testes do backend
npm run seed -- seu@email.com  # coloca testes e treinos de exemplo nessa conta
```

## App no celular (versão 0.2)

**Versões** (o número aparece no Perfil, em Suporte):
- **0.2:** entrar com o Google; Perfil funcional (números reais, dados pessoais, trocar/criar senha, suporte, excluir conta); ver a senha (olho) e o caractere digitado aparece por 1 segundo; biblioteca de técnica; notação do treinador (a/c, D de descanso); logo nova; regras novas de descanso e A3.
- **0.1:** telas para celular e app instalável (PWA).

Para lançar uma versão nova: mude `version` no `package.json` e o `CACHE` em `public/sw.js` (ex.: `newave-v0.3.0`). Quem já instalou recebe a versão nova ao abrir o app com internet.


O NeWave funciona no celular de dois jeitos:

- **No navegador do celular:** as telas se ajustam à largura (até 768 px). Em cima fica um cabeçalho com a logo e o "Gerar treinos"; embaixo, um menu fixo (Início, Perfil, Treinos, Desempenho, Glossário, Sair), e as janelas abrem em tela cheia.
- **Instalado como aplicativo (PWA):** depois de publicado o site (com HTTPS), o atleta abre o endereço no celular e instala:
  - **Android (Chrome):** menu ⋮ → "Instalar app" (ou "Adicionar à tela inicial").
  - **iPhone (Safari):** botão Compartilhar → "Adicionar à Tela de Início".

  O NeWave ganha o ícone do nadador na tela inicial e abre em tela cheia, sem a barra do navegador. Sem internet, ele abre a última versão guardada; os treinos e tempos sempre vêm do servidor.

Arquivos: `public/manifest.webmanifest` (nome, cores e ícones), `public/sw.js` (service worker, só na versão publicada) e `public/icons/`. Para testar a versão publicada localmente: `npm run build && npm run preview` (com o backend rodando).

## Documentos de referência

- [`docs/tabela-de-percentuais.md`](docs/tabela-de-percentuais.md): tabela do treinador com os tempos de treino em cada porcentagem (100% a 60%) a partir do melhor tempo. Guardada para usar quando o atleta registrar testes de 50, 100 ou 200 m.
- [`server/series/LEIAME.md`](server/series/LEIAME.md): como cadastrar séries e as regras de montagem dos treinos.

## Estrutura

```
src/
├── Pages/        # telas (Login, Home, Training, Performance, Profile...)
├── components/   # componentes reutilizáveis
├── hooks/        # hooks, como o useAuth
├── contexts/     # AuthProvider (usuário logado compartilhado pelo app)
├── services/     # api.js, que conversa com o backend
├── utils/        # formatação de datas e tempos
├── router/       # configuração de rotas
└── assets/       # imagens e ícones

server/
├── index.js      # inicia o servidor
├── app.js        # rotas de autenticação e roteador
├── http.js       # funções HTTP comuns (JSON, cookies, erros)
├── swimming.js   # rotas de testes e treinos (agendados e realizados)
├── athlete.js    # anamnese, nível, calendário de competições e prova alvo
├── generator.js  # gerador de treinos (primeira versão)
├── series/       # biblioteca de séries (um JSON por parte do treino); guia em series/LEIAME.md
├── seed.js       # dados de exemplo (npm run seed)
├── db.js         # banco SQLite e tabelas
├── security.js   # hash de senha, tokens e limite de tentativas
├── mailer.js     # envio de email (por enquanto só imprime no terminal)
├── app.test.js   # testes de autenticação
├── swimming.test.js  # testes de testes/treinos
├── athlete.test.js   # testes da anamnese, competições e preparação
├── series.test.js    # conferência da biblioteca de séries
├── regras.test.js    # regras de montagem
└── generator.test.js # gerador de treinos
```

## Entrar com o Google

O login e o cadastro têm o botão oficial **"Continuar com o Google"**. Ele só aparece quando o servidor tem a variável `GOOGLE_CLIENT_ID`. Para criar (grátis, uma vez só):

1. Entre em [console.cloud.google.com](https://console.cloud.google.com/) com a conta Google do NeWave e crie um projeto (ex.: "NeWave").
2. **APIs e serviços → Tela de permissão OAuth**: tipo **Externo**, nome do app "NeWave", e-mail de suporte e logo (opcional). Salve e publique.
3. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**: tipo **Aplicativo da Web**.
4. Em **Origens JavaScript autorizadas**, coloque os endereços do app: `http://localhost:5173` (desenvolvimento) e o endereço publicado (ex.: `https://app.newave.com.br`). Não precisa de URI de redirecionamento.
5. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e coloque na variável `GOOGLE_CLIENT_ID` do servidor. Ele não é segredo, mas fica fora do código.

Como funciona: o botão do Google entrega ao navegador um token assinado; o servidor (`server/google.js`) confere a assinatura com as chaves públicas do Google, se o token é para o NeWave, a validade e se o e-mail foi verificado. Conta nova é criada na hora (sem senha: no Perfil dá para **criar uma senha** e entrar também com o e-mail). Se já existe uma conta com o mesmo e-mail, ela é ligada à conta Google. Quem não tem senha exclui a conta escrevendo **EXCLUIR**.

## Perfil (conta)

- **Treinos realizados e sequência sem falhar:** calculados pelos treinos do atleta. A sequência conta, do mais recente para trás, os treinos feitos; para na primeira falta ou no primeiro treino que passou da data sem resposta (o de hoje ainda não feito não quebra).
- **Dados pessoais:** nome, telefone (com DDD) e data de nascimento editáveis; o email é o do login. **Trocar senha** pede a senha atual e encerra as outras sessões abertas.
- **Suporte:** "Entre em contato" guarda a mensagem (e manda para `SUPPORT_EMAIL`, se configurado). **Excluir conta** pede a senha e apaga a conta e tudo dela (treinos, testes, provas, respostas).
- **Pagamentos:** por enquanto o app é gratuito; quando houver planos, a escolha e o pagamento entram aqui.
- Backend: `server/account.js` (rotas `GET/PATCH/DELETE /api/account`, `POST /api/account/password`, `POST /api/support`).

## Rotas

| Rota | Descrição |
| --- | --- |
| `/` e `/auth/login` | Login |
| `/auth/register` | Cadastro |
| `/auth/logout` | Saída |
| `/auth/forgot-password` | Pedir o link de nova senha |
| `/auth/reset-password?token=...` | Escolher a nova senha (link enviado por email) |
| `/page/home` | Início (protegida) |
| `/page/training` | Treinos (protegida) |
| `/page/performance` | Desempenho (protegida) |
| `/page/profile` | Perfil (protegida) |

## Backend e autenticação

A API fica em `server/` e guarda os dados em um banco SQLite (`server/data/newave.db`, criado sozinho na primeira execução e ignorado pelo Git).

| Método e rota | O que faz |
| --- | --- |
| `POST /api/auth/register` | Cria a conta (`name`, `email`, `password`) |
| `POST /api/auth/login` | Entra (`email`, `password`, `remember` opcional) |
| `POST /api/auth/logout` | Encerra a sessão |
| `GET /api/auth/me` | Devolve o usuário logado, ou 401 |
| `POST /api/auth/forgot-password` | Pede o link para criar nova senha (`email`) |
| `POST /api/auth/reset-password` | Troca a senha usando o link (`token`, `password`) |
| `GET /api/tests` | Testes de tempo do usuário logado |
| `POST /api/tests` | Registra um teste (`distance`, `timeHundredths`, `date`) |
| `DELETE /api/tests/:id` | Apaga um teste |
| `GET /api/trainings?limit=10&today=AAAA-MM-DD` | Histórico: treinos concluídos e os que passaram da data (`completed: false`), do mais recente |
| `GET /api/trainings/upcoming?today=AAAA-MM-DD` | Próximos treinos (de hoje em diante, não concluídos), do mais próximo |
| `POST /api/trainings` | Registra um treino realizado (`date`, `title`, `warmUp`, `speed`, `mainSeries`, `release`, `notes`); com `planned: true`, agenda um treino (até um ano à frente) |
| `POST /api/trainings/:id/complete` | Marca um treino agendado como concluído |
| `GET /api/athlete-profile` | Anamnese do atleta (ou `null`), tempo nos 400 m e nível calculado |
| `PUT /api/athlete-profile` | Salva ou atualiza a anamnese |
| `GET /api/competitions?today=AAAA-MM-DD` | Calendário: competições de hoje em diante |
| `POST /api/competitions` | Cadastra competição (`name`, `date`, `modality`, `distance`, `stroke`, `goalHundredths` (meta, opcional), `priority` A/B/C) |
| `GET /api/preparations/current?today=AAAA-MM-DD` | Preparação atual (objetivo, prova alvo, `model` e se o Específico pode: `especifico`) |
| `PATCH /api/preparations/current` | Troca o modelo de treino (`model`: `geral` ou `especifico`) e refaz os treinos que ainda não foram feitos |
| `POST /api/trainings/generate?today=AAAA-MM-DD` | Gera os treinos das próximas duas semanas e substitui os agendados que não foram feitos |
| `POST /api/preparations` | Nova preparação: `goal` e `competitionId` (prova do calendário) ou `competition` (prova nova), e `model` (`geral` ou `especifico`) |

As rotas de testes e treinos exigem login, e cada usuário só vê e altera os próprios dados. O tempo é guardado em centésimos de segundo (5'32"45 = `33245`). O `today` é a data de hoje no aparelho do atleta, para o "hoje" não mudar por causa do fuso; sem ele, vale a data do servidor (UTC).

Como a segurança funciona:

- A senha é guardada com hash `scrypt` e salt aleatório, nunca em texto puro.
- O login cria uma sessão e envia um cookie `HttpOnly` com `SameSite=Lax`, que o JavaScript do navegador não consegue ler. No banco fica só o hash do token.
- O logout apaga a sessão no servidor, então o cookie antigo deixa de valer.
- Sem "Lembrar-me", o cookie some quando o navegador fecha (e a sessão vale no máximo 1 dia). Com "Lembrar-me", vale 30 dias.
- Há limite de tentativas: 10 senhas erradas por email e IP a cada 15 minutos, e 10 cadastros por hora por IP.
- Email inexistente e senha errada dão a mesma mensagem, para não revelar quem tem conta.

"Esqueci a senha":

- O pedido responde sempre a mesma coisa, exista conta ou não, então ninguém descobre quem está cadastrado.
- O link vale por 1 hora, só funciona uma vez, e um pedido novo invalida o anterior. No banco fica só o hash do token.
- Ao trocar a senha, todas as sessões abertas da conta são derrubadas (se alguém tinha acesso, perde).
- Há limite de pedidos: 3 por email e 10 por IP a cada hora, e 10 links inválidos por IP a cada 15 minutos.
- Uma senha fraca não gasta o link; a pessoa corrige e tenta de novo.

Variáveis de ambiente (todas opcionais): `PORT` (padrão 3001), `HOST` (padrão 127.0.0.1), `DATABASE_PATH`, `APP_URL` (endereço do front-end usado no link do email, padrão `http://localhost:5173`), `SUPPORT_EMAIL` (para onde vão as mensagens do "Entre em contato" do Perfil; sem ele, elas ficam guardadas na tabela `support_messages`), `GOOGLE_CLIENT_ID` ("Entrar com o Google"; sem ele, o botão não aparece) e `NODE_ENV=production` (liga o cookie `Secure`, que exige HTTPS).

### Vendo o Dashboard com dados

Crie uma conta no app e rode `npm run seed -- seu@email.com` (com o email dessa conta). Isso coloca alguns testes, treinos realizados, treinos agendados, a anamnese e duas competições de exemplo, para ver o carrossel, o gráfico, o histórico e o Perfil preenchidos. Para testar a anamnese desde o início, use uma conta sem `seed`. Testes também podem ser registrados pelo próprio app, no botão "+ Teste".

O botão "Gerar treinos" faz a anamnese, salva a prova alvo e gera os treinos das próximas duas semanas. É a **primeira versão** do gerador: o tempo de cada série, a divisão do tempo entre as partes e o descanso usado ainda são estimativas (marcadas como PROVISÓRIO em `server/generator.js`), e a intensidade e as fases da temporada ainda não entram. Concluir um treino já dá para fazer pelo carrossel da Home.

### Testando "esqueci a senha" na sua máquina

O projeto ainda **não envia emails de verdade**. Em desenvolvimento, o "email" aparece no terminal onde o `npm run server` está rodando, com o link pronto para copiar e abrir no navegador. Para testar: clique em "Esqueci a senha" no login, informe o email de uma conta existente e procure o link no terminal do servidor.

### Antes de publicar na internet

- Sirva o front-end e a API no mesmo domínio e use HTTPS.
- O limite de tentativas usa o IP da conexão. Atrás de um proxy (Nginx, Vercel, etc.) todos pareceriam o mesmo IP, então ele precisa ser ajustado.
- Configurar um provedor de email de verdade. Hoje `server/mailer.js` só imprime o email no terminal (e, em produção, não envia nada). Para enviar, crie outro mailer com o mesmo formato (`async send({ to, subject, text })`) usando o serviço que preferir (Resend, SendGrid, SMTP...) e passe em `createApp({ mailer })`, em `server/index.js`.
- Ainda não existe confirmação de email no cadastro.
