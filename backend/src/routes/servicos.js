const express = require('express');
const pool = require('../db');
const router = express.Router();

// valor_padrao::float evita que o pg devolva o número como texto
const CAMPOS = 'id, nome, descricao, valor_padrao::float AS valor_padrao';

// Todas as consultas filtram por oficina_id (vem do login, via req.usuario)

// LISTAR
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CAMPOS} FROM servicos WHERE oficina_id = $1 ORDER BY nome`,
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
      `SELECT ${CAMPOS} FROM servicos WHERE id = $1 AND oficina_id = $2`,
      [req.params.id, req.usuario.oficina_id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Serviço não encontrado' });
    res.json(rows[0]);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// CRIAR
router.post('/', async (req, res) => {
  const { nome, descricao, valor_padrao } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO servicos (oficina_id, nome, descricao, valor_padrao)
       VALUES ($1, $2, $3, $4) RETURNING ${CAMPOS}`,
      [req.usuario.oficina_id, nome, descricao || null, valor_padrao || 0]
    );
    res.status(201).json(rows[0]);
  } catch (erro) {
    if (erro.code === '23505') return res.status(409).json({ erro: 'Já existe um serviço com esse nome' });
    res.status(500).json({ erro: erro.message });
  }
});

// ATUALIZAR
router.put('/:id', async (req, res) => {
  const { nome, descricao, valor_padrao } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  try {
    const { rows } = await pool.query(
      `UPDATE servicos SET nome = $1, descricao = $2, valor_padrao = $3
       WHERE id = $4 AND oficina_id = $5 RETURNING ${CAMPOS}`,
      [nome, descricao || null, valor_padrao || 0, req.params.id, req.usuario.oficina_id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Serviço não encontrado' });
    res.json(rows[0]);
  } catch (erro) {
    if (erro.code === '23505') return res.status(409).json({ erro: 'Já existe um serviço com esse nome' });
    res.status(500).json({ erro: erro.message });
  }
});

// EXCLUIR
router.delete('/:id', async (req, res) => {
  try {
    const resultado = await pool.query(
      'DELETE FROM servicos WHERE id = $1 AND oficina_id = $2',
      [req.params.id, req.usuario.oficina_id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ erro: 'Serviço não encontrado' });
    res.status(204).send();
  } catch (erro) {
    if (erro.code === '23503') {
      return res.status(409).json({ erro: 'Serviço já foi usado em ordens de serviço e não pode ser excluído' });
    }
    res.status(500).json({ erro: erro.message });
  }
});

module.exports = router;
