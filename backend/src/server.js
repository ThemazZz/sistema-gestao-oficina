require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensagem: 'API da oficina funcionando!' });
});

app.use('/clientes', require('./routes/clientes'));
app.use('/veiculos', require('./routes/veiculos'));
app.use('/servicos', require('./routes/servicos'));
app.use('/os', require('./routes/os'));

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
  console.log(`Servidor rodando em http://localhost:${PORTA}`);
});