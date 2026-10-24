// ===== Tela de login (precisa de js/auth.js carregado antes) =====
const $ = (s) => document.querySelector(s);

// chegar aqui significa começar uma sessão nova
sessao.limpar();

// mensagem vinda de um redirecionamento (ex.: "Sessão expirada")
const msg = new URLSearchParams(location.search).get('msg');
if (msg) $('#erro').textContent = msg;

$('#f').onsubmit = async (e) => {
  e.preventDefault();
  const botao = $('#entrar');
  botao.disabled = true;
  $('#erro').textContent = '';
  try {
    const f = Object.fromEntries(new FormData(e.target));
    const r = await api('/auth/login', 'POST', { email: f.email, senha: f.senha }, { semSessao: true });
    sessao.salvar(r.token);
    // super admin vai para o painel admin; usuário de oficina para o painel da oficina
    location.href = r.usuario.papel === 'super_admin' ? 'admin.html' : 'index.html';
  } catch (erro) {
    $('#erro').textContent = erro.message;
    botao.disabled = false;
  }
};
