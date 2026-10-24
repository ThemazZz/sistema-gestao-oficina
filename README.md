# Sistema de Gerenciamento de Oficina

Sistema web para controlar os serviços de uma oficina mecânica: cadastro de clientes e veículos, abertura de ordens de serviço (OS) e acompanhamento do andamento de cada uma em um quadro por status.

Foi pensado como **base white-label**: nada no código é amarrado a uma oficina específica, e o nome exibido na interface vem do cadastro da oficina no banco.

## Funcionalidades

- Cadastro de **clientes** (nome, celular, e-mail opcional)
- Cadastro de **veículos** (modelo e placa), vinculados a um cliente
- Catálogo de **serviços** com valor padrão
- **Ordens de serviço** com cliente, veículo, problema relatado, serviços solicitados e total
- Acompanhamento por status: *a iniciar*, *em andamento*, *aguardando peças* e *finalizado*, com a data de finalização registrada automaticamente
- **Várias oficinas** no mesmo sistema: cada oficina enxerga e altera apenas os próprios dados
- **Login** com senha criptografada e sessão por token; perfis *oficina* e *super admin* (painel do super admin em desenvolvimento)

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Banco de dados | PostgreSQL |
| Back-end | Node.js, Express, pg |
| Autenticação | bcryptjs (senhas) e jsonwebtoken (sessão) |
| Front-end | HTML, CSS e JavaScript puro |

## Estrutura do projeto

```
oficina/
├── backend/
│   ├── src/
│   │   ├── middleware/   (auth: confere o login e a oficina de quem acessa)
│   │   ├── routes/       (auth, clientes, veiculos, servicos, os)
│   │   ├── db.js         (conexão com o PostgreSQL)
│   │   └── server.js
│   ├── scripts/          (criar_usuario.js)
│   ├── env.example
│   └── package.json
├── frontend/
│   ├── css/
│   ├── js/               (auth.js = sessão e API, app.js = painel da oficina, login.js)
│   ├── index.html        (painel da oficina)
│   ├── login.html
│   └── admin.html        (painel do super admin, provisório)
├── database/
│   ├── schema_postgres.sql
│   └── migracao_01_multi_oficina.sql
└── README.md
```

## Modelo do banco

Tabelas: `oficinas`, `usuarios`, `clientes`, `veiculos`, `servicos`, `ordens_servico` e `os_servicos` (relação N:N entre OS e serviços, guardando o valor cobrado em cada OS).

Um cliente tem vários veículos, e um veículo tem várias OS. Cada OS pode ter vários serviços.

Clientes, veículos, serviços e OS pertencem a uma oficina (`oficina_id`). Um usuário é *super admin* (sem oficina) ou *oficina* (ligado a uma oficina). Placa e nome do serviço são únicos por oficina.

## Como rodar

**Pré-requisitos:** [Node.js](https://nodejs.org) (versão LTS) e [PostgreSQL](https://www.postgresql.org).

1. **Banco de dados:** crie um banco chamado `oficina` e execute, nesta ordem (pelo pgAdmin ou pelo `psql`):
   1. `database/schema_postgres.sql`
   2. `database/migracao_01_multi_oficina.sql`

2. **Back-end:**
   ```bash
   cd backend
   cp env.example .env     # no Windows: copy env.example .env
   ```
   Abra o `.env`, preencha a senha do seu PostgreSQL e o `JWT_SECRET` (gere um valor com o comando que está no próprio `env.example`). Depois:
   ```bash
   npm install
   node scripts/criar_usuario.js     # cria o seu login de super admin e o login do dono de cada oficina
   npm run dev
   ```
   A API sobe em `http://localhost:3000`.

3. **Front-end:** abra o arquivo `frontend/login.html` no navegador (ou use a extensão Live Server do VS Code) e entre com o usuário criado no passo anterior.

## Rotas da API

`POST /auth/login` é pública. **Todas as outras rotas exigem login**: envie o cabeçalho `Authorization: Bearer <token>`. As rotas de clientes, veículos, serviços e OS só funcionam para usuários de oficina e sempre trabalham apenas com os dados da oficina de quem está logado.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | Entra com `email` e `senha` e recebe o token |
| GET | `/auth/eu` | Dados de quem está logado (usuário e oficina) |
| GET / POST | `/clientes` | Lista e cadastra clientes |
| GET / PUT / DELETE | `/clientes/:id` | Busca, atualiza e exclui um cliente |
| GET / POST | `/veiculos` | Lista (aceita `?cliente_id=`) e cadastra veículos |
| GET / PUT / DELETE | `/veiculos/:id` | Busca, atualiza e exclui um veículo |
| GET / POST | `/servicos` | Lista e cadastra serviços |
| GET / PUT / DELETE | `/servicos/:id` | Busca, atualiza e exclui um serviço |
| GET | `/os` | Lista as OS (aceita `?status=em_andamento`) |
| GET | `/os/:id` | Comanda completa: cliente, veículo, serviços e total |
| POST | `/os` | Abre uma OS (pode já incluir `servicos: [1, 3]`) |
| PUT | `/os/:id` | Edita problema e observações |
| PATCH | `/os/:id/status` | Muda o andamento da OS |
| POST | `/os/:id/servicos` | Adiciona um serviço à OS |
| DELETE | `/os/:id/servicos/:servico_id` | Remove um serviço da OS |
| DELETE | `/os/:id` | Exclui a OS |

## Decisões técnicas

- Consultas SQL parametrizadas, para evitar SQL injection
- Transação (`BEGIN`/`COMMIT`/`ROLLBACK`) ao abrir uma OS com serviços, para não deixar dados pela metade
- Integridade garantida no banco: placa única por oficina, status restrito por `CHECK` e exclusões bloqueadas quando há registros vinculados
- Valor do serviço gravado na própria OS, para que mudanças no preço padrão não alterem o histórico
- Senhas guardadas apenas como hash (bcrypt); mensagem única para e-mail ou senha incorretos
- A oficina de quem acessa é lida do banco a cada requisição, nunca do que o navegador envia; bloquear uma oficina ou um usuário vale na hora
- O banco impede ligar dados de oficinas diferentes (chaves estrangeiras compostas com `oficina_id`)

## Próximos passos

- Rotas do super admin: cadastrar e bloquear oficinas, ver as OS em aberto de todas elas
- Painel admin completo (hoje `admin.html` é só uma página provisória)
- Edição de registros pela interface
- Vários usuários por oficina (a tabela `usuarios` já suporta)
- Limite de tentativas de login
- Módulos de estoque de peças, venda de itens e controle de gastos
