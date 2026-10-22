# Sistema de Gerenciamento de Oficina

Sistema web para controlar os serviços de uma oficina mecânica: cadastro de clientes e veículos, abertura de ordens de serviço (OS) e acompanhamento do andamento de cada uma em um quadro por status.

Foi pensado como **base white-label**: nada no código é amarrado a uma oficina específica, e o nome exibido na interface é configurável em um único lugar.

## Funcionalidades

- Cadastro de **clientes** (nome, celular, e-mail opcional)
- Cadastro de **veículos** (modelo e placa), vinculados a um cliente
- Catálogo de **serviços** com valor padrão
- **Ordens de serviço** com cliente, veículo, problema relatado, serviços solicitados e total
- Acompanhamento por status: *a iniciar*, *em andamento*, *aguardando peças* e *finalizado*, com a data de finalização registrada automaticamente

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Banco de dados | PostgreSQL |
| Back-end | Node.js, Express, pg |
| Front-end | HTML, CSS e JavaScript puro |

## Estrutura do projeto

```
oficina/
├── backend/
│   ├── src/
│   │   ├── routes/       (clientes, veiculos, servicos, os)
│   │   ├── db.js         (conexão com o PostgreSQL)
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── css/
│   ├── js/
│   └── index.html
├── database/
│   └── schema_postgres.sql
└── README.md
```

## Modelo do banco

Tabelas: `clientes`, `veiculos`, `servicos`, `ordens_servico` e `os_servicos` (relação N:N entre OS e serviços, guardando o valor cobrado em cada OS).

Um cliente tem vários veículos, e um veículo tem várias OS. Cada OS pode ter vários serviços.

## Como rodar

**Pré-requisitos:** [Node.js](https://nodejs.org) (versão LTS) e [PostgreSQL](https://www.postgresql.org).

1. **Banco de dados:** crie um banco chamado `oficina` e execute o arquivo `database/schema_postgres.sql` (pelo pgAdmin ou pelo `psql`).

2. **Back-end:**
   ```bash
   cd backend
   cp .env.example .env     # no Windows: copy .env.example .env
   ```
   Abra o `.env` e preencha a senha do seu PostgreSQL. Depois:
   ```bash
   npm install
   npm run dev
   ```
   A API sobe em `http://localhost:3000`.

3. **Front-end:** abra o arquivo `frontend/index.html` no navegador (ou use a extensão Live Server do VS Code).

## Rotas da API

| Método | Rota | Descrição |
|---|---|---|
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
- Integridade garantida no banco: placa única, status restrito por `CHECK` e exclusões bloqueadas quando há registros vinculados
- Valor do serviço gravado na própria OS, para que mudanças no preço padrão não alterem o histórico

## Próximos passos

- Edição de registros pela interface
- Login e controle de acesso
- Tabela `oficinas` para suportar várias oficinas (white-label completo)
- Módulos de estoque de peças, venda de itens e controle de gastos
