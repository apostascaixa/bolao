(function () {
  'use strict';
  var U = window.BolaoUtil;
  var API = window.BolaoApi;
  var raiz = document.getElementById('app');

  var estado = {
    usuario: null, abaAcesso: 'entrar', codigoConvite: '', aba: 'boloes',
    boloes: [], convites: [], modalidades: [], edicao: null, novoConvite: null,
    abertos: [], minhasCotas: [], bolaoSel: null, volante: { sel: [], editando: null }, verMinhas: false, menuAberto: false,
    cotasAdmin: [], cfg: null, pixInfo: {},
    pub: { topo: { imagemId: '', link: '' }, carrossel: { segundos: 6, incluirBoloes: true }, banners: [] }
  };

  // ---------- utilitários de tela ----------
  var h = window.BolaoUI.h;
  var aviso = window.BolaoUI.aviso;
  var campo = window.BolaoUI.campo;
  var Img = window.BolaoImagens;
  var Car = window.BolaoCarrossel;

  function montar() {
    var filhos = Array.prototype.slice.call(arguments);
    raiz.replaceChildren.apply(raiz, filhos);
  }

  async function executar(fn, botao, aoErro) {
    if (botao) botao.disabled = true;
    try {
      return await fn();
    } catch (e) {
      if (e && e.sessaoInvalida) {
        API.guardarToken('');
        estado.usuario = null;
        renderAcesso();
        aviso(e.message, true);
      } else if (aoErro) {
        aoErro(e.message || 'Erro inesperado.');
      } else {
        aviso(e.message || 'Erro inesperado.', true);
      }
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  // ---------- acesso (entrar / cadastrar) ----------
  function renderAcesso() {
    var abaEntrar = estado.abaAcesso === 'entrar';
    var erroEntrar = h('p', { class: 'erro-form', role: 'alert' });
    var erroCad = h('p', { class: 'erro-form', role: 'alert' });
    var formEntrar = h('form', { class: 'form', onsubmit: onEntrar },
      campo('Usuário', h('input', { name: 'usuario', autocomplete: 'username', autocapitalize: 'none', required: true })),
      campo('Senha', h('input', { name: 'senha', type: 'password', autocomplete: 'current-password', required: true })),
      erroEntrar,
      h('button', { class: 'primario', type: 'submit' }, 'Entrar'));
    var formCad = h('form', { class: 'form', onsubmit: onCadastrar },
      campo('Código do convite', h('input', { name: 'convite', value: estado.codigoConvite, autocapitalize: 'characters', required: true })),
      campo('Seu nome', h('input', { name: 'nome', autocomplete: 'name', required: true })),
      campo('Usuário', h('input', { name: 'usuario', autocomplete: 'username', autocapitalize: 'none', required: true }),
        '3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.'),
      campo('Senha', h('input', { name: 'senha', type: 'password', autocomplete: 'new-password', minlength: 8, required: true }), 'Mínimo de 8 caracteres.'),
      campo('Repita a senha', h('input', { name: 'senha2', type: 'password', autocomplete: 'new-password', required: true })),
      erroCad,
      h('button', { class: 'primario', type: 'submit' }, 'Criar conta'));

    montar(h('main', { class: 'central' },
      h('h1', {}, 'Bolão da Sorte'),
      h('p', { class: 'sub' }, 'Organização do bolão do grupo.'),
      h('div', { class: 'abas', role: 'tablist' },
        h('button', { role: 'tab', 'aria-selected': String(abaEntrar), class: abaEntrar ? 'ativa' : '', onclick: function () { estado.abaAcesso = 'entrar'; renderAcesso(); } }, 'Entrar'),
        h('button', { role: 'tab', 'aria-selected': String(!abaEntrar), class: !abaEntrar ? 'ativa' : '', onclick: function () { estado.abaAcesso = 'cadastrar'; renderAcesso(); } }, 'Tenho um convite')),
      abaEntrar ? formEntrar : formCad,
      h('p', { class: 'aviso-legal' }, 'Este sistema organiza o grupo. Não é um canal oficial de apostas da CAIXA.')));

    function onEntrar(ev) {
      ev.preventDefault();
      var f = ev.target;
      var mostrarErro = function (m) { erroEntrar.textContent = m; };
      mostrarErro('');
      executar(async function () {
        var r = await API.chamar('login', { usuario: f.elements.usuario.value, senha: f.elements.senha.value });
        await abrirPainel(r);
      }, f.querySelector('button[type=submit]'), mostrarErro);
    }

    function onCadastrar(ev) {
      ev.preventDefault();
      var f = ev.target;
      var mostrarErro = function (m) { erroCad.textContent = m; };
      mostrarErro('');
      if (f.elements.senha.value !== f.elements.senha2.value) return mostrarErro('As senhas não conferem.');
      executar(async function () {
        var r = await API.chamar('cadastrar', {
          codigoConvite: f.elements.convite.value, nome: f.elements.nome.value,
          usuario: f.elements.usuario.value, senha: f.elements.senha.value
        });
        estado.codigoConvite = '';
        await abrirPainel(r);
      }, f.querySelector('button[type=submit]'), mostrarErro);
    }
  }

  async function abrirPainel(r) {
    API.guardarToken(r.token);
    estado.usuario = r.usuario;
    estado.aba = r.usuario.papel === 'admin' ? 'boloes' : 'participar';
    estado.verMinhas = false;
    estado.menuAberto = false;
    estado.edicao = null;
    estado.novoConvite = null;
    await carregarDados();
    renderPainel();
  }

  async function carregarDados() {
    var admin = estado.usuario.papel === 'admin';
    var reqs = [API.chamar('boloes.abertos', {}), API.chamar('cotas.minhas', {}), API.chamar('modalidades', {})];
    if (admin) {
      reqs.push(API.chamar('admin.boloes.listar', {}), API.chamar('admin.convites.listar', {}),
        API.chamar('admin.cotas.listar', {}), API.chamar('admin.config.obter', {}));
    }
    var r = await Promise.all(reqs);
    estado.abertos = r[0]; estado.minhasCotas = r[1]; estado.modalidades = r[2];
    if (admin) { estado.boloes = r[3]; estado.convites = r[4]; estado.cotasAdmin = r[5]; estado.cfg = r[6]; }
  }

  /** Atualiza o que muda quando o administrador age (bolões, vagas e aprovações). */
  async function recarregarAdmin() {
    var r = await Promise.all([API.chamar('admin.boloes.listar', {}), API.chamar('boloes.abertos', {}), API.chamar('admin.cotas.listar', {})]);
    estado.boloes = r[0]; estado.abertos = r[1]; estado.cotasAdmin = r[2];
  }

  var ctxAdmin = {
    estado: estado, API: API, U: U, UI: window.BolaoUI, Img: Img,
    executar: function () { return executar.apply(null, arguments); },
    recarregarAdmin: function () { return recarregarAdmin(); },
    renderPainel: function () { renderPainel(); },
    atualizarTopo: function () { atualizarTopo(); }
  };

  function atualizarTopo() {
    var alvo = document.getElementById('topo-site');
    if (!alvo) return;
    alvo.replaceChildren();
    var el = Car.topo(estado.pub.topo);
    if (el) alvo.appendChild(el);
  }

  function emTelaParticipar() {
    return !!estado.usuario && (estado.usuario.papel !== 'admin' || estado.aba === 'participar');
  }

  function carregarPublico() {
    return API.chamar('publico.config', {}).then(function (c) {
      estado.pub = c;
      atualizarTopo();
      if (emTelaParticipar() && estado.volante.sel.length === 0 && !estado.edicao) renderPainel();
    }).catch(function () { /* sem a configuração pública o site funciona sem banners */ });
  }

  async function sair() {
    try { await API.chamar('logout', {}); } catch (e) { /* sair localmente mesmo assim */ }
    API.guardarToken('');
    estado.usuario = null;
    estado.cotasAdmin = [];
    estado.cfg = null;
    estado.pixInfo = {};
    Car.parar();
    estado.abaAcesso = 'entrar';
    renderAcesso();
  }

  // ---------- painel ----------
  function renderPainel() {
    Car.parar();
    var admin = estado.usuario.papel === 'admin';
    var pendentes = estado.cotasAdmin.filter(function (c) { return c.status === 'aguardando_pagamento'; }).length;
    var abas = admin
      ? [['boloes', 'Administrar bolões'], ['aprovacoes', 'Aprovações' + (pendentes ? ' (' + pendentes + ')' : '')], ['convites', 'Convites'], ['config', 'Configurações'], ['participar', 'Participar']]
      : [];
    var conteudo;
    if (admin && estado.aba === 'convites') conteudo = telaConvites();
    else if (admin && estado.aba === 'boloes') conteudo = telaBoloesAdmin();
    else if (admin && estado.aba === 'aprovacoes') conteudo = window.BolaoAdmin.telaAprovacoes(ctxAdmin);
    else if (admin && estado.aba === 'config') conteudo = window.BolaoAdmin.telaConfig(ctxAdmin);
    else conteudo = telaParticipar();

    montar(
      h('header', { class: 'topo' },
        h('strong', {}, 'Bolão da Sorte'),
        h('span', { class: 'quem' }, estado.usuario.nome + (admin ? ' (administrador)' : '')),
        h('button', { class: 'link', onclick: sair }, 'Sair')),
      h('main', { class: 'painel' },
        abas.length > 0 ? h('div', { class: 'abas', role: 'tablist' }, abas.map(function (a) {
          var ativa = estado.aba === a[0];
          return h('button', { role: 'tab', 'aria-selected': String(ativa), class: ativa ? 'ativa' : '',
            onclick: function () { estado.aba = a[0]; estado.edicao = null; renderPainel(); } }, a[1]);
        })) : null,
        conteudo));
  }

  function dado(rotulo, valor) {
    return h('div', {}, h('dt', {}, rotulo), h('dd', {}, String(valor)));
  }

  var ROTULO_STATUS = { rascunho: 'Rascunho', aberto: 'Aberto', fechado: 'Fechado', arquivado: 'Arquivado' };

  function cartaoBolao(b, acoes) {
    return h('article', { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h3', {}, b.nome), h('span', { class: 'selo ' + b.status }, ROTULO_STATUS[b.status] || b.status)),
      h('p', { class: 'sub' }, b.modalidadeNome),
      h('dl', { class: 'dados' },
        dado('Números por jogo', b.qtdNumeros), dado('Jogos por cota', b.jogosPorCota),
        dado('Valor da cota', U.centavosParaReais(b.valorCotaCentavos)),
        dado('Cotas', b.cotasOcupadas + ' de ' + b.limiteCotas + ' (' + b.vagas + ' vagas)'),
        dado('Prazo', U.formatarData(b.prazo))),
      acoes ? h('div', { class: 'acoes' }, acoes) : null);
  }

  function telaBoloesAdmin() {
    if (estado.edicao) return formularioBolao();
    return h('section', {},
      h('div', { class: 'linha-titulo' }, h('h2', {}, 'Bolões'),
        h('button', { class: 'primario', onclick: function () { estado.edicao = { bolao: null }; renderPainel(); } }, 'Novo bolão')),
      estado.boloes.length === 0
        ? h('p', { class: 'vazio' }, 'Nenhum bolão criado ainda.')
        : estado.boloes.map(function (b) {
          var acoes = [];
          if (b.status === 'rascunho') acoes.push(h('button', { onclick: function (ev) { mudarStatus(b, 'aberto', ev.target); } }, 'Abrir inscrições'));
          if (b.status === 'aberto' && b.cotasOcupadas === 0) acoes.push(h('button', { onclick: function (ev) { mudarStatus(b, 'rascunho', ev.target); } }, 'Voltar a rascunho'));
          if (b.status === 'rascunho' || b.status === 'aberto') acoes.push(h('button', { onclick: function () { estado.edicao = { bolao: b }; renderPainel(); } }, 'Editar'));
          acoes.push(h('button', { class: 'perigo', onclick: function (ev) { excluir(b, ev.target); } }, 'Excluir'));
          return cartaoBolao(b, acoes);
        }));
  }

  async function recarregarBoloes() {
    await recarregarAdmin();
    renderPainel();
  }

  function mudarStatus(b, status, botao) {
    executar(async function () {
      await API.chamar('admin.boloes.status', { id: b.id, status: status });
      aviso(status === 'aberto' ? 'Inscrições abertas.' : 'Bolão voltou a rascunho.');
      await recarregarBoloes();
    }, botao);
  }

  function excluir(b, botao) {
    var msg = b.cotasOcupadas > 0
      ? 'Este bolão já tem cotas. Ele será arquivado (o histórico é mantido). Continuar?'
      : 'Excluir o bolão "' + b.nome + '"? Isso não pode ser desfeito.';
    if (!window.confirm(msg)) return;
    executar(async function () {
      var r = await API.chamar('admin.boloes.excluir', { id: b.id });
      aviso(r.removido ? 'Bolão excluído.' : 'Bolão arquivado.');
      await recarregarBoloes();
    }, botao);
  }

  function formularioBolao() {
    var b = estado.edicao.bolao;
    var travado = !!(b && b.cotasOcupadas > 0);
    var mods = estado.modalidades;
    var erroBox = h('p', { class: 'erro-form', role: 'alert' });

    var selMod = h('select', { name: 'modalidade', disabled: travado, onchange: ajustarModalidade },
      mods.map(function (m) { return h('option', { value: m.id, selected: b ? b.modalidade === m.id : false }, m.nome); }));
    var inQtd = h('input', { name: 'qtdNumeros', type: 'number', step: 1, required: true, disabled: travado, value: b ? b.qtdNumeros : '' });
    var dicaQtd = h('small', {});
    function ajustarModalidade() {
      var m = mods.filter(function (x) { return x.id === selMod.value; })[0];
      if (!m) return;
      inQtd.min = m.dezenasMin; inQtd.max = m.dezenasMax;
      var atual = Number(inQtd.value);
      if (!inQtd.value || atual < m.dezenasMin || atual > m.dezenasMax) inQtd.value = m.dezenasMin;
      dicaQtd.textContent = 'Números de ' + m.minimo + ' a ' + m.maximo + '. Permitido marcar de ' + m.dezenasMin + ' a ' + m.dezenasMax + ' por jogo.';
    }

    var form = h('form', { class: 'form', onsubmit: onSalvar },
      h('h2', {}, b ? 'Editar bolão' : 'Novo bolão'),
      travado ? h('p', { class: 'nota' }, 'Este bolão já tem cotas: só o nome e o prazo podem ser alterados.') : null,
      campo('Nome', h('input', { name: 'nome', maxlength: 60, required: true, value: b ? b.nome : '' })),
      campo('Modalidade', selMod),
      campo('Números por jogo', inQtd, dicaQtd),
      campo('Valor da cota (R$)', h('input', { name: 'valor', inputmode: 'decimal', required: true, disabled: travado,
        value: b ? U.centavosParaDecimalBR(b.valorCotaCentavos) : '' }), 'Exemplo: 60,00'),
      campo('Jogos por cota', h('input', { name: 'jogosPorCota', type: 'number', min: 1, step: 1, required: true, disabled: travado, value: b ? b.jogosPorCota : 10 })),
      campo('Limite de cotas', h('input', { name: 'limiteCotas', type: 'number', min: 1, step: 1, required: true, disabled: travado, value: b ? b.limiteCotas : '' })),
      campo('Máximo de cotas por pessoa', h('input', { name: 'maxCotasPorPessoa', type: 'number', min: 1, step: 1, required: true, disabled: travado, value: b ? b.maxCotasPorPessoa : 1 })),
      campo('Prazo para confirmar a participação', h('input', { name: 'prazo', type: 'datetime-local', required: true,
        value: U.msParaInputLocal(b ? b.prazo : Date.now() + 7 * 24 * 3600 * 1000) })),
      erroBox,
      h('div', { class: 'acoes' },
        h('button', { class: 'primario', type: 'submit' }, 'Salvar'),
        h('button', { type: 'button', onclick: function () { estado.edicao = null; renderPainel(); } }, 'Cancelar')));
    ajustarModalidade();
    if (b) inQtd.value = b.qtdNumeros;

    function onSalvar(ev) {
      ev.preventDefault();
      var f = ev.target;
      erroBox.textContent = '';
      var prazo = U.inputLocalParaMs(f.elements.prazo.value);
      if (Number.isNaN(prazo)) { erroBox.textContent = 'Informe o prazo.'; return; }
      var payload;
      if (travado) {
        payload = { id: b.id, nome: f.elements.nome.value, prazo: prazo };
      } else {
        var valor = U.reaisParaCentavos(f.elements.valor.value);
        if (Number.isNaN(valor)) { erroBox.textContent = 'Valor inválido. Use o formato 60,00.'; return; }
        payload = {
          nome: f.elements.nome.value, modalidade: f.elements.modalidade.value,
          qtdNumeros: Number(f.elements.qtdNumeros.value), valorCotaCentavos: valor,
          jogosPorCota: Number(f.elements.jogosPorCota.value), limiteCotas: Number(f.elements.limiteCotas.value),
          maxCotasPorPessoa: Number(f.elements.maxCotasPorPessoa.value), prazo: prazo
        };
        if (b) payload.id = b.id;
      }
      executar(async function () {
        await API.chamar(b ? 'admin.boloes.editar' : 'admin.boloes.criar', payload);
        aviso(b ? 'Bolão atualizado.' : 'Bolão criado como rascunho. Use "Abrir inscrições" quando estiver pronto.');
        estado.edicao = null;
        await recarregarBoloes();
      }, f.querySelector('button[type=submit]'), function (m) { erroBox.textContent = m; });
    }
    return form;
  }

  // ---------- participante: carrossel, menu lateral, volante, PIX ----------
  var ROTULO_COTA = { rascunho: 'Em andamento', completa: 'Bolão escolhido', aguardando_pagamento: 'Aguardando aprovação', confirmada: 'Confirmada' };
  var CLASSE_COTA = { rascunho: 'rascunho', completa: 'aberto', aguardando_pagamento: 'rascunho', confirmada: 'aberto' };

  function aleatorio() {
    var a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }

  function modalidadeDe(b) {
    return estado.modalidades.filter(function (m) { return m.id === b.modalidade; })[0] || { maximo: 60, minimo: 1 };
  }

  function bolaoAtual() {
    var sel = estado.abertos.filter(function (b) { return b.id === estado.bolaoSel; })[0];
    return sel || estado.abertos[0] || null;
  }

  function cotaDe(b) {
    return estado.minhasCotas.filter(function (c) { return c.bolaoId === b.id; })[0] || null;
  }

  function contagem(prazo) {
    return h('span', { class: 'contagem', 'data-prazo': prazo }, U.formatarRestante(prazo - API.agoraServidor()));
  }

  function atualizarContagens() {
    var els = document.querySelectorAll('.contagem[data-prazo]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = U.formatarRestante(Number(els[i].getAttribute('data-prazo')) - API.agoraServidor());
    }
  }

  function selecionarBolao(id) {
    estado.bolaoSel = id;
    estado.volante = { sel: [], editando: null };
    estado.verMinhas = false;
    estado.menuAberto = false;
    renderPainel();
  }

  function heroBanner(b) {
    return h('section', { class: 'hero tema-' + b.modalidade },
      h('div', { class: 'hero-texto' },
        h('span', { class: 'hero-selo' }, b.modalidadeNome),
        h('h2', {}, b.nome),
        h('p', {}, b.jogosPorCota + ' jogos de ' + b.qtdNumeros + ' números · cota de ' + U.centavosParaReais(b.valorCotaCentavos))),
      h('div', { class: 'hero-info' },
        h('div', {}, h('small', {}, 'Fecha em'), h('strong', {}, contagem(b.prazo))),
        h('div', {}, h('small', {}, 'Vagas'), h('strong', {}, b.vagas + ' de ' + b.limiteCotas))));
  }

  /** Carrossel: os bolões abertos e os banners do administrador, na velocidade que ele definiu. */
  function carrossel(b) {
    var cfg = estado.pub;
    var slides = [];
    var inicial = 0;
    if (cfg.carrossel.incluirBoloes) {
      estado.abertos.forEach(function (x) {
        if (b && x.id === b.id) inicial = slides.length;
        var hero = heroBanner(x);
        if (!b || x.id !== b.id) hero.appendChild(h('button', { class: 'hero-botao', onclick: function () { selecionarBolao(x.id); } }, 'Participar deste bolão'));
        slides.push({ el: hero, rotulo: x.nome });
      });
    }
    cfg.banners.forEach(function (bn) { slides.push({ el: Car.slideBanner(bn), rotulo: bn.titulo || 'banner' }); });
    if (slides.length === 0) {
      slides.push({ el: h('section', { class: 'hero tema-neutro' }, h('div', { class: 'hero-texto' },
        h('h2', {}, 'Bem-vindo ao Bolão da Sorte'), h('p', {}, 'Quando houver um bolão aberto, ele aparece aqui.'))), rotulo: 'boas-vindas' });
    }
    return Car.criar({ slides: slides, segundos: cfg.carrossel.segundos, inicial: inicial });
  }

  function menuLateral() {
    var atual = bolaoAtual();
    return h('aside', { class: 'menu' + (estado.menuAberto ? ' aberto' : ''), id: 'menu-lateral', 'aria-label': 'Menu de bolões' },
      h('button', { class: 'menu-fechar link', onclick: function () { estado.menuAberto = false; renderPainel(); } }, 'Fechar'),
      h('nav', { class: 'menu-nav' },
        h('button', { class: !estado.verMinhas ? 'ativa' : '', onclick: function () { estado.verMinhas = false; estado.menuAberto = false; renderPainel(); } }, 'Bolões abertos'),
        h('button', { class: estado.verMinhas ? 'ativa' : '', onclick: function () { estado.verMinhas = true; estado.menuAberto = false; renderPainel(); } },
          'Minhas cotas' + (estado.minhasCotas.length ? ' (' + estado.minhasCotas.length + ')' : '')),
        h('a', { class: 'botao-link', href: 'publico.html', target: '_blank', rel: 'noopener' }, 'Jogos confirmados')),
      h('h3', {}, 'Bolões abertos'),
      estado.abertos.length === 0 ? h('p', { class: 'vazio' }, 'Nenhum no momento.')
        : estado.abertos.map(function (b) {
          var minha = cotaDe(b);
          return h('button', { class: 'mini tema-' + b.modalidade + (atual && atual.id === b.id && !estado.verMinhas ? ' atual' : ''),
            'aria-current': atual && atual.id === b.id && !estado.verMinhas ? 'true' : null, onclick: function () { selecionarBolao(b.id); } },
            h('span', { class: 'mini-mod' }, b.modalidadeNome),
            h('strong', {}, b.nome),
            h('span', { class: 'mini-linha' }, U.centavosParaReais(b.valorCotaCentavos) + ' · ' + b.vagas + ' vagas'),
            h('span', { class: 'mini-linha' }, 'Fecha em ', contagem(b.prazo)),
            minha ? h('span', { class: 'mini-selo' }, ROTULO_COTA[minha.status] || minha.status) : null);
        }));
  }

  function telaParticipar() {
    var b = bolaoAtual();
    var principal;
    if (estado.verMinhas) principal = telaMinhasCotas();
    else principal = h('div', { class: 'vista' + (b ? ' tema-' + b.modalidade : '') }, carrossel(b), b ? conteudoBolao(b) : h('p', { class: 'vazio' }, 'Nenhum bolão aberto no momento.'));
    return h('div', { class: 'layout-participar' },
      h('div', { class: 'principal' },
        h('button', { class: 'abrir-menu', onclick: function () { estado.menuAberto = true; renderPainel(); } }, '☰ Bolões e menu'),
        principal),
      menuLateral(),
      estado.menuAberto ? h('div', { class: 'fundo-menu', onclick: function () { estado.menuAberto = false; renderPainel(); } }) : null);
  }

  function telaMinhasCotas() {
    return h('div', { class: 'vista' }, h('h2', {}, 'Minhas cotas'),
      estado.minhasCotas.length === 0 ? h('p', { class: 'vazio' }, 'Você ainda não iniciou nenhuma cota.')
        : estado.minhasCotas.map(function (c) {
          var b = estado.abertos.filter(function (x) { return x.id === c.bolaoId; })[0];
          return h('article', { class: 'cartao' },
            h('div', { class: 'cartao-topo' }, h('h3', {}, b ? b.nome : 'Bolão'),
              h('span', { class: 'selo ' + (CLASSE_COTA[c.status] || '') }, ROTULO_COTA[c.status] || c.status)),
            h('p', { class: 'sub' }, c.jogos.length + (b ? ' de ' + b.jogosPorCota : '') + ' jogos montados'),
            b ? h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: function () { selecionarBolao(b.id); } }, 'Abrir')) : null);
        }));
  }

  function conteudoBolao(b) {
    var cota = cotaDe(b);
    if (!cota) {
      return h('article', { class: 'cartao' },
        h('h3', {}, 'Participe deste bolão'),
        h('p', {}, 'Você monta ' + b.jogosPorCota + ' jogos de ' + b.qtdNumeros + ' números. Com os jogos escolhidos, gere o PIX, pague e aguarde o administrador aprovar a sua participação.'),
        b.vagas === 0 ? h('p', { class: 'erro-form' }, 'Todas as cotas já foram preenchidas.') : null,
        h('div', { class: 'acoes' }, h('button', { class: 'primario', disabled: b.vagas === 0, onclick: function (ev) {
          executar(async function () {
            var nova = await API.chamar('cotas.criar', { bolaoId: b.id });
            estado.minhasCotas.push(nova);
            estado.abertos = await API.chamar('boloes.abertos', {});
            estado.volante = { sel: [], editando: null };
            renderPainel();
          }, ev.target);
        } }, 'Iniciar minha cota')));
    }
    return volanteCota(b, cota);
  }

  function substituirCota(nova) {
    estado.minhasCotas = estado.minhasCotas.map(function (c) { return c.id === nova.id ? nova : c; });
  }

  function listaJogos(cota, editavel) {
    var v = estado.volante;
    return h('section', { class: 'cartao' },
      h('h3', {}, 'Seus jogos'),
      cota.jogos.length === 0 ? h('p', { class: 'vazio' }, 'Nenhum jogo ainda. Escolha os números acima e adicione.')
        : h('ol', { class: 'jogos' }, cota.jogos.map(function (j, i) {
          return h('li', { class: v.editando === j.id ? 'em-edicao' : '' },
            h('span', { class: 'jogo-n' }, 'Jogo ' + (i + 1)),
            h('span', { class: 'chips' }, j.numeros.map(function (n) { return h('span', { class: 'chip' }, n < 10 ? '0' + n : String(n)); })),
            editavel ? h('span', { class: 'jogo-acoes' },
              h('button', { onclick: function () { estado.volante = { sel: j.numeros.slice(), editando: j.id }; renderPainel(); window.scrollTo(0, 0); } }, 'Editar'),
              h('button', { class: 'perigo', onclick: function (ev) {
                executar(async function () {
                  substituirCota(await API.chamar('jogos.remover', { cotaId: cota.id, jogoId: j.id }));
                  if (estado.volante.editando === j.id) estado.volante = { sel: [], editando: null };
                  renderPainel();
                }, ev.target);
              } }, 'Remover')) : null);
        })));
  }

  function conteudoPix(d) {
    return [
      h('p', {}, 'Valor a pagar: ', h('strong', {}, U.centavosParaReais(d.valorCentavos)), d.nomeRecebedor ? ' · Recebedor: ' + d.nomeRecebedor : ''),
      d.qrImagemId ? h('div', { class: 'previa' }, Img.elemento(d.qrImagemId, 'QR Code do PIX', 'pix-qr-img')) : null,
      d.copiaECola ? h('div', {},
        h('label', { class: 'campo' }, h('span', {}, 'PIX copia e cola'), h('textarea', { class: 'codigo-pix', readonly: true, rows: 4 }, d.copiaECola)),
        h('div', { class: 'acoes' }, h('button', { onclick: function () { window.BolaoUI.copiar(d.copiaECola); } }, 'Copiar código PIX'))) : null,
      d.instrucoes ? h('p', { class: 'nota' }, d.instrucoes) : null
    ];
  }

  function painelPix(b, cota) {
    var corpo = h('div', {}, h('p', { class: 'sub' }, 'Carregando dados do PIX…'));
    var pronto = estado.pixInfo[cota.id] ? Promise.resolve(estado.pixInfo[cota.id])
      : API.chamar('cotas.pix', { cotaId: cota.id }).then(function (d) { estado.pixInfo[cota.id] = d; return d; });
    pronto.then(function (d) { corpo.replaceChildren.apply(corpo, conteudoPix(d)); })
      .catch(function (e) { corpo.textContent = e.message; });
    return h('section', { class: 'cartao pix' },
      h('h3', {}, 'Aguardando aprovação do administrador'),
      h('p', { class: 'sub' }, 'Seus jogos estão travados. Pague o PIX abaixo; quando o administrador confirmar o pagamento, sua participação é aprovada e seus jogos aparecem na página pública.'),
      corpo);
  }

  function painelConfirmada() {
    return h('div', { class: 'destaque' }, h('strong', {}, 'Participação confirmada! '),
      'Seus jogos estão aprovados. ', h('a', { href: 'publico.html', target: '_blank', rel: 'noopener' }, 'Ver a página pública dos jogos'));
  }

  function volanteCota(b, cota) {
    var mod = modalidadeDe(b);
    var v = estado.volante;
    var total = b.jogosPorCota;
    var faltam = total - cota.jogos.length;
    var editavel = cota.status === 'rascunho' || cota.status === 'completa';
    var editando = editavel && !!v.editando;
    var mostrarVolante = editavel && (faltam > 0 || editando);
    var partes = [];

    partes.push(h('div', { class: 'progresso' },
      h('div', { class: 'progresso-texto' }, h('strong', {}, cota.jogos.length + ' de ' + total), ' jogos montados',
        h('span', { class: 'selo ' + (CLASSE_COTA[cota.status] || ''), style: 'margin-left:.6rem' }, ROTULO_COTA[cota.status] || cota.status)),
      h('div', { class: 'barra', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': cota.jogos.length },
        h('div', { style: 'width:' + Math.round(cota.jogos.length / total * 100) + '%' }))));

    if (cota.status === 'confirmada') partes.push(painelConfirmada());
    else if (cota.status === 'aguardando_pagamento') partes.push(painelPix(b, cota));
    else {
      if (cota.observacao) {
        partes.push(h('div', { class: 'aviso-reprovado', role: 'alert' }, h('strong', {}, 'O administrador não aprovou o pagamento: '), cota.observacao + ' ', 'Corrija o que for preciso e gere o PIX de novo.'));
      }
      if (cota.status === 'completa' && !editando) {
        partes.push(h('div', { class: 'destaque' }, h('strong', {}, 'Bolão escolhido! '),
          'Os ' + total + ' jogos estão prontos. Revise abaixo: ao gerar o PIX, os jogos ficam travados e a cota segue para a aprovação do administrador.',
          h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: function (ev) {
            if (!window.confirm('Gerar o PIX envia a sua cota para aprovação e trava os jogos. Continuar?')) return;
            executar(async function () {
              var r = await API.chamar('cotas.gerarPix', { cotaId: cota.id });
              substituirCota(r.cota);
              estado.pixInfo[cota.id] = r.pix;
              aviso('PIX gerado. Aguarde a aprovação do administrador.');
              renderPainel();
              window.scrollTo(0, 0);
            }, ev.target);
          } }, 'Gerar PIX e enviar para aprovação'))));
      }
    }

    if (mostrarVolante) {
      var contador = h('p', { class: 'volante-contador', 'aria-live': 'polite' });
      var btnAdd = h('button', { class: 'primario', disabled: true }, editando ? 'Salvar alteração' : 'Adicionar à cota');
      var erroBox = h('p', { class: 'erro-form', role: 'alert' });
      var botoes = {};

      var atualizar = function () {
        var n = v.sel.length;
        contador.textContent = n + ' de ' + b.qtdNumeros + ' números escolhidos' + (n ? ': ' + v.sel.slice().sort(function (x, y) { return x - y; }).join(' · ') : '');
        btnAdd.disabled = n !== b.qtdNumeros;
        Object.keys(botoes).forEach(function (k) {
          var marcado = v.sel.indexOf(Number(k)) !== -1;
          botoes[k].className = 'bola' + (marcado ? ' marcada' : '');
          botoes[k].setAttribute('aria-pressed', String(marcado));
        });
      };

      var grade = h('div', { class: 'volante', style: 'grid-template-columns: repeat(' + U.colunasVolante(mod.maximo) + ', 1fr)', role: 'group', 'aria-label': 'Números de 1 a ' + mod.maximo });
      for (var n = mod.minimo; n <= mod.maximo; n++) {
        (function (num) {
          var bt = h('button', { type: 'button', class: 'bola', 'aria-pressed': 'false', 'aria-label': 'Número ' + num, onclick: function () {
            erroBox.textContent = '';
            var i = v.sel.indexOf(num);
            if (i !== -1) v.sel.splice(i, 1);
            else if (v.sel.length >= b.qtdNumeros) { erroBox.textContent = 'Este jogo já tem ' + b.qtdNumeros + ' números. Desmarque um para trocar.'; return; }
            else v.sel.push(num);
            atualizar();
          } }, String(num < 10 ? '0' + num : num));
          botoes[num] = bt;
          grade.appendChild(bt);
        })(n);
      }

      btnAdd.addEventListener('click', function () {
        var payload = { cotaId: cota.id, numeros: v.sel.slice().sort(function (x, y) { return x - y; }) };
        if (v.editando) payload.jogoId = v.editando;
        executar(async function () {
          substituirCota(await API.chamar('jogos.salvar', payload));
          estado.volante = { sel: [], editando: null };
          aviso(editando ? 'Jogo atualizado.' : 'Jogo adicionado.');
          renderPainel();
        }, btnAdd, function (m) { erroBox.textContent = m; });
      });

      partes.push(h('section', { class: 'cartao' },
        h('h3', {}, editando ? 'Editando um jogo' : 'Jogo ' + (cota.jogos.length + 1) + ' de ' + total),
        h('p', { class: 'sub' }, 'Escolha ' + b.qtdNumeros + ' números entre ' + mod.minimo + ' e ' + mod.maximo + '.'),
        contador, grade, erroBox,
        h('div', { class: 'acoes' },
          h('button', { type: 'button', onclick: function () {
            v.sel = U.sortearNumeros(mod.maximo, b.qtdNumeros, aleatorio);
            erroBox.textContent = '';
            atualizar();
          } }, 'Surpresinha'),
          h('button', { type: 'button', onclick: function () { v.sel = []; erroBox.textContent = ''; atualizar(); } }, 'Limpar'),
          editando ? h('button', { type: 'button', onclick: function () { estado.volante = { sel: [], editando: null }; renderPainel(); } }, 'Cancelar edição') : null,
          btnAdd)));
      atualizar();
    }

    partes.push(listaJogos(cota, editavel));

    if (editavel) {
      partes.push(h('div', { class: 'acoes rodape-cota' }, h('button', { class: 'perigo', onclick: function (ev) {
        if (!window.confirm('Desistir desta cota? Os jogos montados serão apagados e a vaga será liberada.')) return;
        executar(async function () {
          await API.chamar('cotas.cancelar', { cotaId: cota.id });
          estado.minhasCotas = estado.minhasCotas.filter(function (c) { return c.id !== cota.id; });
          estado.abertos = await API.chamar('boloes.abertos', {});
          estado.volante = { sel: [], editando: null };
          aviso('Cota cancelada.');
          renderPainel();
        }, ev.target);
      } }, 'Desistir desta cota')));
    }

    return h('div', { class: 'volante-tela' }, partes);
  }

  // ---------- convites ----------
  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      aviso('Copiado.');
    } catch (e) {
      aviso('Não foi possível copiar sozinho. Selecione o texto e copie.', true);
    }
  }

  var ROTULO_CONVITE = { ativo: 'Ativo', usado: 'Usado', revogado: 'Revogado', expirado: 'Expirado' };

  function telaConvites() {
    var nc = estado.novoConvite;
    var link = nc ? location.origin + location.pathname + '?convite=' + encodeURIComponent(nc.codigo) : '';
    var selPapel = h('select', { name: 'papel' }, h('option', { value: 'participante' }, 'Participante'), h('option', { value: 'admin' }, 'Administrador'));
    var inHoras = h('input', { name: 'horas', type: 'number', min: 1, max: 720, step: 1, value: 72, required: true });

    return h('section', {},
      h('h2', {}, 'Convites'),
      h('form', { class: 'form linha', onsubmit: function (ev) {
        ev.preventDefault();
        executar(async function () {
          var r = await API.chamar('admin.convites.criar', { papel: selPapel.value, validadeHoras: Number(inHoras.value) });
          estado.novoConvite = r;
          estado.convites = await API.chamar('admin.convites.listar', {});
          renderPainel();
        }, ev.target.querySelector('button'));
      } },
        campo('Quem vai entrar', selPapel), campo('Validade (horas)', inHoras),
        h('button', { class: 'primario', type: 'submit' }, 'Gerar convite')),
      nc ? h('div', { class: 'destaque' },
        h('p', {}, h('strong', {}, 'Convite gerado. Copie agora: o código não será mostrado de novo.')),
        h('input', { class: 'codigo', readonly: true, 'aria-label': 'Código do convite', value: nc.codigo }),
        h('div', { class: 'acoes' },
          h('button', { onclick: function () { copiar(nc.codigo); } }, 'Copiar código'),
          h('button', { onclick: function () { copiar(link); } }, 'Copiar link de cadastro')),
        h('p', { class: 'sub' }, 'Vale até ' + U.formatarData(nc.expiraEm) + ' e só pode ser usado uma vez.')) : null,
      h('h3', {}, 'Convites emitidos'),
      estado.convites.length === 0 ? h('p', { class: 'vazio' }, 'Nenhum convite ainda.')
        : h('ul', { class: 'lista' }, estado.convites.slice().sort(function (a, b) { return b.criadoEm - a.criadoEm; }).map(function (c) {
          return h('li', {},
            h('span', { class: 'selo ' + c.status }, ROTULO_CONVITE[c.status] || c.status),
            h('span', {}, (c.papel === 'admin' ? 'Administrador' : 'Participante') + ' · criado em ' + U.formatarData(c.criadoEm)),
            c.status === 'ativo' ? h('button', { class: 'perigo', onclick: function (ev) {
              executar(async function () {
                await API.chamar('admin.convites.revogar', { id: c.id });
                estado.convites = await API.chamar('admin.convites.listar', {});
                renderPainel();
              }, ev.target);
            } }, 'Revogar') : null);
        })));
  }

  // ---------- início ----------
  async function iniciar() {
    var cfg = window.BOLAO_CONFIG || {};
    if (cfg.API_URL) carregarPublico();
    var params = new URLSearchParams(location.search);
    var conv = params.get('convite');
    if (conv) {
      estado.codigoConvite = conv;
      estado.abaAcesso = 'cadastrar';
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignora */ }
    }
    if (!cfg.API_URL) {
      montar(h('main', { class: 'central' }, h('h1', {}, 'Configuração pendente'),
        h('p', {}, 'Edite o arquivo frontend/config.js e informe a URL do app da Web do Apps Script (termina em /exec).')));
      return;
    }
    if (API.lerToken()) {
      try {
        estado.usuario = await API.chamar('eu', {});
        await carregarDados();
        renderPainel();
        return;
      } catch (e) {
        if (e.sessaoInvalida) {
          API.guardarToken('');
        } else {
          montar(h('main', { class: 'central' }, h('h1', {}, 'Sem conexão'), h('p', {}, e.message),
            h('button', { class: 'primario', onclick: function () { location.reload(); } }, 'Tentar de novo')));
          return;
        }
      }
    }
    renderAcesso();
  }

  setInterval(atualizarContagens, 30000);
  iniciar();
})();
