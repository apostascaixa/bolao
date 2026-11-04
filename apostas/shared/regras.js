/**
 * Regras das modalidades e validação de jogos e bolões.
 * Funciona em Node (testes), navegador e Apps Script (V8).
 * Os valores padrão abaixo devem ser conferidos com as regras oficiais
 * da CAIXA antes de abrir inscrições; o administrador pode ajustá-los.
 */
(function (root) {
  'use strict';

  // universo: números de 1 a `maximo`; dezenas: quantidade permitida por jogo.
  var MODALIDADES = {
    'mega-sena':  { nome: 'Mega-Sena',   minimo: 1, maximo: 60, dezenasMin: 6,  dezenasMax: 20 },
    'lotofacil':  { nome: 'Lotofácil',   minimo: 1, maximo: 25, dezenasMin: 15, dezenasMax: 20 },
    'quina':      { nome: 'Quina',       minimo: 1, maximo: 80, dezenasMin: 5,  dezenasMax: 15 },
    'dia-de-sorte': { nome: 'Dia de Sorte', minimo: 1, maximo: 31, dezenasMin: 7, dezenasMax: 15 }
  };

  function obterModalidade(id) {
    return MODALIDADES[id] || null;
  }

  /**
   * Valida a configuração de um bolão criada pelo administrador.
   * Retorna { ok: boolean, erros: string[] }.
   */
  function validarBolao(cfg) {
    var erros = [];
    if (!cfg || typeof cfg !== 'object') return { ok: false, erros: ['Configuração ausente.'] };
    var mod = obterModalidade(cfg.modalidade);
    if (!mod) erros.push('Modalidade desconhecida.');
    if (!cfg.nome || String(cfg.nome).trim() === '') erros.push('Nome obrigatório.');
    if (!Number.isInteger(cfg.qtdNumeros)) {
      erros.push('Quantidade de números deve ser inteira.');
    } else if (mod && (cfg.qtdNumeros < mod.dezenasMin || cfg.qtdNumeros > mod.dezenasMax)) {
      erros.push('Quantidade de números deve estar entre ' + mod.dezenasMin + ' e ' + mod.dezenasMax + ' para ' + mod.nome + '.');
    }
    if (!Number.isInteger(cfg.valorCotaCentavos) || cfg.valorCotaCentavos <= 0) {
      erros.push('Valor da cota deve ser um inteiro positivo em centavos.');
    }
    if (!Number.isInteger(cfg.jogosPorCota) || cfg.jogosPorCota < 1) {
      erros.push('Jogos por cota deve ser um inteiro maior ou igual a 1.');
    }
    if (!Number.isInteger(cfg.limiteCotas) || cfg.limiteCotas < 1) {
      erros.push('Limite de cotas deve ser um inteiro maior ou igual a 1.');
    }
    return { ok: erros.length === 0, erros: erros };
  }

  /**
   * Valida um jogo (lista de números) contra a configuração do bolão.
   * Retorna { ok, erros, numeros } com os números ordenados quando válido.
   */
  function validarJogo(numeros, cfg) {
    var erros = [];
    var mod = obterModalidade(cfg && cfg.modalidade);
    if (!mod) return { ok: false, erros: ['Modalidade desconhecida.'], numeros: [] };
    if (!Array.isArray(numeros)) return { ok: false, erros: ['Jogo inválido.'], numeros: [] };

    for (var i = 0; i < numeros.length; i++) {
      if (!Number.isInteger(numeros[i])) {
        return { ok: false, erros: ['Todos os números devem ser inteiros.'], numeros: [] };
      }
    }
    if (numeros.length !== cfg.qtdNumeros) {
      erros.push('O jogo deve ter exatamente ' + cfg.qtdNumeros + ' números.');
    }
    var vistos = {};
    for (var j = 0; j < numeros.length; j++) {
      var n = numeros[j];
      if (n < mod.minimo || n > mod.maximo) {
        erros.push('Número ' + n + ' fora do intervalo ' + mod.minimo + ' a ' + mod.maximo + '.');
      }
      if (vistos[n]) erros.push('Número ' + n + ' repetido.');
      vistos[n] = true;
    }
    var ordenados = numeros.slice().sort(function (a, b) { return a - b; });
    return { ok: erros.length === 0, erros: erros, numeros: ordenados };
  }

  /** Um jogo igual (mesmos números) já existe na lista da cota? */
  function chaveJogo(numerosOrdenados) {
    return numerosOrdenados.join('-');
  }

  var api = {
    MODALIDADES: MODALIDADES,
    obterModalidade: obterModalidade,
    validarBolao: validarBolao,
    validarJogo: validarJogo,
    chaveJogo: chaveJogo
  };

  root.BolaoRegras = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
