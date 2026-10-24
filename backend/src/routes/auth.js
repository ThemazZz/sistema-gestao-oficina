const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const router = express.Router();

const VALIDADE_TOKEN = '8h';

// Hash "de mentira": usado quando o e-mail não existe, para a resposta demorar
// o mesmo tempo e ninguém descobrir quais e-mails estão cadastrados.
const HASH_FALSO = bcrypt.hashSync('senha-falsa-para-igualar-tempo', 10);

// LOGIN: { "email": "...", "senha": "..." }
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'E-mail e senha são obrigatórios' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.senha_hash, u.papel, u.oficina_id, u.ativo,
              o.nome AS oficina_nome, o.ativa AS oficina_ativa
       FROM usuarios u
       LEFT JOIN oficinas o ON o.id = u.oficina_id
       WHERE LOWER(u.email) = LOWER($1)`,
      [String(email).trim()]
    );
    const u = rows[0];
    const senhaOk = await bcrypt.compare(String(senha), u ? u.senha_hash : HASH_FALSO);

    if (!u || !senhaOk || !u.ativo) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
    }
    if (u.papel === 'oficina' && !u.oficina_ativa) {
      return res.status(403).json({ erro: 'Oficina bloqueada. Entre em contato com o suporte' });
    }

    const token = jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: VALIDADE_TOKEN });
    res.json({
      token,
      usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel },
      oficina: u.oficina_id ? { id: u.oficina_id, nome: u.oficina_nome } : null,
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// QUEM SOU EU: o front chama ao abrir a página para validar o token e
// descobrir o nome da oficina e o papel (oficina ou super_admin)
router.get('/eu', autenticar, (req, res) => {
  const u = req.usuario;
  res.json({
    usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel },
    oficina: u.oficina_id ? { id: u.oficina_id, nome: u.oficina_nome } : null,
  });
});

module.exports = router;
