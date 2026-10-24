const express = require('express');
const pool = require('../db');
const router = express.Router();

// Todas as consultas filtram por oficina_id (vem do login, via req.usuario).
// O banco também impede ligar um veículo a um cliente de outra oficina:
// nesse caso devolve o erro 23503, tratado abaixo como "Cliente não existe".

// LISTAR (aceita filtro: /veiculos?cliente_id=1)
router.get('/', async (req, res) => {
  try {
    const { cliente_id } = req.query;
    let sql = `SELECT v.*, c.nome AS cliente_nome
               FROM veiculos v
               JOIN clientes c ON c.id = v.cliente_id
               WHERE v.oficina_id = $1`;
    const params = [req.usuario.oficina_id];
    if (cliente_id) {
      sql += ' AND v.cliente_id = $2';
      params.push(cliente_id);
    }
    sql += ' ORDER BY v.id';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// BUSCAR um por id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, c.nome AS cliente_nome
       FROM veiculos v JOIN clientes c ON c.id = v.cliente_id
       WHERE v.id = $1 AND v.oficina_id = $2`,
      [req.params.id, req.usuario.oficina_id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Veículo não encontrado' });
    res.json(rows[0]);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// CRIAR
router.post('/', async (req, res) => {
  const { cliente_id, modelo, placa } = req.body;
  if (!cliente_id || !modelo || !placa) {
    return res.status(400).json({ erro: 'cliente_id, modelo e placa são obrigatórios' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO veiculos (oficina_id, cliente_id, modelo, placa) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.usuario.oficina_id, cliente_id, modelo, placa.toUpperCase()]
    );
    res.status(201).json(rows[0]);
  } catch (erro) {
    if (erro.code === '23505') return res.status(409).json({ erro: 'Já existe um veículo com essa placa' });
    if (erro.code === '23503') return res.status(400).json({ erro: 'Cliente não existe' });
    res.status(500).json({ erro: erro.message });
  }
});

// ATUALIZAR
router.put('/:id', async (req, res) => {
  const { cliente_id, modelo, placa } = req.body;
  if (!cliente_id || !modelo || !placa) {
    return res.status(400).json({ erro: 'cliente_id, modelo e placa são obrigatórios' });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE veiculos SET cliente_id = $1, modelo = $2, placa = $3 WHERE id = $4 AND oficina_id = $5 RETURNING *',
      [cliente_id, modelo, placa.toUpperCase(), req.params.id, req.usuario.oficina_id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Veículo não encontrado' });
    res.json(rows[0]);
  } catch (erro) {
    if (erro.code === '23505') return res.status(409).json({ erro: 'Já existe um veículo com essa placa' });
    if (erro.code === '23503') return res.status(400).json({ erro: 'Cliente não existe' });
    res.status(500).json({ erro: erro.message });
  }
});

// EXCLUIR
router.delete('/:id', async (req, res) => {
  try {
    const resultado = await pool.query(
      'DELETE FROM veiculos WHERE id = $1 AND oficina_id = $2',
      [req.params.id, req.usuario.oficina_id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ erro: 'Veículo não encontrado' });
    res.status(204).send();
  } catch (erro) {
    if (erro.code === '23503') {
      return res.status(409).json({ erro: 'Veículo possui ordens de serviço e não pode ser excluído' });
    }
    res.status(500).json({ erro: erro.message });
  }
});

module.exports = router;
