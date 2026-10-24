// Cria um usuário de login direto no banco.
// Uso (dentro da pasta backend):   node scripts/criar_usuario.js
//
// Serve para criar:
//   1) o seu login de SUPER ADMIN (sem oficina)
//   2) o login do dono de uma oficina (ligado a uma oficina que já existe)
require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
});

// Fila de linhas digitadas: funciona digitando no terminal e também com entrada colada
const linhas = [];
const esperando = [];
let encerrado = false;
rl.on('line', (linha) => (esperando.length ? esperando.shift().ok(linha) : linhas.push(linha)));
rl.on('close', () => {
  encerrado = true;
  esperando.splice(0).forEach((e) => e.falha(new Error('Entrada encerrada antes de terminar.')));
});
const proximaLinha = () =>
  new Promise((ok, falha) => {
    if (linhas.length) return ok(linhas.shift());
    if (encerrado) return falha(new Error('Entrada encerrada antes de terminar.'));
    esperando.push({ ok, falha });
  });

// Enquanto "mudo" estiver ligado, o que é digitado não aparece na tela (senha)
let mudo = false;
const escreverOriginal = rl._writeToOutput;
rl._writeToOutput = function (texto) {
  if (!mudo) escreverOriginal.call(rl, texto);
};

async function perguntar(texto, oculto = false) {
  rl.setPrompt(texto);
  rl.prompt();
  mudo = oculto && Boolean(process.stdin.isTTY);
  try {
    return await proximaLinha();
  } finally {
    if (mudo) process.stdout.write('\n');
    mudo = false;
  }
}
const perguntarSenha = (texto) => perguntar(texto, true);

async function main() {
  console.log('\n=== Criar usuário ===');
  console.log('1 - Super admin (você, controla todas as oficinas)');
  console.log('2 - Dono de uma oficina');
  const tipo = (await perguntar('Escolha 1 ou 2: ')).trim();
  if (tipo !== '1' && tipo !== '2') throw new Error('Opção inválida. Use 1 ou 2.');

  let oficinaId = null;
  if (tipo === '2') {
    const { rows } = await pool.query('SELECT id, nome, ativa FROM oficinas ORDER BY id');
    if (rows.length === 0) throw new Error('Nenhuma oficina cadastrada. Rode a migração do banco primeiro.');
    console.log('\nOficinas cadastradas:');
    rows.forEach((o) => console.log(`  ${o.id} - ${o.nome}${o.ativa ? '' : ' (bloqueada)'}`));
    oficinaId = Number((await perguntar('\nID da oficina: ')).trim());
    if (!rows.some((o) => o.id === oficinaId)) throw new Error('ID de oficina inexistente.');
  }

  const nome = (await perguntar('Nome do usuário: ')).trim();
  const email = (await perguntar('E-mail (será o login): ')).trim();
  const senha = await perguntarSenha('Senha (mínimo 8 caracteres): ');
  const confirmacao = await perguntarSenha('Repita a senha: ');

  if (!nome) throw new Error('O nome é obrigatório.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('E-mail inválido.');
  if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  if (senha !== confirmacao) throw new Error('As senhas não conferem.');

  const hash = await bcrypt.hash(senha, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO usuarios (oficina_id, nome, email, senha_hash, papel)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [oficinaId, nome, email, hash, tipo === '1' ? 'super_admin' : 'oficina']
    );
    console.log(`\nUsuário criado com sucesso (id ${rows[0].id}). Já pode fazer login em frontend/login.html.`);
  } catch (erro) {
    if (erro.code === '23505') throw new Error('Já existe um usuário com esse e-mail.');
    throw erro;
  }
}

main()
  .catch((erro) => {
    console.error('\nNão foi possível criar o usuário:', erro.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await pool.end();
  });
