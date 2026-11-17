/** Carrossel de banners (bolões e banners do administrador) e banner do topo do site. */
(function (root) {
  'use strict';
  var h = root.BolaoUI.h;
  var timer = null;

  function parar() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function linkSeguro(l) { return typeof l === 'string' && /^https:\/\//i.test(l); }

  /** Banner enviado pelo administrador. */
  function slideBanner(b) {
    var conteudo = [root.BolaoImagens.elemento(b.imagemId, b.titulo || 'Banner', 'car-img'), b.titulo ? h('div', { class: 'car-legenda' }, b.titulo) : null];
    if (linkSeguro(b.link)) return h('a', { class: 'car-banner', href: b.link, target: '_blank', rel: 'noopener noreferrer' }, conteudo);
    return h('div', { class: 'car-banner' }, conteudo);
  }

  /** Banner fixo no topo do site. */
  function topo(cfg) {
    if (!cfg || !cfg.imagemId) return null;
    var img = root.BolaoImagens.elemento(cfg.imagemId, 'Banner do site', 'topo-img');
    return h('div', { class: 'topo-site' }, linkSeguro(cfg.link) ? h('a', { href: cfg.link, target: '_blank', rel: 'noopener noreferrer' }, img) : img);
  }

  /**
   * opc: { slides: [{ el, rotulo }], segundos, inicial }
   * Passa sozinho; pausa com o mouse/foco/toque; não passa sozinho se o aparelho pede menos movimento.
   */
  function criar(opc) {
    parar();
    var slides = opc.slides;
    var atual = Math.max(0, Math.min(opc.inicial || 0, slides.length - 1));
    var pausado = false;

    var faixa = h('div', { class: 'car-faixa' }, slides.map(function (s) {
      return h('div', { class: 'car-slide', role: 'group', 'aria-roledescription': 'slide' }, s.el);
    }));
    var pontos = slides.map(function (s, i) {
      return h('button', { type: 'button', class: 'car-ponto', 'aria-label': 'Ir para ' + (s.rotulo || 'slide ' + (i + 1)), onclick: function () { ir(i, true); } });
    });
    var varios = slides.length > 1;
    var raiz = h('section', { class: 'carrossel', 'aria-roledescription': 'carrossel', 'aria-label': 'Destaques' },
      h('div', { class: 'car-janela' }, faixa),
      varios ? h('button', { type: 'button', class: 'car-seta esq', 'aria-label': 'Anterior', onclick: function () { ir(atual - 1, true); } }, '‹') : null,
      varios ? h('button', { type: 'button', class: 'car-seta dir', 'aria-label': 'Próximo', onclick: function () { ir(atual + 1, true); } }, '›') : null,
      varios ? h('div', { class: 'car-pontos' }, pontos) : null);

    function ir(i, manual) {
      atual = (i + slides.length) % slides.length;
      faixa.style.transform = 'translateX(-' + (atual * 100) + '%)';
      pontos.forEach(function (p, k) {
        p.className = 'car-ponto' + (k === atual ? ' ativo' : '');
        p.setAttribute('aria-current', k === atual ? 'true' : 'false');
      });
      for (var k = 0; k < faixa.children.length; k++) {
        if (k === atual) faixa.children[k].removeAttribute('inert'); else faixa.children[k].setAttribute('inert', '');
      }
      raiz.setAttribute('data-atual', String(atual));
      if (manual) reiniciar();
    }

    function reiniciar() {
      parar();
      if (!varios) return;
      if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      timer = setInterval(function () {
        if (!document.body.contains(raiz)) return parar();
        if (!pausado && !document.hidden) ir(atual + 1, false);
      }, Math.max(2, opc.segundos || 6) * 1000);
    }

    raiz.addEventListener('mouseenter', function () { pausado = true; });
    raiz.addEventListener('mouseleave', function () { pausado = false; });
    raiz.addEventListener('focusin', function () { pausado = true; });
    raiz.addEventListener('focusout', function () { pausado = false; });
    var x0 = null;
    raiz.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; pausado = true; }, { passive: true });
    raiz.addEventListener('touchend', function (e) {
      pausado = false;
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) ir(atual + (dx < 0 ? 1 : -1), true);
    });

    ir(atual, false);
    reiniciar();
    return raiz;
  }

  root.BolaoCarrossel = { criar: criar, parar: parar, slideBanner: slideBanner, topo: topo };
})(window);
