-- =====================================================
-- Sistema de Gerenciamento de Oficina (white-label)
-- Banco: PostgreSQL
-- Rodar no pgAdmin: Query Tool dentro do banco "oficina"
-- =====================================================

-- Para recomeçar do zero (apaga tudo), descomente:
-- DROP TABLE IF EXISTS os_servicos, ordens_servico, servicos, veiculos, clientes CASCADE;

-- -----------------------------------------------------
-- CLIENTES
-- -----------------------------------------------------
CREATE TABLE clientes (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(120) NOT NULL,
    celular     VARCHAR(20)  NOT NULL,
    email       VARCHAR(120),                       -- opcional
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------
-- VEÍCULOS (um cliente pode ter vários)
-- -----------------------------------------------------
CREATE TABLE veiculos (
    id          SERIAL PRIMARY KEY,
    cliente_id  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    modelo      VARCHAR(80) NOT NULL,               -- ex: "Gol 1.0 2015"
    placa       VARCHAR(10) NOT NULL UNIQUE
);

-- -----------------------------------------------------
-- SERVIÇOS (catálogo da oficina)
-- -----------------------------------------------------
CREATE TABLE servicos (
    id            SERIAL PRIMARY KEY,
    nome          VARCHAR(100) NOT NULL UNIQUE,     -- ex: "Troca de óleo"
    descricao     TEXT,
    valor_padrao  NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- -----------------------------------------------------
-- ORDENS DE SERVIÇO (a "comanda")
-- -----------------------------------------------------
CREATE TABLE ordens_servico (
    id               SERIAL PRIMARY KEY,
    veiculo_id       INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE RESTRICT,
    problema         TEXT NOT NULL,                 -- problema relatado
    status           VARCHAR(20) NOT NULL DEFAULT 'a_iniciar'
                     CHECK (status IN ('a_iniciar', 'em_andamento',
                                       'aguardando_pecas', 'finalizado')),
    observacoes      TEXT,
    data_abertura    TIMESTAMP NOT NULL DEFAULT NOW(),
    data_finalizacao TIMESTAMP                      -- preenchida ao finalizar
);

-- -----------------------------------------------------
-- SERVIÇOS DE CADA OS (relação N:N)
-- -----------------------------------------------------
CREATE TABLE os_servicos (
    id          SERIAL PRIMARY KEY,
    os_id       INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    servico_id  INTEGER NOT NULL REFERENCES servicos(id) ON DELETE RESTRICT,
    valor       NUMERIC(10,2) NOT NULL DEFAULT 0,   -- valor cobrado nessa OS
    UNIQUE (os_id, servico_id)
);

-- Índices para buscas comuns
CREATE INDEX idx_veiculos_cliente ON veiculos(cliente_id);
CREATE INDEX idx_os_veiculo       ON ordens_servico(veiculo_id);
CREATE INDEX idx_os_status        ON ordens_servico(status);

-- =====================================================
-- DADOS DE EXEMPLO (para testar)
-- =====================================================
INSERT INTO clientes (nome, celular, email) VALUES
    ('João Silva',  '(42) 99999-1111', 'joao@email.com'),
    ('Maria Souza', '(42) 98888-2222', NULL);

INSERT INTO veiculos (cliente_id, modelo, placa) VALUES
    (1, 'Gol 1.0 2015',    'ABC1D23'),
    (1, 'Fiesta 1.6 2012', 'XYZ9K87'),
    (2, 'Onix 1.0 2020',   'QWE4R56');

INSERT INTO servicos (nome, descricao, valor_padrao) VALUES
    ('Troca de óleo',    'Óleo + filtro',               150.00),
    ('Revisão de freio', 'Pastilhas e disco',           280.00),
    ('Alinhamento',      'Alinhamento e balanceamento', 120.00);

INSERT INTO ordens_servico (veiculo_id, problema, status) VALUES
    (1, 'Barulho ao frear',      'em_andamento'),
    (3, 'Revisão dos 10.000 km', 'a_iniciar');

INSERT INTO os_servicos (os_id, servico_id, valor) VALUES
    (1, 2, 280.00),
    (2, 1, 150.00),
    (2, 3, 120.00);

-- =====================================================
-- CONSULTA DE TESTE: OS completa com cliente e veículo
-- =====================================================
-- SELECT os.id, c.nome, c.celular, c.email, v.modelo, v.placa,
--        os.problema, os.status, os.data_abertura
-- FROM ordens_servico os
-- JOIN veiculos v ON v.id = os.veiculo_id
-- JOIN clientes c ON c.id = v.cliente_id;
