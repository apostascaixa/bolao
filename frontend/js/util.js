/** Funções puras de formatação e conversão (testadas em Node). */
(function (root) {
  'use strict';

  /** "60", "60,5", "1.234,50", "R$ 6,00" -> centavos inteiros; NaN se inválido ou ambíguo. */
  function reaisParaCentavos(texto) {
    var s = String(texto === undefined || texto === null ? '' : texto).replace(/R\$/gi, '').replace(/\s/g, '');
    if (s === '' || /[^0-9.,]/.test(s)) return NaN;
    if (s.indexOf(',') !== -1) {
      if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return NaN;
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.indexOf('.') !== -1) {
      if (!/^\d+\.\d{1,2}$/.test(s)) return NaN; // "6.000" é ambíguo: recusa
    }
    var partes = s.split('.');
    var reais = parseInt(partes[0], 10);
    var cent = partes[1] ? parseInt((partes[1] + '0').substring(0, 2), 10) : 0;
    return reais * 100 + cent;
  }

  function centavosParaDecimalBR(c) {
    var reais = Math.floor(c / 100);
    var cent = c % 100;
    var r = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return r + ',' + (cent < 10 ? '0' : '') + cent;
  }

  function centavosParaReais(c) {
    return 'R$ ' + centavosParaDecimalBR(c);
  }

  function dois(n) { return (n < 10 ? '0' : '') + n; }

  /** ms -> valor de <input type="datetime-local"> no horário local. */
  function msParaInputLocal(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate()) + 'T' + dois(d.getHours()) + ':' + dois(d.getMinutes());
  }

  /** valor de <input type="datetime-local"> -> ms; NaN se vazio. */
  function inputLocalParaMs(v) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(v || ''))) return NaN;
    return new Date(v).getTime();
  }

  function formatarData(ms) {
    return new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  var api = {
    reaisParaCentavos: reaisParaCentavos,
    centavosParaDecimalBR: centavosParaDecimalBR,
    centavosParaReais: centavosParaReais,
    msParaInputLocal: msParaInputLocal,
    inputLocalParaMs: inputLocalParaMs,
    formatarData: formatarData
  };
  root.BolaoUtil = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
