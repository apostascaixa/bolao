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

  /** Tempo restante em texto curto: "6d 23h", "5h 10min", "12min", "Encerrado". */
  function formatarRestante(ms) {
    if (!(ms > 0)) return 'Encerrado';
    var min = Math.floor(ms / 60000);
    var d = Math.floor(min / 1440);
    var h = Math.floor((min % 1440) / 60);
    var m = min % 60;
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'min';
    return Math.max(1, m) + 'min';
  }

  /** Quantas colunas o volante usa, conforme o maior número da modalidade. */
  function colunasVolante(max) {
    if (max <= 25) return 5;
    if (max <= 31) return 7;
    if (max <= 60) return 6;
    return 8;
  }

  /** Sorteia `qtd` números distintos de 1 a `max`, em ordem crescente. `aleatorio()` devolve [0,1). */
  function sortearNumeros(max, qtd, aleatorio) {
    var pool = [];
    for (var n = 1; n <= max; n++) pool.push(n);
    for (var i = 0; i < qtd; i++) {
      var j = i + Math.floor(aleatorio() * (pool.length - i));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, qtd).sort(function (a, b) { return a - b; });
  }

  /** A, B, ... Z, AA, AB... (letra do jogo no comprovante). */
  function letraJogo(i) {
    var L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return i < 26 ? L.charAt(i) : L.charAt(Math.floor(i / 26) - 1) + L.charAt(i % 26);
  }

  /** dd/mm/aaaa hh:mm:ss no horário local. */
  function dataHora(ms) {
    var d = new Date(ms);
    return dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + dois(d.getHours()) + ':' + dois(d.getMinutes()) + ':' + dois(d.getSeconds());
  }

  function dataCurta(ms) {
    var d = new Date(ms);
    return dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function dezena(n) { return n < 10 ? '0' + n : String(n); }

  var api = {
    letraJogo: letraJogo,
    dataHora: dataHora,
    dataCurta: dataCurta,
    dezena: dezena,
    formatarRestante: formatarRestante,
    colunasVolante: colunasVolante,
    sortearNumeros: sortearNumeros,
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
