/**
 * Relógio de contagem regressiva em TODAS as páginas (fundo preto, números dourados).
 * Mostra o que o administrador salvou em Configurações; se o servidor não responder, usa o padrão.
 * Também dá para definir CONTAGEM no config.js.
 */
(function () {
  'use strict';
  var UI = window.BolaoUI, API = window.BolaoApi;
  if (!UI || !API) return;
  if (window.__contagem) return;
  window.__contagem = true;
  var h = UI.h;
  var CFG = window.BOLAO_CONFIG || {};
  var PADRAO = Object.assign({ titulo: 'MEGA SENA DA VIRADA +R$1 BILHÃO', data: '2027-01-01T11:00:00-03:00' }, CFG.CONTAGEM || {});

  function dois(n) { return n < 10 ? '0' + n : String(n); }

  function montarContagem() {
    var host = document.getElementById('contagem');
    if (!host) {
      host = document.createElement('section');
      host.id = 'contagem';
      host.setAttribute('aria-label', 'Contagem regressiva do sorteio');
      document.body.insertBefore(host, document.body.firstChild);
    }
    host.replaceChildren(); // se houver um relógio estático antigo, este assume

    var alvo = NaN;
    var nums = {};
    function caixa(chave, rotulo) {
      nums[chave] = h('span', { class: 'cd-num' }, '--');
      return h('div', { class: 'cd-caixa' }, nums[chave], h('span', { class: 'cd-rotulo' }, rotulo));
    }
    var sep = function () { return h('span', { class: 'cd-sep', 'aria-hidden': 'true' }, ':'); };
    var titulo = h('h2', { class: 'cd-titulo' }, PADRAO.titulo);
    var dataEl = h('p', { class: 'cd-data' }, '');
    var fim = h('p', { class: 'cd-fim', hidden: true }, 'O sorteio já foi realizado.');
    host.appendChild(h('div', { class: 'contagem', role: 'timer' }, titulo,
      h('div', { class: 'cd-relogio' }, caixa('dias', 'DIAS'), sep(), caixa('horas', 'HORAS'), sep(), caixa('min', 'MINUTOS'), sep(), caixa('seg', 'SEGUNDOS')),
      dataEl, fim));

    function tick() {
      if (isNaN(alvo)) return;
      var falta = Math.max(0, alvo - API.agoraServidor());
      var s = Math.floor(falta / 1000);
      nums.dias.textContent = dois(Math.floor(s / 86400));
      nums.horas.textContent = dois(Math.floor((s % 86400) / 3600));
      nums.min.textContent = dois(Math.floor((s % 3600) / 60));
      nums.seg.textContent = dois(s % 60);
      fim.hidden = falta > 0;
    }
    function aplicar(cfg) {
      if (cfg.ativo === false) { host.hidden = true; alvo = NaN; return; }
      host.hidden = false;
      titulo.textContent = cfg.titulo;
      alvo = new Date(cfg.data).getTime();
      dataEl.textContent = isNaN(alvo) ? '' : 'Sorteio: ' + new Date(alvo).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' (horário de Brasília)';
      tick();
    }

    var padrao = { titulo: PADRAO.titulo, data: PADRAO.data, ativo: true };
    setInterval(tick, 1000);
    if (!CFG.API_URL) { aplicar(padrao); return; }
    API.chamar('publico.contagem', {}).then(function (r) {
      aplicar(r && (r.configurado || r.ativo === false) ? r : padrao);
    }).catch(function () { aplicar(padrao); }); // sem o servidor (ou sem o bloco Contagem.gs): vale o padrão
  }

  montarContagem();
})();
