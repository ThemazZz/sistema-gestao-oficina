// ===== CONFIGURAÇÃO =====
// O nome da oficina vem do banco (tabela oficinas) depois do login.
// O endereço da API e a comunicação com ela ficam em js/auth.js.

const STATUS = {
  a_iniciar: 'A iniciar',
  em_andamento: 'Em andamento',
  aguardando_pecas: 'Aguardando peças',
  finalizado: 'Finalizado',
};

const $ = (s) => document.querySelector(s);
const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function aviso(msg, erro = false) {
  const el = $('#aviso');
  el.textContent = msg;
  el.className = 'on' + (erro ? ' erro' : '');
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (el.className = ''), 3500);
}

async function tentar(fn) {
  try { await fn(); } catch (e) { aviso(e.message, true); }
}

// ===== Tela genérica de cadastro (clientes, veículos, serviços) =====
async function crud({ rota, campos, colunas }) {
  const lista = await api(rota);
  for (const c of campos) if (c.opcoes) c.lista = await c.opcoes();

  const campo = (c) => c.lista
    ? `<label>${c.rotulo}<select name="${c.nome}" required>${c.lista.map((o) => `<option value="${o.id}">${esc(o.texto)}</option>`).join('')}</select></label>`
    : `<label>${c.rotulo}<input name="${c.nome}" type="${c.tipo || 'text'}" ${c.tipo === 'number' ? 'step="0.01" min="0"' : ''} ${c.obrigatorio ? 'required' : ''}></label>`;

  const linhas = lista.map((i) =>
    `<tr>${colunas.map((c) => `<td>${c[1](i)}</td>`).join('')}<td><button class="perigo" data-id="${i.id}">Excluir</button></td></tr>`
  ).join('');

  $('#view').innerHTML = `
    <form id="f" class="form">${campos.map(campo).join('')}<button class="primario">Cadastrar</button></form>
    <div class="tabela"><table>
      <thead><tr>${colunas.map((c) => `<th>${c[0]}</th>`).join('')}<th></th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="${colunas.length + 1}" class="vazio">Nada cadastrado ainda. Use o formulário acima.</td></tr>`}</tbody>
    </table></div>`;

  $('#f').onsubmit = (e) => {
    e.preventDefault();
    tentar(async () => {
      await api(rota, 'POST', Object.fromEntries(new FormData(e.target)));
      aviso('Cadastrado');
      await VIEWS[atual]();
    });
  };
  document.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => {
    if (!confirm('Excluir este registro?')) return;
    tentar(async () => {
      await api(`${rota}/${b.dataset.id}`, 'DELETE');
      aviso('Excluído');
      await VIEWS[atual]();
    });
  }));
}

// ===== Ordens de serviço (quadro por status) =====
function cartao(o) {
  return `<article class="cartao">
    <div class="linha"><span class="placa">${esc(o.placa)}</span><small class="suave">OS ${o.id}</small></div>
    <strong>${esc(o.modelo)}</strong>
    <p>${esc(o.cliente_nome)}</p>
    <p class="suave">${esc(o.celular)}${o.email ? '<br>' + esc(o.email) : ''}</p>
    <p>${esc(o.problema)}</p>
    <ul>${o.servicos.map((s) => `<li>${esc(s.nome)}<span>${moeda(s.valor)}</span></li>`).join('') || '<li class="vazio">Sem serviços</li>'}</ul>
    <div class="linha"><b>${moeda(o.total)}</b>
      <select data-os="${o.id}" aria-label="Status da OS ${o.id}">
        ${Object.entries(STATUS).map(([k, n]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${n}</option>`).join('')}
      </select></div>
    <button class="perigo" data-del="${o.id}">Excluir OS</button>
  </article>`;
}

async function viewOS() {
  const lista = await api('/os');
  $('#view').innerHTML = `
    <div class="topo"><h2>Ordens de serviço</h2><button class="primario" id="nova">Nova OS</button></div>
    <div class="quadro">${Object.entries(STATUS).map(([chave, nome]) => {
      const itens = lista.filter((o) => o.status === chave);
      return `<section class="coluna s-${chave}"><h3>${nome} <span>${itens.length}</span></h3>
        ${itens.map(cartao).join('') || '<p class="vazio">Nenhuma OS</p>'}</section>`;
    }).join('')}</div>`;

  $('#nova').onclick = () => tentar(abrirNovaOS);
  document.querySelectorAll('select[data-os]').forEach((s) => (s.onchange = () => tentar(async () => {
    await api(`/os/${s.dataset.os}/status`, 'PATCH', { status: s.value });
    aviso('Status atualizado');
    await viewOS();
  })));
  document.querySelectorAll('button[data-del]').forEach((b) => (b.onclick = () => {
    if (!confirm('Excluir esta OS?')) return;
    tentar(async () => { await api(`/os/${b.dataset.del}`, 'DELETE'); aviso('OS excluída'); await viewOS(); });
  }));
}

async function abrirNovaOS() {
  const [veiculos, servicos] = await Promise.all([api('/veiculos'), api('/servicos')]);
  const d = $('#dlg');
  d.innerHTML = `<form id="fos" class="form vertical">
    <h2>Nova ordem de serviço</h2>
    <label>Veículo<select name="veiculo_id" required>${veiculos.map((v) => `<option value="${v.id}">${esc(v.placa)} - ${esc(v.modelo)} (${esc(v.cliente_nome)})</option>`).join('')}</select></label>
    <label>Problema relatado<textarea name="problema" rows="3" required></textarea></label>
    <fieldset><legend>Serviços solicitados</legend>
      ${servicos.map((s) => `<label class="check"><input type="checkbox" name="servicos" value="${s.id}"> ${esc(s.nome)} <span>${moeda(s.valor_padrao)}</span></label>`).join('')}
    </fieldset>
    <div class="acoes"><button type="button" id="cancela">Cancelar</button><button class="primario">Abrir OS</button></div>
  </form>`;
  d.showModal();
  $('#cancela').onclick = () => d.close();
  $('#fos').onsubmit = (e) => {
    e.preventDefault();
    tentar(async () => {
      const f = new FormData(e.target);
      await api('/os', 'POST', {
        veiculo_id: f.get('veiculo_id'),
        problema: f.get('problema'),
        servicos: f.getAll('servicos').map(Number),
      });
      d.close();
      aviso('OS aberta');
      await viewOS();
    });
  };
}

// ===== Telas e navegação =====
const VIEWS = {
  os: viewOS,
  clientes: () => crud({
    rota: '/clientes',
    campos: [
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
      { nome: 'celular', rotulo: 'Celular', obrigatorio: true },
      { nome: 'email', rotulo: 'E-mail (opcional)', tipo: 'email' },
    ],
    colunas: [['Nome', (c) => esc(c.nome)], ['Celular', (c) => esc(c.celular)], ['E-mail', (c) => esc(c.email || '-')]],
  }),
  veiculos: () => crud({
    rota: '/veiculos',
    campos: [
      { nome: 'cliente_id', rotulo: 'Cliente', opcoes: async () => (await api('/clientes')).map((c) => ({ id: c.id, texto: c.nome })) },
      { nome: 'modelo', rotulo: 'Modelo', obrigatorio: true },
      { nome: 'placa', rotulo: 'Placa', obrigatorio: true },
    ],
    colunas: [['Placa', (v) => `<span class="placa">${esc(v.placa)}</span>`], ['Modelo', (v) => esc(v.modelo)], ['Cliente', (v) => esc(v.cliente_nome)]],
  }),
  servicos: () => crud({
    rota: '/servicos',
    campos: [
      { nome: 'nome', rotulo: 'Serviço', obrigatorio: true },
      { nome: 'valor_padrao', rotulo: 'Valor padrão (R$)', tipo: 'number', obrigatorio: true },
    ],
    colunas: [['Serviço', (s) => esc(s.nome)], ['Valor padrão', (s) => moeda(s.valor_padrao)]],
  }),
};

let atual = 'os';
function ir(v) {
  atual = v;
  document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === v));
  tentar(VIEWS[v]);
}
document.querySelectorAll('#menu button').forEach((b) => (b.onclick = () => ir(b.dataset.v)));
$('#sair').onclick = () => sair();

// Valida o login, descobre quem é o usuário e só então abre a tela
async function iniciar() {
  if (!sessao.token()) return sair();
  const eu = await api('/auth/eu');
  if (eu.usuario.papel === 'super_admin') {
    location.href = 'admin.html';
    return;
  }
  document.title = eu.oficina.nome;
  $('#nome-oficina').textContent = eu.oficina.nome;
  $('#nome-usuario').textContent = eu.usuario.nome;
  ir('os');
}
tentar(iniciar);
