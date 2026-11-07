/** Página pública: jogos dos participantes aprovados (nome abreviado, sem dados de contato). */
(function () {
  'use strict';
  var h = window.BolaoUI.h;
  var U = window.BolaoUtil;
  var API = window.BolaoApi;
  var Car = window.BolaoCarrossel;
  var raiz = document.getElementById('app');
  var estado = { boloes: [], sel: null, pub: null };

  function topoSite() {
    var alvo = document.getElementById('topo-site');
    alvo.replaceChildren();
    var el = estado.pub ? Car.topo(estado.pub.topo) : null;
    if (el) alvo.appendChild(el);
  }

  function cartaoBolao(b) {
    return h('section', { class: 'hero tema-' + b.modalidade },
      h('div', { class: 'hero-texto' },
        h('span', { class: 'hero-selo' }, b.modalidadeNome),
        h('h2', {}, b.nome),
        h('p', {}, b.jogosPorCota + ' jogos de ' + b.qtdNumeros + ' números · cota de ' + U.centavosParaReais(b.valorCotaCentavos))),
      h('div', { class: 'hero-info' },
        h('div', {}, h('small', {}, 'Cotas confirmadas'), h('strong', {}, b.confirmadas + ' de ' + b.limiteCotas))));
  }

  function linha(rotulo, valor) {
    return h('div', { class: 'recibo-linha' }, h('span', {}, rotulo), h('span', {}, valor));
  }

  /** Comprovante interno do grupo, no formato de recibo: um jogo por linha, com letra. */
  function recibo(b, p) {
    var registrado = b.registradoEm > 0;
    return h('article', { class: 'recibo tema-' + b.modalidade, 'aria-label': 'Comprovante de ' + p.nome },
      h('div', { class: 'recibo-titulo' }, b.modalidadeNome.toUpperCase()),
      h('div', { class: 'recibo-sub' }, b.nome.toUpperCase()),
      h('hr'),
      linha('COTA ' + p.cotaNumero + '/' + b.limiteCotas, p.codigo),
      linha('CONFIRMADA', p.confirmadaEm ? U.dataHora(p.confirmadaEm) : '-'),
      linha('CONCURSO', b.concurso ? String(b.concurso) : 'A DEFINIR'),
      h('hr'),
      p.jogos.map(function (j, i) {
        return h('div', { class: 'recibo-jogo' }, h('span', { class: 'recibo-letra' }, U.letraJogo(i)),
          h('span', { class: 'recibo-nums' }, j.map(U.dezena).join('  ')));
      }),
      h('hr'),
      linha('VALOR DA COTA', U.centavosParaReais(b.valorCotaCentavos)),
      linha('PARTICIPANTE', p.nome.toUpperCase()),
      h('hr'),
      h('div', { class: 'recibo-registro ' + (registrado ? 'ok' : 'pendente') },
        registrado ? '✔ REGISTRADO OFICIALMENTE EM ' + U.dataCurta(b.registradoEm) : 'AGUARDANDO REGISTRO OFICIAL'),
      h('div', { class: 'recibo-aviso' }, 'Comprovante interno do grupo. Não substitui o recibo oficial da lotérica.'));
  }

  function render() {
    Car.parar();
    var b = estado.boloes.filter(function (x) { return x.id === estado.sel; })[0] || estado.boloes[0];
    var banners = estado.pub ? estado.pub.banners : [];
    montar(
      h('header', { class: 'topo' }, h('strong', {}, 'Bolão da Sorte · Jogos confirmados'),
        h('a', { class: 'botao-link claro', href: 'index.html' }, 'Entrar no sistema')),
      h('main', { class: 'painel' },
        banners.length ? Car.criar({ slides: banners.map(function (bn) { return { el: Car.slideBanner(bn), rotulo: bn.titulo || 'banner' }; }), segundos: estado.pub.carrossel.segundos }) : null,
        estado.boloes.length > 1 ? h('div', { class: 'abas', role: 'tablist' }, estado.boloes.map(function (x) {
          var ativa = b && x.id === b.id;
          return h('button', { role: 'tab', 'aria-selected': String(ativa), class: ativa ? 'ativa' : '', onclick: function () { estado.sel = x.id; render(); } }, x.nome);
        })) : null,
        b ? [cartaoBolao(b),
          h('div', { class: 'acoes' }, h('button', { onclick: carregar }, 'Atualizar')),
          b.participantes.length === 0 ? h('p', { class: 'vazio' }, 'Nenhum participante confirmado ainda.') : h('div', { class: 'recibos' }, b.participantes.map(function (p) { return recibo(b, p); }))]
          : h('p', { class: 'vazio' }, 'Ainda não há jogos publicados.'),
        h('p', { class: 'aviso-legal' }, 'Este sistema organiza o grupo. Não é um canal oficial de apostas da CAIXA.')));
  }

  function montar() {
    raiz.replaceChildren.apply(raiz, Array.prototype.slice.call(arguments));
  }

  async function carregar() {
    try {
      var r = await Promise.all([API.chamar('publico.config', {}), API.chamar('publico.jogos', {})]);
      estado.pub = r[0];
      estado.boloes = r[1];
      topoSite();
      render();
    } catch (e) {
      montar(h('main', { class: 'central' }, h('h1', {}, 'Não foi possível carregar'), h('p', {}, e.message),
        h('button', { class: 'primario', onclick: carregar }, 'Tentar de novo')));
    }
  }

  var cfg = window.BOLAO_CONFIG || {};
  if (!cfg.API_URL) montar(h('main', { class: 'central' }, h('h1', {}, 'Configuração pendente'), h('p', {}, 'Informe a URL da API em config.js.')));
  else carregar();
})();
