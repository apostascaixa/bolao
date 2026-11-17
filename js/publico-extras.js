/**
 * Acréscimo da página pública: resumo de todos os bilhetes (o relógio agora é js/contagem.js, em todas as páginas).
 * Este script só ACRESCENTA elementos (.resumo): não altera nem remove mais nada da página
 * (laterais, banners, comprovantes, abas). Se o publico.js antigo já tiver um relógio/resumo estático, este assume o lugar dele.
 */
(function () {
  'use strict';
  var UI = window.BolaoUI, U = window.BolaoUtil, API = window.BolaoApi;
  if (!UI || !U || !API) return;
  if (window.__publicoExtras) return; // já carregado (por exemplo, pela linha no HTML e também pelo carregador)
  window.__publicoExtras = true;
  var h = UI.h;
  var CFG = window.BOLAO_CONFIG || {};
  // Padrão; o que o administrador salvar (Configurações) vale mais. Também dá para definir CONTAGEM no config.js.
  var PADRAO = Object.assign({ titulo: 'MEGA SENA DA VIRADA +R$1 BILHÃO', data: '2027-01-01T11:00:00-03:00' }, CFG.CONTAGEM || {});

  function dois(n) { return n < 10 ? '0' + n : String(n); }

  // ---------- resumo de todos os bilhetes ----------
  var dados = null;
  var ultimaBusca = 0;

  function irParaBilhete(b, p) {
    var abas = [].slice.call(document.querySelectorAll('#app [role=tab]'));
    var aba = abas.filter(function (x) { return x.textContent.trim() === b.nome; })[0];
    if (aba) aba.click();
    setTimeout(function () {
      var alvo = document.querySelector('[data-codigo="' + p.codigo + '"]') || document.querySelector('#app .recibo');
      var reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (alvo) alvo.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
    }, 30);
  }

  function construirResumo() {
    var linhas = [];
    var totalJogos = 0;
    dados.forEach(function (b) {
      b.participantes.forEach(function (p) { totalJogos += p.jogos.length; linhas.push({ b: b, p: p }); });
    });
    var comBilhetes = dados.filter(function (b) { return b.participantes.length > 0; });
    function total(valor, rotulo) { return h('div', { class: 'resumo-total' }, h('strong', {}, String(valor)), h('span', {}, rotulo)); }
    return h('section', { class: 'resumo', 'data-extras': '1', 'aria-labelledby': 'titulo-resumo' },
      h('h2', { id: 'titulo-resumo' }, 'Resumo de todos os bilhetes'),
      h('div', { class: 'resumo-totais' }, total(comBilhetes.length, 'bolões com bilhetes'), total(linhas.length, 'bilhetes confirmados'), total(totalJogos, 'jogos')),
      linhas.length === 0 ? h('p', { class: 'vazio' }, 'Nenhum bilhete confirmado ainda.')
        : h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela-bilhetes' },
          h('thead', {}, h('tr', {}, ['Bolão', 'Cota', 'Participante', 'Código', 'Jogos', 'Confirmado em'].map(function (t) { return h('th', { scope: 'col' }, t); }))),
          h('tbody', {}, linhas.map(function (x) {
            var abrir = function () { irParaBilhete(x.b, x.p); };
            return h('tr', { class: 'linha-bilhete', tabindex: 0, title: 'Ver o comprovante', onclick: abrir, onkeydown: function (ev) { if (ev.key === 'Enter') abrir(); } },
              h('td', {}, x.b.nome), h('td', {}, x.p.cotaNumero + '/' + x.b.limiteCotas), h('td', {}, x.p.nome),
              h('td', { class: 'cel-codigo' }, x.p.codigo), h('td', {}, String(x.p.jogos.length)),
              h('td', {}, x.p.confirmadaEm ? U.dataCurta(x.p.confirmadaEm) : '-'));
          })))));
  }

  /** Coloca o resumo no alto do conteúdo (depois do carrossel de banners, se houver). */
  function injetarResumo() {
    if (!dados) return;
    var main = document.querySelector('#app main.painel') || document.querySelector('#app main');
    if (!main || main.querySelector('.resumo[data-extras]')) return;
    var el = construirResumo();
    var antigo = main.querySelector('.resumo');
    if (antigo) { antigo.parentNode.replaceChild(el, antigo); return; }
    var ref = main.querySelector('.carrossel');
    if (ref && ref.parentNode === main) main.insertBefore(el, ref.nextSibling);
    else main.insertBefore(el, main.firstChild);
  }

  function buscar() {
    ultimaBusca = Date.now();
    API.chamar('publico.jogos', {}).then(function (d) { dados = d; var antigo = document.querySelector('.resumo[data-extras]'); if (antigo) antigo.parentNode.removeChild(antigo); injetarResumo(); }).catch(function () { /* sem dados, sem resumo */ });
  }

  function iniciarResumo() {
    var app = document.getElementById('app');
    if (!app || !CFG.API_URL) return;
    // a página redesenha o #app (abas, "Atualizar"): o resumo é recolocado depois de cada redesenho
    new MutationObserver(function () {
      injetarResumo();
      if (Date.now() - ultimaBusca > 30000) buscar();
    }).observe(app, { childList: true });
    buscar();
  }

  iniciarResumo();
})();
