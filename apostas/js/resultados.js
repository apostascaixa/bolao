(function () {
  'use strict';
  var API = (window.BOLAO_CONFIG || {}).API_URL;
  var boxCards = document.getElementById('rl-resultados');
  var boxResumo = document.getElementById('rl-resumo');
  if (!API || !boxCards || !boxResumo) return;

  var timer = null;

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }

  function brl(v) {
    var n = Number(v);
    if (!n) return '';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  function textoGanhadores(l) {
    var g = Number(l.ganhadores) || 0;
    if (g > 0) return g + (g === 1 ? ' ganhador' : ' ganhadores');
    return 'ACUMULADA';
  }

  function desenharCard(l) {
    var card = el('article', 'rl-card');
    card.style.background = l.cor;
    card.appendChild(el('h3', '', l.nome));
    card.appendChild(el('small', '', 'Concurso ' + l.concurso + ' · ' + l.data));
    var bolas = el('div', 'rl-bolas');
    (l.dezenas || []).forEach(function (n) { bolas.appendChild(el('span', 'rl-bola', n)); });
    card.appendChild(bolas);
    card.appendChild(el('div', 'rl-status', textoGanhadores(l)));
    var prox = brl(l.proximoPremio);
    if (prox) card.appendChild(el('small', '', 'Próximo (' + (l.proximoData || '—') + '): ' + prox));
    return card;
  }

  function iniciarResumo(lista) {
    var frases = lista.map(function (l) {
      return l.nome + ' · Concurso ' + l.concurso + ': ' + textoGanhadores(l);
    });
    var i = 0;
    boxResumo.hidden = false;
    boxResumo.textContent = frases[0];
    if (timer) clearInterval(timer);
    if (frases.length > 1) {
      timer = setInterval(function () {
        i = (i + 1) % frases.length;
        boxResumo.textContent = frases[i];
      }, 4000);
    }
  }

  function carregar() {
    var url = API + (API.indexOf('?') === -1 ? '?' : '&') + 'acao=resultadosLoterias';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.loterias || !d.loterias.length) throw new Error('sem dados');
        boxCards.textContent = '';
        d.loterias.forEach(function (l) { boxCards.appendChild(desenharCard(l)); });
        iniciarResumo(d.loterias);
      })
      .catch(function () {
        boxCards.textContent = 'Resultados indisponíveis no momento.';
        boxResumo.hidden = true;
      });
  }

  carregar();
  setInterval(carregar, 30 * 60 * 1000);
})();
