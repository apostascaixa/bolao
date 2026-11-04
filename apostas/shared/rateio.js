/**
 * Rateio igualitário em centavos inteiros e estados da cota.
 * Funciona em Node (testes), navegador e Apps Script (V8).
 */
(function (root) {
  'use strict';

  /**
   * Divide o prêmio (em centavos) igualmente entre `cotasConfirmadas` cotas.
   * Regra do resto: os centavos que sobram são distribuídos 1 a 1,
   * começando pelas primeiras cotas na ordem de confirmação.
   * Retorna { porCota: number[], base, resto, total }.
   */
  function ratear(premioCentavos, cotasConfirmadas) {
    if (!Number.isInteger(premioCentavos) || premioCentavos < 0) {
      throw new Error('Prêmio deve ser um inteiro não negativo em centavos.');
    }
    if (!Number.isInteger(cotasConfirmadas) || cotasConfirmadas < 1) {
      throw new Error('É preciso ao menos 1 cota confirmada.');
    }
    var base = Math.floor(premioCentavos / cotasConfirmadas);
    var resto = premioCentavos - base * cotasConfirmadas;
    var porCota = [];
    for (var i = 0; i < cotasConfirmadas; i++) {
      porCota.push(base + (i < resto ? 1 : 0));
    }
    return { porCota: porCota, base: base, resto: resto, total: premioCentavos };
  }

  // Estados da cota e transições permitidas.
  var ESTADOS = {
    RASCUNHO: 'rascunho',
    COMPLETA: 'completa',
    AGUARDANDO: 'aguardando_pagamento',
    CONFIRMADA: 'confirmada',
    EXPIRADA: 'expirada'
  };

  var TRANSICOES = {
    rascunho: ['completa', 'expirada'],
    completa: ['rascunho', 'aguardando_pagamento', 'expirada'],
    aguardando_pagamento: ['confirmada', 'rascunho', 'expirada'],
    confirmada: [],
    expirada: []
  };

  function podeTransitar(de, para) {
    return !!TRANSICOES[de] && TRANSICOES[de].indexOf(para) !== -1;
  }

  /** Uma cota só fica "completa" quando tem exatamente jogosPorCota jogos válidos. */
  function cotaCompleta(qtdJogosValidos, jogosPorCota) {
    return Number.isInteger(qtdJogosValidos) && qtdJogosValidos === jogosPorCota;
  }

  var api = {
    ratear: ratear,
    ESTADOS: ESTADOS,
    podeTransitar: podeTransitar,
    cotaCompleta: cotaCompleta
  };

  root.BolaoRateio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
