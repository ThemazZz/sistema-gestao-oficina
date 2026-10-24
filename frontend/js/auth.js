// ===== Sessão e comunicação com a API (usado por todas as telas) =====
// Carregue este arquivo ANTES dos outros scripts da página.
const API = 'http://localhost:3000';

// O token (o "crachá" do login) fica guardado no navegador
const sessao = {
  token: () => localStorage.getItem('token'),
  salvar: (token) => localStorage.setItem('token', token),
  limpar: () => localStorage.removeItem('token'),
};

// Encerra a sessão e volta para a tela de login
function sair(mensagem) {
  sessao.limpar();
  location.href = 'login.html' + (mensagem ? '?msg=' + encodeURIComponent(mensagem) : '');
}

// Chamada à API: já envia o token. Se a API responder 401 (token vencido ou
// inválido), volta para o login. No próprio login use { semSessao: true }.
async function api(rota, metodo = 'GET', corpo, opcoes = {}) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  const token = sessao.token();
  if (token && !opcoes.semSessao) cabecalhos.Authorization = 'Bearer ' + token;

  let r;
  try {
    r = await fetch(API + rota, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error('Não foi possível conectar à API. O servidor está rodando (npm run dev)?');
  }
  if (r.status === 204) return null;
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && !opcoes.semSessao) {
    sair(dados.erro);
    throw new Error(dados.erro || 'Sessão expirada');
  }
  if (!r.ok) throw new Error(dados.erro || 'Erro inesperado');
  return dados;
}
