const express = require('express');
const pool = require('../db');
const router = express.Router();

// Todas as consultas filtram por oficina_id (vem do login, via req.usuario)

// LISTAR todos
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM clientes WHERE oficina_id = $1 ORDER BY nome',
      [req.usuario.oficina_id]
    );
    res.json(rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// BUSCAR um por id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM clientes WHERE id = $1 AND oficina_id = $2',
      [req.params.id, req.usuario.oficina_id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });
    res.json(rows[0]);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// CRIAR
router.post('/', async (req, res) => {
  const { nome, celular, email } = req.body;
  if (!nome || !celular) {
    return res.status(400).json({ erro: 'Nome e celular são obrigatórios' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO clientes (oficina_id, nome, celular, email) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.usuario.oficina_id, nome, celular, email || null]
    );
    res.status(201).json(rows[0]);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ATUALIZAR
router.put('/:id', async (req, res) => {
  const { nome, celular, email } = req.body;
  if (!nome || !celular) {
    return res.status(400).json({ erro: 'Nome e celular são obrigatórios' });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE clientes SET nome = $1, celular = $2, email = $3 WHERE id = $4 AND oficina_id = $5 RETURNING *',
      [nome, celular, email || null, req.params.id, req.usuario.oficina_id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });
    res.json(rows[0]);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// EXCLUIR
router.delete('/:id', async (req, res) => {
  try {
    const resultado = await pool.query(
      'DELETE FROM clientes WHERE id = $1 AND oficina_id = $2',
      [req.params.id, req.usuario.oficina_id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });
    res.status(204).send();
  } catch (erro) {
    // 23503 = cliente ainda tem veículos cadastrados
    if (erro.code === '23503') {
      return res.status(409).json({ erro: 'Cliente possui veículos cadastrados e não pode ser excluído' });
    }
    res.status(500).json({ erro: erro.message });
  }
});

module.exports = router;
