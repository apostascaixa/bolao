(function () {
  'use strict';
  var U = window.BolaoUtil;
  var API = window.BolaoApi;
  var raiz = document.getElementById('app');

  var estado = {
    usuario: null, abaAcesso: 'entrar', codigoConvite: '', aba: 'boloes',
    boloes: [], convites: [], modalidades: [], edicao: null, novoConvite: null
  };

  // ---------- utilitários de tela ----------
  /** Cria elementos sem innerHTML: todo texto entra como texto, nunca como HTML. */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var valor;
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') valor = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    });
    var filhos = Array.prototype.slice.call(arguments, 2);
    (function anexar(lista) {
      lista.forEach(function (f) {
        if (f === null || f === undefined || f === false) return;
        if (Array.isArray(f)) return anexar(f);
        el.appendChild(f.nodeType ? f : document.createTextNode(String(f)));
      });
    })(filhos);
    if (valor !== undefined) el.value = valor;
    return el;
  }

  var timerAviso;
  function aviso(msg, erro) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'visivel' + (erro ? ' erro' : '');
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function () { t.className = ''; }, 5000);
  }

  var contadorDica = 0;
  /** Rótulo + campo; a dica fica fora do <label> e é ligada ao campo por aria-describedby. */
  function campo(rotulo, input, dica) {
    var small = null;
    if (dica) {
      small = (typeof dica === 'string') ? h('small', {}, dica) : dica;
      small.id = 'dica' + (++contadorDica);
      input.setAttribute('aria-describedby', small.id);
    }
    return h('div', { class: 'campo' }, h('label', {}, h('span', {}, rotulo), input), small);
  }

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
    estado.aba = 'boloes';
    estado.edicao = null;
    estado.novoConvite = null;
    await carregarDados();
    renderPainel();
  }

  async function carregarDados() {
    if (estado.usuario.papel === 'admin') {
      var r = await Promise.all([
        API.chamar('admin.boloes.listar', {}), API.chamar('admin.convites.listar', {}), API.chamar('modalidades', {})
      ]);
      estado.boloes = r[0]; estado.convites = r[1]; estado.modalidades = r[2];
    } else {
      estado.boloes = await API.chamar('boloes.abertos', {});
    }
  }

  async function sair() {
    try { await API.chamar('logout', {}); } catch (e) { /* sair localmente mesmo assim */ }
    API.guardarToken('');
    estado.usuario = null;
    estado.abaAcesso = 'entrar';
    renderAcesso();
  }

  // ---------- painel ----------
  function renderPainel() {
    var admin = estado.usuario.papel === 'admin';
    var abas = admin
      ? [['boloes', 'Bolões'], ['convites', 'Convites']]
      : [['boloes', 'Bolões abertos']];
    var conteudo;
    if (estado.aba === 'convites' && admin) conteudo = telaConvites();
    else conteudo = admin ? telaBoloesAdmin() : telaBoloesParticipante();

    montar(
      h('header', { class: 'topo' },
        h('strong', {}, 'Bolão da Sorte'),
        h('span', { class: 'quem' }, estado.usuario.nome + (admin ? ' (administrador)' : '')),
        h('button', { class: 'link', onclick: sair }, 'Sair')),
      h('main', { class: 'painel' },
        abas.length > 1 ? h('div', { class: 'abas', role: 'tablist' }, abas.map(function (a) {
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

  function telaBoloesParticipante() {
    return h('section', {},
      h('h2', {}, 'Bolões abertos'),
      estado.boloes.length === 0
        ? h('p', { class: 'vazio' }, 'Nenhum bolão aberto no momento.')
        : estado.boloes.map(function (b) { return cartaoBolao(b); }),
      h('p', { class: 'sub' }, 'Em breve: escolha dos seus jogos e geração do PIX.'));
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
    estado.boloes = await API.chamar('admin.boloes.listar', {});
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

  iniciar();
})();
