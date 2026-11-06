/** Componentes de tela compartilhados (sem innerHTML: todo texto entra como texto, nunca como HTML). */
(function (root) {
  'use strict';

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
    if (!t) return;
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

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      aviso('Copiado.');
    } catch (e) {
      aviso('Não foi possível copiar sozinho. Selecione o texto e copie.', true);
    }
  }

  root.BolaoUI = { h: h, aviso: aviso, campo: campo, copiar: copiar };
})(window);
