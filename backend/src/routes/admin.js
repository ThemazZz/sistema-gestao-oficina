const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const router = express.Router();

// Rotas do SUPER ADMIN (o server.js já exige login + papel super_admin).
// O admin enxerga todas as oficinas, mas aqui só LÊ as OS: quem altera é a oficina.

const STATUS_VALIDOS = ['a_iniciar', 'em_andamento', 'aguardando_pecas', 'finalizado'];
const STATUS_ABERTOS = ['a_iniciar', 'em_andamento', 'aguardando_pecas']; // tudo que não é "finalizado"

// Qualquer rota com :id recebe um número; se vier outra coisa, responde 400 em vez de erro do banco
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(400).json({ erro: 'ID inválido' });
  next();
});

function validarUsuario(nome, email, senha) {
  if (!nome || !String(nome).trim()) return 'Nome do dono é obrigatório';
  if (!/^\S+@\S+\.\S+$/.test(String(email || '').trim())) return 'E-mail do dono inválido';
  if (!senha || String(senha).length < 8) return 'A senha precisa ter pelo menos 8 caracteres';
  return null;
}

// ===================== RESUMO GERAL =====================
router.get('/resumo', async (req, res) => {
  try {
    const oficinas = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE ativa)::int AS ativas
       FROM oficinas`
    );
    const os = await pool.query(
      `SELECT status, COUNT(*)::int AS quantidade
       FROM ordens_servico
       WHERE status = ANY($1)
       GROUP BY status`,
      [STATUS_ABERTOS]
    );
    const porStatus = Object.fromEntries(STATUS_ABERTOS.map((s) => [s, 0]));
    os.rows.forEach((l) => (porStatus[l.status] = l.quantidade));

    const { total, ativas } = oficinas.rows[0];
    res.json({
      oficinas: { total, ativas, bloqueadas: total - ativas },
      os_em_aberto: { total: Object.values(porStatus).reduce((a, b) => a + b, 0), ...porStatus },
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ===================== OFICINAS =====================

// LISTAR todas as oficinas, com números de cada uma
router.get('/oficinas', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.nome, o.ativa, o.criado_em,
              (SELECT COUNT(*) FROM usuarios u WHERE u.oficina_id = o.id)::int AS usuarios,
              (SELECT COUNT(*) FROM clientes c WHERE c.oficina_id = o.id)::int AS clientes,
              (SELECT COUNT(*) FROM veiculos v WHERE v.oficina_id = o.id)::int AS veiculos,
              (SELECT COUNT(*) FROM ordens_servico s
                WHERE s.oficina_id = o.id AND s.status = ANY($1))::int AS os_em_aberto,
              (SELECT COUNT(*) FROM ordens_servico s WHERE s.oficina_id = o.id)::int AS os_total
       FROM oficinas o
       ORDER BY o.nome`,
      [STATUS_ABERTOS]
    );
    res.json(rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// BUSCAR uma oficina com os usuários (nunca devolve a senha)
router.get('/oficinas/:id', async (req, res) => {
  try {
    const o = await pool.query('SELECT id, nome, ativa, criado_em FROM oficinas WHERE id = $1', [req.params.id]);
    if (o.rows.length === 0) return res.status(404).json({ erro: 'Oficina não encontrada' });
    const u = await pool.query(
      'SELECT id, nome, email, ativo, criado_em FROM usuarios WHERE oficina_id = $1 ORDER BY id',
      [req.params.id]
    );
    res.json({ ...o.rows[0], usuarios: u.rows });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// CADASTRAR oficina + login do dono, de uma vez
// corpo: { nome, dono_nome, dono_email, dono_senha }
router.post('/oficinas', async (req, res) => {
  const { nome, dono_nome, dono_email, dono_senha } = req.body;
  if (!nome || !String(nome).trim()) return res.status(400).json({ erro: 'Nome da oficina é obrigatório' });
  const problema = validarUsuario(dono_nome, dono_email, dono_senha);
  if (problema) return res.status(400).json({ erro: problema });

  const hash = await bcrypt.hash(String(dono_senha), 10);
  const client = await pool.connect();
  try {
    // transação: ou cria a oficina E o dono, ou não cria nada
    await client.query('BEGIN');
    const o = await client.query(
      'INSERT INTO oficinas (nome) VALUES ($1) RETURNING id, nome, ativa, criado_em',
      [String(nome).trim()]
    );
    const u = await client.query(
      `INSERT INTO usuarios (oficina_id, nome, email, senha_hash, papel)
       VALUES ($1, $2, $3, $4, 'oficina') RETURNING id, nome, email, ativo`,
      [o.rows[0].id, String(dono_nome).trim(), String(dono_email).trim(), hash]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...o.rows[0], dono: u.rows[0] });
  } catch (erro) {
    await client.query('ROLLBACK');
    if (erro.code === '23505') return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail' });
    res.status(500).json({ erro: erro.message });
  } finally {
    client.release();
  }
});

// RENOMEAR oficina: { nome }
router.put('/oficinas/:id', async (req, res) => {
  const { nome } = req.body;
  if (!nome || !String(nome).trim()) return res.status(400).json({ erro: 'Nome da oficina é obrigatório' });
  try {
    const { rows } = await pool.query(
      'UPDATE oficinas SET nome = $1 WHERE id = $2 RETURNING id, nome, ativa, criado_em',
      [String(nome).trim(), req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Oficina não encontrada' });
    res.json(rows[0]);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// BLOQUEAR / DESBLOQUEAR oficina: { ativa: false }
// Vale na hora: os usuários da oficina perdem o acesso na próxima requisição.
// Os dados não são apagados.
router.patch('/oficinas/:id/ativa', async (req, res) => {
  const { ativa } = req.body;
  if (typeof ativa !== 'boolean') {
    return res.status(400).json({ erro: 'Envie "ativa": true ou false' });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE oficinas SET ativa = $1 WHERE id = $2 RETURNING id, nome, ativa, criado_em',
      [ativa, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Oficina não encontrada' });
    res.json(rows[0]);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ===================== USUÁRIOS DE OFICINA =====================

// REDEFINIR a senha de um usuário de oficina (ex.: o dono esqueceu): { senha }
router.patch('/usuarios/:id/senha', async (req, res) => {
  const { senha } = req.body;
  if (!senha || String(senha).length < 8) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres' });
  }
  try {
    const hash = await bcrypt.hash(String(senha), 10);
    const resultado = await pool.query(
      "UPDATE usuarios SET senha_hash = $1 WHERE id = $2 AND papel = 'oficina'",
      [hash, req.params.id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ erro: 'Usuário de oficina não encontrado' });
    res.status(204).send();
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ===================== OS DE TODAS AS OFICINAS (somente leitura) =====================

// LISTAR OS. Por padrão, só as em aberto (tudo que não está finalizado).
// Filtros: ?oficina_id=2  e  ?status=em_andamento | finalizado | ... | todos
router.get('/os', async (req, res) => {
  const { oficina_id, status } = req.query;
  const condicoes = [];
  const params = [];

  if (oficina_id !== undefined) {
    if (!/^\d+$/.test(oficina_id)) return res.status(400).json({ erro: 'oficina_id inválido' });
    params.push(oficina_id);
    condicoes.push(`os.oficina_id = $${params.length}`);
  }
  if (status === undefined) {
    params.push(STATUS_ABERTOS);
    condicoes.push(`os.status = ANY($${params.length})`);
  } else if (status !== 'todos') {
    if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ erro: 'Status inválido' });
    params.push(status);
    condicoes.push(`os.status = $${params.length}`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT os.id, os.problema, os.status, os.observacoes,
              os.data_abertura, os.data_finalizacao,
              o.id AS oficina_id, o.nome AS oficina_nome,
              v.id AS veiculo_id, v.modelo, v.placa,
              c.id AS cliente_id, c.nome AS cliente_nome, c.celular, c.email,
              COALESCE(SUM(oss.valor), 0)::float AS total,
              COALESCE(
                json_agg(json_build_object('id', s.id, 'nome', s.nome, 'valor', oss.valor))
                FILTER (WHERE s.id IS NOT NULL), '[]'
              ) AS servicos
       FROM ordens_servico os
       JOIN oficinas o ON o.id = os.oficina_id
       JOIN veiculos v ON v.id = os.veiculo_id
       JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN os_servicos oss ON oss.os_id = os.id
       LEFT JOIN servicos s ON s.id = oss.servico_id
       ${condicoes.length ? 'WHERE ' + condicoes.join(' AND ') : ''}
       GROUP BY os.id, o.id, v.id, c.id
       ORDER BY os.data_abertura DESC`,
      params
    );
    res.json(rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

module.exports = router;
