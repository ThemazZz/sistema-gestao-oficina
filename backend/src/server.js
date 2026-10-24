require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { autenticar, apenasOficina } = require('./middleware/auth');

// Sem segredo para assinar os tokens, o login não funciona: melhor parar logo
if (!process.env.JWT_SECRET) {
  console.error('ERRO: defina JWT_SECRET no arquivo backend/.env (veja o env.example).');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensagem: 'API da oficina funcionando!' });
});

// Login (público)
app.use('/auth', require('./routes/auth'));

// Rotas da oficina: exigem login e filtram tudo pela oficina de quem está logado
app.use('/clientes', autenticar, apenasOficina, require('./routes/clientes'));
app.use('/veiculos', autenticar, apenasOficina, require('./routes/veiculos'));
app.use('/servicos', autenticar, apenasOficina, require('./routes/servicos'));
app.use('/os', autenticar, apenasOficina, require('./routes/os'));

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
  console.log(`Servidor rodando em http://localhost:${PORTA}`);
});
