const jwt = require('jsonwebtoken');
const pool = require('../db');

// Confere o token enviado no cabeçalho "Authorization: Bearer <token>".
// Depois consulta o banco para garantir que o usuário e a oficina continuam
// ativos (assim, bloquear uma oficina vale na hora, sem esperar o token vencer).
// Importante: a oficina do usuário vem do BANCO, nunca de dados que o cliente envia.
async function autenticar(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Faça login para continuar' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.papel, u.oficina_id, u.ativo,
              o.nome AS oficina_nome, o.ativa AS oficina_ativa
       FROM usuarios u
       LEFT JOIN oficinas o ON o.id = u.oficina_id
       WHERE u.id = $1`,
      [payload.id]
    );
    const u = rows[0];
    if (!u || !u.ativo) {
      return res.status(401).json({ erro: 'Sessão inválida. Faça login novamente' });
    }
    if (u.papel === 'oficina' && !u.oficina_ativa) {
      return res.status(403).json({ erro: 'Oficina bloqueada. Entre em contato com o suporte' });
    }
    req.usuario = {
      id: u.id,
      nome: u.nome,
      email: u.email,
      papel: u.papel,
      oficina_id: u.oficina_id,
      oficina_nome: u.oficina_nome,
    };
    next();
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
}

// Rotas de cadastro/OS: só usuários de oficina (cada um vê apenas a sua oficina)
function apenasOficina(req, res, next) {
  if (req.usuario.papel !== 'oficina') {
    return res.status(403).json({ erro: 'Acesso restrito aos usuários de oficina' });
  }
  next();
}

// Rotas do painel admin (fase 3): só o super admin
function apenasSuperAdmin(req, res, next) {
  if (req.usuario.papel !== 'super_admin') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador' });
  }
  next();
}

module.exports = { autenticar, apenasOficina, apenasSuperAdmin };
