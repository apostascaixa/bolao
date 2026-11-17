/**
 * Carrega, depois que a página está pronta, os acréscimos certos para cada página:
 *  - página pública: relógio de contagem regressiva + resumo dos bilhetes
 *  - demais páginas: seção do relógio na aba Configurações do administrador
 * Não altera nenhum arquivo HTML; só acrescenta scripts e estilos.
 */
(function () {
  'use strict';
  if (window.__extrasLoader) return;
  window.__extrasLoader = true;
  var publica = /(^|\/)publico(\.html)?$/.test(location.pathname);
  function js(src) { var s = document.createElement('script'); s.src = src; document.body.appendChild(s); }
  function css(href) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
  css('css/contagem.css'); js('js/contagem.js');
  if (publica) { css('css/publico-extra.css'); js('js/publico-extras.js'); }
  else js('js/contagem-admin.js');
})();
