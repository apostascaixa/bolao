/** Resultados das loterias: cartões na coluna da esquerda e faixa rotativa (nav) abaixo do banner do topo. */
(function (root) {
  'use strict';
  var h = root.BolaoUI.h;
  var ativo = false;
  var mostrando = false;
  var timerResumo = null;
  var timerAtualiza = null;

  function $(id) { return document.getElementById(id); }

  function textoGanhadores(l) {
    var g = Number(l.ganhadores) || 0;
    if (g > 0) return g + (g === 1 ? ' ganhador' : ' ganhadores');
    return 'ACUMULADA';
  }

  function brl(v) {
    var n = Number(v);
    if (!(n > 0)) return '';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  function cartao(l) {
    var prox = brl(l.proximoPremio);
    return h('article', { class: 'lot-card lot-' + String(l.chave).replace(/[^a-z]/g, '') },
      h('h3', {}, l.nome),
      h('small', {}, 'Concurso ' + l.concurso + (l.data ? ' · ' + l.data : '')),
      h('div', { class: 'lot-bolas' }, l.dezenas.map(function (n) { return h('span', { class: 'lot-bola' }, n); })),
      h('div', { class: 'lot-status' }, textoGanhadores(l)),
      prox ? h('small', {}, 'Próximo' + (l.proximoData ? ' (' + l.proximoData + ')' : '') + ': ' + prox) : null);
  }

  function pararResumo() { if (timerResumo) { clearInterval(timerResumo); timerResumo = null; } }

  function resumo(lista) {
    var faixa = $('faixa-resumo');
    pararResumo();
    if (!faixa) return;
    var frases = lista.map(function (l) { return l.nome + ' · Concurso ' + l.concurso + ': ' + textoGanhadores(l); });
    var reduzir = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    faixa.hidden = false;
    if (reduzir || frases.length < 2) { faixa.textContent = frases.join('   ·   '); return; }
    var i = 0;
    faixa.textContent = frases[0];
    timerResumo = setInterval(function () {
      if (!document.body.contains(faixa)) return pararResumo();
      i = (i + 1) % frases.length;
      faixa.textContent = frases[i];
    }, 4000);
  }

  function esconder() {
    var lado = $('slot-resultados');
    var faixa = $('faixa-resumo');
    pararResumo();
    mostrando = false;
    if (lado) { lado.hidden = true; lado.replaceChildren(); }
    if (faixa) { faixa.hidden = true; faixa.textContent = ''; }
    if (root.BolaoSlots) root.BolaoSlots.layout();
  }

  async function carregar() {
    try {
      var d = await root.BolaoApi.chamar('publico.loterias', {});
      if (!ativo) return;
      if (!d || !d.ativo || !d.loterias || d.loterias.length === 0) return esconder();
      var lado = $('slot-resultados');
      if (lado) {
        lado.replaceChildren.apply(lado, [h('h2', { class: 'lado-titulo' }, 'Últimos resultados')].concat(d.loterias.map(cartao)));
        lado.hidden = false;
      }
      resumo(d.loterias);
      mostrando = true;
      if (root.BolaoSlots) root.BolaoSlots.layout();
    } catch (e) {
      if (!mostrando) esconder(); // sem dados: o site segue normal, só sem o banner
    }
  }

  function definirAtivo(flag) {
    if (flag === ativo) return;
    ativo = flag;
    if (timerAtualiza) { clearInterval(timerAtualiza); timerAtualiza = null; }
    if (!ativo) return esconder();
    carregar();
    timerAtualiza = setInterval(carregar, 30 * 60 * 1000);
  }

  root.BolaoLoterias = { definirAtivo: definirAtivo };
})(window);
