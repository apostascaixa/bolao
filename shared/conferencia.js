/**
 * Conferência de jogos contra o resultado oficial e comparação com os jogos registrados na lotérica.
 * Funciona em Node (testes) e Apps Script (V8). Depende de regras.js.
 */
(function (root) {
  'use strict';
  var Regras = root.BolaoRegras || (typeof require !== 'undefined' ? require('./regras.js') : null);

  /** Número de combinações C(n, k). */
  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    var r = 1;
    for (var i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return Math.round(r);
  }

  /** Valida as dezenas sorteadas: quantidade certa, distintas e dentro do intervalo. */
  function validarResultado(numeros, modalidade) {
    var mod = Regras.obterModalidade(modalidade);
    if (!mod) return { ok: false, erros: ['Modalidade desconhecida.'], numeros: [] };
    if (!Array.isArray(numeros) || numeros.some(function (n) { return !Number.isInteger(n); })) {
      return { ok: false, erros: ['O resultado deve ser uma lista de números inteiros.'], numeros: [] };
    }
    var erros = [];
    if (numeros.length !== mod.sorteados) erros.push('O resultado de ' + mod.nome + ' tem ' + mod.sorteados + ' dezenas.');
    var vistos = {};
    numeros.forEach(function (n) {
      if (n < mod.minimo || n > mod.maximo) erros.push('Dezena ' + n + ' fora do intervalo ' + mod.minimo + ' a ' + mod.maximo + '.');
      if (vistos[n]) erros.push('Dezena ' + n + ' repetida.');
      vistos[n] = true;
    });
    return { ok: erros.length === 0, erros: erros, numeros: numeros.slice().sort(function (a, b) { return a - b; }) };
  }

  /**
   * Confere um jogo (que pode ter mais números que o sorteio, como uma aposta múltipla).
   * Para cada faixa, `quantidade` = quantas combinações do jogo caem nela: C(h, f) * C(n - h, sorteados - f).
   */
  function conferirJogo(jogo, resultado, modalidade) {
    var mod = Regras.obterModalidade(modalidade);
    var sorteado = {};
    resultado.forEach(function (n) { sorteado[n] = true; });
    var acertados = jogo.filter(function (n) { return sorteado[n]; });
    var h = acertados.length;
    var n = jogo.length;
    var premios = [];
    mod.faixas.forEach(function (f) {
      var q = comb(h, f.acertos) * comb(n - h, mod.sorteados - f.acertos);
      if (q > 0) premios.push({ nome: f.nome, acertos: f.acertos, quantidade: q });
    });
    return { acertos: h, acertados: acertados, premios: premios };
  }

  /**
   * Lê jogos de um texto colado (ex.: linhas do comprovante). Cada linha com exatamente `qtd`
   * dezenas válidas vira um jogo; letras e outros textos ao redor são ignorados.
   */
  function extrairJogos(texto, qtd, modalidade) {
    var jogos = [];
    var ignoradas = [];
    String(texto === undefined || texto === null ? '' : texto).split(/\r?\n/).forEach(function (linha) {
      if (linha.trim() === '') return;
      var original = linha;
      linha = linha.replace(/^\s*[A-Za-zÀ-ú]+\s*\d*\s*[:.)]\s*/, ''); // tira rótulos como "Jogo 1:" ou "A)"
      var nums = (linha.match(/(?:^|[^0-9])(\d{1,2})(?![0-9])/g) || []).map(function (m) { return Number(m.replace(/[^0-9]/g, '')); });
      var v = nums.length === qtd ? Regras.validarJogo(nums, { modalidade: modalidade, qtdNumeros: qtd }) : { ok: false };
      if (v.ok) jogos.push(v.numeros); else ignoradas.push(original.trim());
    });
    return { jogos: jogos, ignoradas: ignoradas };
  }

  /** Compara dois conjuntos de jogos como multiconjuntos (a ordem dos jogos não importa). */
  function compararJogos(registrados, sistema) {
    var contagem = {};
    sistema.forEach(function (j) { var k = Regras.chaveJogo(j); contagem[k] = (contagem[k] || 0) + 1; });
    var sobram = [];
    var iguais = 0;
    registrados.forEach(function (j) {
      var k = Regras.chaveJogo(j);
      if (contagem[k] > 0) { contagem[k]--; iguais++; } else sobram.push(j);
    });
    var faltam = [];
    sistema.forEach(function (j) {
      var k = Regras.chaveJogo(j);
      if (contagem[k] > 0) { contagem[k]--; faltam.push(j); }
    });
    return { iguais: iguais, faltamNoRegistro: faltam, sobramNoRegistro: sobram };
  }

  var api = { comb: comb, validarResultado: validarResultado, conferirJogo: conferirJogo, extrairJogos: extrairJogos, compararJogos: compararJogos };
  root.BolaoConferencia = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
