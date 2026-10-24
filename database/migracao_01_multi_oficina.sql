-- =====================================================
-- MIGRAÇÃO 01: suporte a várias oficinas (multi-oficina) + login
-- Banco: PostgreSQL  |  Rodar no pgAdmin: Query Tool dentro do banco "oficina"
--
-- QUANDO RODAR: depois do schema_postgres.sql (ou em cima do banco que
-- você já usa). Rode UMA vez só.
--
-- O que faz:
--   1. Cria as tabelas "oficinas" e "usuarios"
--   2. Coloca "oficina_id" em clientes, veiculos, servicos e ordens_servico
--   3. Cria a oficina "Oficina do Tião" e move TODOS os dados atuais para ela
--   4. Placa e nome do serviço passam a ser únicos POR OFICINA
--   5. Impede, no próprio banco, ligar dados de oficinas diferentes
--      (ex.: um veículo da oficina A apontando para um cliente da oficina B)
--
-- Tudo roda dentro de uma transação: se algo falhar, nada é alterado.
-- Se der erro no pgAdmin, rode:  ROLLBACK;  e me mande a mensagem.
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- OFICINAS (cada cliente do seu sistema white-label)
-- -----------------------------------------------------
CREATE TABLE oficinas (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(120) NOT NULL,
    ativa       BOOLEAN NOT NULL DEFAULT TRUE,      -- FALSE = oficina bloqueada
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------
-- USUÁRIOS (login)
--   papel 'super_admin' -> só você, sem oficina (oficina_id NULL)
--   papel 'oficina'     -> dono/funcionário de UMA oficina
-- -----------------------------------------------------
CREATE TABLE usuarios (
    id          SERIAL PRIMARY KEY,
    oficina_id  INTEGER REFERENCES oficinas(id) ON DELETE CASCADE,
    nome        VARCHAR(120) NOT NULL,
    email       VARCHAR(120) NOT NULL,
    senha_hash  TEXT NOT NULL,                      -- nunca guardamos a senha pura
    papel       VARCHAR(20) NOT NULL CHECK (papel IN ('super_admin', 'oficina')),
    ativo       BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (
        (papel = 'super_admin' AND oficina_id IS NULL) OR
        (papel = 'oficina'     AND oficina_id IS NOT NULL)
    )
);

-- e-mail único, sem diferenciar maiúscula de minúscula
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (LOWER(email));

-- -----------------------------------------------------
-- OFICINA PADRÃO: recebe tudo que já existe hoje
-- (o nome é o mesmo que estava no frontend/js/app.js)
-- -----------------------------------------------------
INSERT INTO oficinas (nome) VALUES ('Oficina do Tião');

-- -----------------------------------------------------
-- oficina_id nas tabelas (primeiro aceita NULL, preenche, depois exige)
-- -----------------------------------------------------
ALTER TABLE clientes        ADD COLUMN oficina_id INTEGER REFERENCES oficinas(id) ON DELETE RESTRICT;
ALTER TABLE veiculos        ADD COLUMN oficina_id INTEGER REFERENCES oficinas(id) ON DELETE RESTRICT;
ALTER TABLE servicos        ADD COLUMN oficina_id INTEGER REFERENCES oficinas(id) ON DELETE RESTRICT;
ALTER TABLE ordens_servico  ADD COLUMN oficina_id INTEGER REFERENCES oficinas(id) ON DELETE RESTRICT;

UPDATE clientes        SET oficina_id = (SELECT MIN(id) FROM oficinas);
UPDATE veiculos        SET oficina_id = (SELECT MIN(id) FROM oficinas);
UPDATE servicos        SET oficina_id = (SELECT MIN(id) FROM oficinas);
UPDATE ordens_servico  SET oficina_id = (SELECT MIN(id) FROM oficinas);

ALTER TABLE clientes        ALTER COLUMN oficina_id SET NOT NULL;
ALTER TABLE veiculos        ALTER COLUMN oficina_id SET NOT NULL;
ALTER TABLE servicos        ALTER COLUMN oficina_id SET NOT NULL;
ALTER TABLE ordens_servico  ALTER COLUMN oficina_id SET NOT NULL;

-- -----------------------------------------------------
-- Placa e nome do serviço: únicos POR OFICINA (antes eram únicos no sistema todo)
-- -----------------------------------------------------
ALTER TABLE veiculos DROP CONSTRAINT IF EXISTS veiculos_placa_key;
ALTER TABLE servicos DROP CONSTRAINT IF EXISTS servicos_nome_key;
ALTER TABLE veiculos ADD CONSTRAINT veiculos_oficina_placa_key UNIQUE (oficina_id, placa);
ALTER TABLE servicos ADD CONSTRAINT servicos_oficina_nome_key  UNIQUE (oficina_id, nome);

-- -----------------------------------------------------
-- Trava de segurança no banco: as ligações precisam ser da MESMA oficina.
-- Os erros continuam sendo o código 23503 (chave estrangeira), então as
-- mensagens "Cliente não existe" / "Veículo não existe" da API seguem valendo.
-- -----------------------------------------------------
ALTER TABLE clientes ADD CONSTRAINT clientes_id_oficina_key UNIQUE (id, oficina_id);
ALTER TABLE veiculos ADD CONSTRAINT veiculos_id_oficina_key UNIQUE (id, oficina_id);

ALTER TABLE veiculos DROP CONSTRAINT IF EXISTS veiculos_cliente_id_fkey;
ALTER TABLE veiculos ADD CONSTRAINT veiculos_cliente_oficina_fkey
    FOREIGN KEY (cliente_id, oficina_id) REFERENCES clientes (id, oficina_id) ON DELETE RESTRICT;

ALTER TABLE ordens_servico DROP CONSTRAINT IF EXISTS ordens_servico_veiculo_id_fkey;
ALTER TABLE ordens_servico ADD CONSTRAINT os_veiculo_oficina_fkey
    FOREIGN KEY (veiculo_id, oficina_id) REFERENCES veiculos (id, oficina_id) ON DELETE RESTRICT;

-- -----------------------------------------------------
-- Índices para as buscas por oficina
-- -----------------------------------------------------
CREATE INDEX idx_clientes_oficina ON clientes(oficina_id);
CREATE INDEX idx_veiculos_oficina ON veiculos(oficina_id);
CREATE INDEX idx_servicos_oficina ON servicos(oficina_id);
CREATE INDEX idx_os_oficina       ON ordens_servico(oficina_id);
CREATE INDEX idx_usuarios_oficina ON usuarios(oficina_id);

COMMIT;

-- =====================================================
-- CONFERÊNCIA (rode depois, se quiser): tudo deve estar na oficina 1
-- =====================================================
-- SELECT 'clientes' AS tabela, oficina_id, COUNT(*) FROM clientes GROUP BY oficina_id
-- UNION ALL SELECT 'veiculos', oficina_id, COUNT(*) FROM veiculos GROUP BY oficina_id
-- UNION ALL SELECT 'servicos', oficina_id, COUNT(*) FROM servicos GROUP BY oficina_id
-- UNION ALL SELECT 'ordens_servico', oficina_id, COUNT(*) FROM ordens_servico GROUP BY oficina_id;
