/**
 * Espaços de propaganda: faixa abaixo do banner do topo (navbar), coluna da direita (lateral) e rodapé.
 * Cada espaço é uma imagem com link ou um código de anúncio. O código roda dentro de um quadro isolado
 * (iframe com sandbox, sem acesso à página nem ao login do participante).
 */
(function (root) {
  'use strict';
  var h = root.BolaoUI.h;
  var assinaturas = {};
  var quadros = {};
  var contador = 0;

  function $(id) { return document.getElementById(id); }
  function linkSeguro(l) { return typeof l === 'string' && /^https:\/\//i.test(l); }

  function quadroIsolado(codigo) {
    var id = 'slot' + (++contador);
    var ifr = document.createElement('iframe');
    ifr.className = 'slot-quadro';
    ifr.title = 'Publicidade';
    ifr.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    ifr.setAttribute('referrerpolicy', 'no-referrer');
    ifr.setAttribute('scrolling', 'no');
    var medir = '<script>(function(){function m(){try{parent.postMessage({bolaoSlot:"' + id + '",h:Math.ceil(document.body.getBoundingClientRect().height)},"*")}catch(e){}}'
      + 'window.addEventListener("load",m);if(window.ResizeObserver)new ResizeObserver(m).observe(document.body);setTimeout(m,800)})()<\/script>';
    ifr.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><base target="_blank">'
      + '<style>html,body{margin:0;padding:0;overflow:hidden}body{display:flow-root}</style></head><body>' + codigo + medir + '</body></html>';
    quadros[id] = ifr;
    ifr.setAttribute('data-slot-id', id);
    return ifr;
  }

  // O quadro avisa a altura do anúncio; só vale se a mensagem veio do próprio quadro.
  root.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d.bolaoSlot !== 'string') return;
    var ifr = quadros[d.bolaoSlot];
    if (!ifr || ev.source !== ifr.contentWindow) return;
    var altura = Number(d.h);
    if (altura > 0) ifr.style.height = Math.min(Math.max(Math.ceil(altura), 30), 1500) + 'px';
  });

  function conteudo(cfg) {
    if (!cfg) return null;
    if (cfg.tipo === 'imagem' && cfg.imagemId) {
      var img = root.BolaoImagens.elemento(cfg.imagemId, 'Publicidade', 'slot-img');
      return linkSeguro(cfg.link) ? h('a', { href: cfg.link, target: '_blank', rel: 'noopener noreferrer sponsored' }, img) : img;
    }
    if (cfg.tipo === 'codigo' && cfg.codigo) return quadroIsolado(cfg.codigo);
    return null;
  }

  /** Redesenha só se a configuração mudou (evita piscar a cada atualização da tela). */
  function pintar(nome, alvo, cfg) {
    if (!alvo) return false;
    var sig = JSON.stringify(cfg || null);
    if (assinaturas[nome] === sig) return !alvo.hidden;
    assinaturas[nome] = sig;
    Array.prototype.forEach.call(alvo.querySelectorAll('[data-slot-id]'), function (f) { delete quadros[f.getAttribute('data-slot-id')]; });
    var el = conteudo(cfg);
    alvo.replaceChildren();
    if (el) { alvo.appendChild(el); alvo.hidden = false; } else alvo.hidden = true;
    return !!el;
  }

  /** Ajusta as colunas conforme os lados que estão visíveis. */
  function layout() {
    var L = $('layout-site');
    if (!L) return;
    var esq = $('slot-resultados');
    var dir = $('slot-lateral');
    L.classList.toggle('tem-esq', !!esq && !esq.hidden);
    L.classList.toggle('tem-dir', !!dir && !dir.hidden);
  }

  function aplicar(pub) {
    var s = (pub && pub.slots) || {};
    pintar('navbar', $('slot-navbar'), s.navbar);
    pintar('lateral', $('slot-lateral'), s.lateral);
    pintar('rodape', $('slot-rodape'), s.rodape);
    if (root.BolaoLoterias) root.BolaoLoterias.definirAtivo(!!(pub && pub.loterias && pub.loterias.ativo));
    layout();
  }

  root.BolaoSlots = { aplicar: aplicar, layout: layout };
})(window);
