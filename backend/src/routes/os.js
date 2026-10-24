const express = require('express');
const pool = require('../db');
const router = express.Router();

const STATUS_VALIDOS = ['a_iniciar', 'em_andamento', 'aguardando_pecas', 'finalizado'];

// Todas as consultas filtram por oficina_id (vem do login, via req.usuario).
// O banco também impede abrir OS para um veículo de outra oficina (erro 23503).

// Consulta base: OS + veículo + cliente + serviços + total, tudo junto
const SQL_OS = `
  SELECT os.id, os.problema, os.status, os.observacoes,
         os.data_abertura, os.data_finalizacao,
         v.id AS veiculo_id, v.modelo, v.placa,
         c.id AS cliente_id, c.nome AS cliente_nome, c.celular, c.email,
         COALESCE(SUM(oss.valor), 0)::float AS total,
         COALESCE(
           json_agg(json_build_object('id', s.id, 'nome', s.nome, 'valor', oss.valor))
           FILTER (WHERE s.id IS NOT NULL), '[]'
         ) AS servicos
  FROM ordens_servico os
  JOIN veiculos v ON v.id = os.veiculo_id
  JOIN clientes c ON c.id = v.cliente_id
  LEFT JOIN os_servicos oss ON oss.os_id = os.id
  LEFT JOIN servicos s ON s.id = oss.servico_id
`;
const AGRUPAR = ' GROUP BY os.id, v.id, c.id';

async function buscarOS(id, oficinaId) {
  const { rows } = await pool.query(
    SQL_OS + ' WHERE os.id = $1 AND os.oficina_id = $2' + AGRUPAR,
    [id, oficinaId]
  );
  return rows[0];
}

// LISTAR (aceita filtro: /os?status=em_andamento)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const params = [req.usuario.oficina_id];
    let where = ' WHERE os.oficina_id = $1';
    if (status) {
      if (!STATUS_VALIDOS.includes(status)) {
        return res.status(400).json({ erro: 'Status inválido' });
      }
      where += ' AND os.status = $2';
      params.push(status);
    }
    const { rows } = await pool.query(
      SQL_OS + where + AGRUPAR + ' ORDER BY os.data_abertura DESC',
      params
    );
    res.json(rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// BUSCAR uma OS completa
router.get('/:id', async (req, res) => {
  try {
    const os = await buscarOS(req.params.id, req.usuario.oficina_id);
    if (!os) return res.status(404).json({ erro: 'OS não encontrada' });
    res.json(os);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ABRIR uma OS (já pode vir com serviços: "servicos": [1, 3])
router.post('/', async (req, res) => {
  const { veiculo_id, problema, observacoes, servicos } = req.body;
  if (!veiculo_id || !problema) {
    return res.status(400).json({ erro: 'veiculo_id e problema são obrigatórios' });
  }
  const oficinaId = req.usuario.oficina_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'INSERT INTO ordens_servico (oficina_id, veiculo_id, problema, observacoes) VALUES ($1, $2, $3, $4) RETURNING id',
      [oficinaId, veiculo_id, problema, observacoes || null]
    );
    const osId = rows[0].id;

    // só entram serviços que pertencem à oficina de quem está logado
    if (Array.isArray(servicos) && servicos.length > 0) {
      await client.query(
        `INSERT INTO os_servicos (os_id, servico_id, valor)
         SELECT $1, id, valor_padrao FROM servicos
         WHERE id = ANY($2::int[]) AND oficina_id = $3`,
        [osId, servicos, oficinaId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(await buscarOS(osId, oficinaId));
  } catch (erro) {
    await client.query('ROLLBACK');
    if (erro.code === '23503') return res.status(400).json({ erro: 'Veículo não existe' });
    res.status(500).json({ erro: erro.message });
  } finally {
    client.release();
  }
});

// EDITAR problema/observações
router.put('/:id', async (req, res) => {
  const { problema, observacoes } = req.body;
  if (!problema) return res.status(400).json({ erro: 'problema é obrigatório' });
  try {
    const resultado = await pool.query(
      'UPDATE ordens_servico SET problema = $1, observacoes = $2 WHERE id = $3 AND oficina_id = $4',
      [problema, observacoes || null, req.params.id, req.usuario.oficina_id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ erro: 'OS não encontrada' });
    res.json(await buscarOS(req.params.id, req.usuario.oficina_id));
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// MUDAR O STATUS (andamento do serviço)
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` });
  }
  try {
    // Ao finalizar, grava a data; se reabrir, limpa
    const dataFinalizacao = status === 'finalizado' ? new Date() : null;
    const resultado = await pool.query(
      'UPDATE ordens_servico SET status = $1, data_finalizacao = $2 WHERE id = $3 AND oficina_id = $4',
      [status, dataFinalizacao, req.params.id, req.usuario.oficina_id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ erro: 'OS não encontrada' });
    res.json(await buscarOS(req.params.id, req.usuario.oficina_id));
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ADICIONAR um serviço à OS (valor opcional; se não vier, usa o valor padrão)
router.post('/:id/servicos', async (req, res) => {
  const { servico_id, valor } = req.body;
  if (!servico_id) return res.status(400).json({ erro: 'servico_id é obrigatório' });
  const oficinaId = req.usuario.oficina_id;
  try {
    // a OS precisa ser da oficina de quem está logado
    if (!(await buscarOS(req.params.id, oficinaId))) {
      return res.status(404).json({ erro: 'OS não encontrada' });
    }
    // o serviço também
    const resultado = await pool.query(
      `INSERT INTO os_servicos (os_id, servico_id, valor)
       SELECT $1, id, COALESCE($4::numeric, valor_padrao)
       FROM servicos WHERE id = $2 AND oficina_id = $3`,
      [req.params.id, servico_id, oficinaId, valor ?? null]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ erro: 'Serviço não encontrado' });
    res.status(201).json(await buscarOS(req.params.id, oficinaId));
  } catch (erro) {
    if (erro.code === '23505') return res.status(409).json({ erro: 'Esse serviço já está na OS' });
    if (erro.code === '23503') return res.status(404).json({ erro: 'OS não encontrada' });
    res.status(500).json({ erro: erro.message });
  }
});

// REMOVER um serviço da OS
router.delete('/:id/servicos/:servico_id', async (req, res) => {
  const oficinaId = req.usuario.oficina_id;
  try {
    const resultado = await pool.query(
      `DELETE FROM os_servicos oss
       USING ordens_servico os
       WHERE oss.os_id = os.id AND os.id = $1 AND os.oficina_id = $3
         AND oss.servico_id = $2`,
      [req.params.id, req.params.servico_id, oficinaId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ erro: 'Serviço não está nessa OS' });
    res.json(await buscarOS(req.params.id, oficinaId));
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// EXCLUIR a OS (os serviços vinculados somem junto, por causa do CASCADE)
router.delete('/:id', async (req, res) => {
  try {
    const resultado = await pool.query(
      'DELETE FROM ordens_servico WHERE id = $1 AND oficina_id = $2',
      [req.params.id, req.usuario.oficina_id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ erro: 'OS não encontrada' });
    res.status(204).send();
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

module.exports = router;
