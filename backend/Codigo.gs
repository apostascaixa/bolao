// ARQUIVO GERADO por scripts/build-backend.js. Não edite aqui: edite shared/ ou backend/src/ e gere de novo.

// ======================= shared/regras.js =======================
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


// ======================= shared/rateio.js =======================
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


// ======================= shared/pix.js =======================
/**
 * Gerador de PIX "copia e cola" (BR Code estático, padrão EMV do Banco Central).
 * Não há integração bancária: o código é gerado localmente e o pagamento
 * é confirmado manualmente pelo administrador.
 * Funciona em Node (testes), navegador e Apps Script (V8).
 */
(function (root) {
  'use strict';

  function campo(id, valor) {
    var tam = String(valor.length);
    if (tam.length < 2) tam = '0' + tam;
    return id + tam + valor;
  }

  /** CRC16/CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF. */
  function crc16(texto) {
    var crc = 0xFFFF;
    for (var i = 0; i < texto.length; i++) {
      crc ^= (texto.charCodeAt(i) & 0xFF) << 8;
      for (var b = 0; b < 8; b++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    var hex = crc.toString(16).toUpperCase();
    while (hex.length < 4) hex = '0' + hex;
    return hex;
  }

  /** Maiúsculas, sem acentos, só ASCII imprimível. */
  function limparTexto(txt, max) {
    var s = String(txt || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^\x20-\x7E]/g, '')
      .trim();
    return s.substring(0, max);
  }

  function centavosParaDecimal(centavos) {
    var reais = Math.floor(centavos / 100);
    var cent = centavos % 100;
    return reais + '.' + (cent < 10 ? '0' : '') + cent;
  }

  /**
   * gerarPix({ chave, nomeRecebedor, cidade, valorCentavos, txid })
   * Retorna a string do "copia e cola".
   */
  function gerarPix(dados) {
    if (!dados || !dados.chave || String(dados.chave).trim() === '') {
      throw new Error('Chave PIX obrigatória.');
    }
    if (!Number.isInteger(dados.valorCentavos) || dados.valorCentavos <= 0) {
      throw new Error('Valor deve ser um inteiro positivo em centavos.');
    }
    var nome = limparTexto(dados.nomeRecebedor, 25);
    var cidade = limparTexto(dados.cidade, 15);
    if (!nome) throw new Error('Nome do recebedor obrigatório.');
    if (!cidade) throw new Error('Cidade obrigatória.');

    var txid = String(dados.txid || '***').replace(/[^A-Za-z0-9]/g, '').substring(0, 25);
    if (!txid) txid = '***';

    var conta = campo('00', 'br.gov.bcb.pix') + campo('01', String(dados.chave).trim());
    var corpo =
      campo('00', '01') +
      campo('01', '11') +
      campo('26', conta) +
      campo('52', '0000') +
      campo('53', '986') +
      campo('54', centavosParaDecimal(dados.valorCentavos)) +
      campo('58', 'BR') +
      campo('59', nome) +
      campo('60', cidade) +
      campo('62', campo('05', txid)) +
      '6304';
    return corpo + crc16(corpo);
  }

  /** Lê os campos de primeiro nível (usado nos testes). */
  function lerCampos(codigo) {
    var campos = {};
    var i = 0;
    while (i < codigo.length) {
      var id = codigo.substr(i, 2);
      var tam = parseInt(codigo.substr(i + 2, 2), 10);
      campos[id] = codigo.substr(i + 4, tam);
      i += 4 + tam;
    }
    return campos;
  }

  /** Confere se o CRC do código bate com o conteúdo. */
  function validarCrc(codigo) {
    if (typeof codigo !== 'string' || codigo.length < 8) return false;
    var corpo = codigo.substring(0, codigo.length - 4);
    return crc16(corpo) === codigo.substring(codigo.length - 4);
  }

  var api = {
    gerarPix: gerarPix,
    crc16: crc16,
    lerCampos: lerCampos,
    validarCrc: validarCrc
  };

  root.BolaoPix = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);


// ======================= backend/src/01_base.js =======================
// ===== Base: configuração, erros, utilitários =====
var G = (typeof globalThis !== 'undefined') ? globalThis : this;
var Regras = G.BolaoRegras;
var Rateio = G.BolaoRateio;

var CFG = {
  ABAS: {
    Usuarios: ['id', 'usuario', 'nome', 'hashSenha', 'papel', 'status', 'tentativas', 'bloqueadoAte', 'criadoEm', 'conviteId'],
    Convites: ['id', 'codigoHash', 'papel', 'criadoPor', 'criadoEm', 'expiraEm', 'status', 'usadoPor', 'usadoEm'],
    Sessoes: ['tokenHash', 'userId', 'criadoEm', 'expiraEm'],
    Boloes: ['id', 'nome', 'modalidade', 'qtdNumeros', 'valorCotaCentavos', 'jogosPorCota', 'limiteCotas', 'maxCotasPorPessoa', 'prazo', 'status', 'criadoPor', 'criadoEm', 'atualizadoEm'],
    Cotas: ['id', 'bolaoId', 'userId', 'status', 'criadoEm', 'atualizadoEm', 'confirmadaEm'],
    Jogos: ['id', 'cotaId', 'numeros', 'criadoEm']
  },
  COLUNAS_NUM: ['tentativas', 'bloqueadoAte', 'criadoEm', 'expiraEm', 'usadoEm', 'qtdNumeros', 'valorCotaCentavos',
    'jogosPorCota', 'limiteCotas', 'maxCotasPorPessoa', 'prazo', 'atualizadoEm', 'confirmadaEm'],
  SESSAO_MS: 7 * 24 * 3600 * 1000,
  MAX_TENTATIVAS: 5,
  BLOQUEIO_MS: 10 * 60 * 1000,
  HASH_ITER_PADRAO: 3000,
  CONVITE_HORAS_PADRAO: 72,
  COTA_ABANDONO_MS: 48 * 3600 * 1000 // cota em rascunho/completa sem atividade por 48h libera a vaga
};

var RELOGIO = { agora: function () { return Date.now(); } };

function erroNegocio(msg) {
  var e = new Error(msg);
  e.negocio = true;
  return e;
}

function props() {
  return PropertiesService.getScriptProperties();
}

function novoId() {
  return Utilities.getUuid();
}

function aleatorioHex(n) {
  var s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.substring(0, n);
}

function bytesParaHex(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    if (h.length < 2) h = '0' + h;
    s += h;
  }
  return s;
}

function sha256Hex(texto) {
  return bytesParaHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8));
}

/** Remove caracteres de controle e prefixos que viram fórmula na planilha. */
function limparTexto(t, max) {
  return String(t === undefined || t === null ? '' : t)
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/^[=+\-@\s]+/, '')
    .trim()
    .substring(0, max);
}

/** Script Lock não é reentrante aqui: nunca chamar comLock dentro de comLock. */
function comLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}


// ======================= backend/src/02_dados.js =======================
// ===== Acesso à planilha =====
function planilha() {
  var id = props().getProperty('PLANILHA_ID');
  if (!id) throw new Error('Execute configurar() primeiro.');
  return SpreadsheetApp.openById(id);
}

function aba(nome) {
  var s = planilha().getSheetByName(nome);
  if (!s) throw new Error('Aba ausente: ' + nome + '. Execute configurar().');
  return s;
}

function ehNumerica(col) {
  return CFG.COLUNAS_NUM.indexOf(col) !== -1;
}

/**
 * O Planilhas converte texto parecido com número, data ou fórmula ("12e4", "0123", "1-2-3", "TRUE").
 * Para isso nunca acontecer, todo texto é gravado com o prefixo "~" e o prefixo é removido na leitura.
 */
function codificarTexto(v) {
  var s = String(v === undefined || v === null ? '' : v);
  return s === '' ? '' : '~' + s;
}

function decodificarTexto(v) {
  var s = String(v === undefined || v === null ? '' : v);
  return s.charAt(0) === '~' ? s.substring(1) : s;
}

/** Lê a aba como lista de objetos (com _linha). Textos ficam texto, números ficam número. */
function lerTabela(nome) {
  var cols = CFG.ABAS[nome];
  var vals = aba(nome).getDataRange().getValues();
  var out = [];
  for (var r = 1; r < vals.length; r++) {
    if (vals[r][0] === '' || vals[r][0] === null || vals[r][0] === undefined) continue;
    var obj = { _linha: r + 1 };
    for (var c = 0; c < cols.length; c++) {
      var v = vals[r][c];
      if (v === undefined || v === null) v = '';
      if (ehNumerica(cols[c])) obj[cols[c]] = (v === '' ? '' : Number(v));
      else obj[cols[c]] = decodificarTexto(v);
    }
    out.push(obj);
  }
  return out;
}

function linhaDe(nome, obj) {
  var cols = CFG.ABAS[nome];
  var linha = [];
  for (var c = 0; c < cols.length; c++) {
    var v = obj[cols[c]] === undefined ? '' : obj[cols[c]];
    linha.push(ehNumerica(cols[c]) ? v : codificarTexto(v));
  }
  return linha;
}

function inserir(nome, obj) {
  aba(nome).appendRow(linhaDe(nome, obj));
}

function atualizar(nome, linha, obj) {
  var cols = CFG.ABAS[nome];
  aba(nome).getRange(linha, 1, 1, cols.length).setValues([linhaDe(nome, obj)]);
}

function removerLinha(nome, linha) {
  aba(nome).deleteRow(linha);
}


// ======================= backend/src/03_auth.js =======================
// ===== Autenticação: senha, convite, cadastro, login, sessão =====
function iteracoesHash() {
  var v = parseInt(props().getProperty('HASH_ITER'), 10);
  return (v > 0) ? v : CFG.HASH_ITER_PADRAO;
}

/** Formato: v1$iteracoes$salt$hash (SHA-256 iterado com salt individual). */
function hashSenha(senha, iter) {
  var salt = aleatorioHex(32);
  var h = sha256Hex(salt + '|' + senha);
  for (var i = 0; i < iter; i++) h = sha256Hex(h + '|' + salt + '|' + senha);
  return 'v1$' + iter + '$' + salt + '$' + h;
}

function comparaConstante(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function verificarSenha(senha, registro) {
  var p = String(registro).split('$');
  if (p.length !== 4 || p[0] !== 'v1') return false;
  var iter = parseInt(p[1], 10);
  if (!(iter > 0)) return false;
  var h = sha256Hex(p[2] + '|' + senha);
  for (var i = 0; i < iter; i++) h = sha256Hex(h + '|' + p[2] + '|' + senha);
  return comparaConstante(h, p[3]);
}

function normalizarUsuario(u) {
  return String(u === undefined || u === null ? '' : u).trim().toLowerCase();
}

function validarUsuario(u) {
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) {
    throw erroNegocio('Usuário deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.');
  }
}

function validarSenha(senha, usuario) {
  if (typeof senha !== 'string' || senha.length < 8) throw erroNegocio('A senha deve ter pelo menos 8 caracteres.');
  if (senha.length > 100) throw erroNegocio('A senha deve ter no máximo 100 caracteres.');
  if (senha.toLowerCase() === usuario) throw erroNegocio('A senha não pode ser igual ao usuário.');
}

// ----- convites -----
function normalizarCodigo(c) {
  return String(c === undefined || c === null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashCodigo(codigoNormalizado) {
  return sha256Hex('convite|' + codigoNormalizado);
}

function gerarCodigoConvite() {
  var h = aleatorioHex(20).toUpperCase();
  return h.substring(0, 5) + '-' + h.substring(5, 10) + '-' + h.substring(10, 15) + '-' + h.substring(15, 20);
}

/** Cria o convite e devolve o código em texto puro uma única vez (só o hash é guardado). */
function criarConviteInterno(papel, criadoPor, horas) {
  if (papel !== 'participante' && papel !== 'admin') throw erroNegocio('Papel inválido.');
  var h = (horas === undefined || horas === null) ? CFG.CONVITE_HORAS_PADRAO : horas;
  if (!Number.isInteger(h) || h < 1 || h > 24 * 30) throw erroNegocio('Validade deve ser de 1 a 720 horas.');
  var agora = RELOGIO.agora();
  var codigo = gerarCodigoConvite();
  var id = novoId();
  inserir('Convites', {
    id: id, codigoHash: hashCodigo(normalizarCodigo(codigo)), papel: papel, criadoPor: criadoPor,
    criadoEm: agora, expiraEm: agora + h * 3600 * 1000, status: 'ativo', usadoPor: '', usadoEm: ''
  });
  return { id: id, codigo: codigo, papel: papel, expiraEm: agora + h * 3600 * 1000 };
}

function criarConvite(admin, d) {
  return comLock(function () {
    return criarConviteInterno(d.papel || 'participante', admin.id, d.validadeHoras);
  });
}

function listarConvites() {
  var agora = RELOGIO.agora();
  return lerTabela('Convites').map(function (c) {
    var st = c.status;
    if (st === 'ativo' && c.expiraEm < agora) st = 'expirado';
    return { id: c.id, papel: c.papel, criadoEm: c.criadoEm, expiraEm: c.expiraEm, status: st, usadoPor: c.usadoPor, usadoEm: c.usadoEm };
  });
}

function revogarConvite(d) {
  return comLock(function () {
    var c = lerTabela('Convites').filter(function (x) { return x.id === d.id; })[0];
    if (!c) throw erroNegocio('Convite não encontrado.');
    if (c.status !== 'ativo') throw erroNegocio('Só convites ativos podem ser revogados.');
    c.status = 'revogado';
    atualizar('Convites', c._linha, c);
    return { id: c.id, status: 'revogado' };
  });
}

// ----- sessões -----
function limparSessoesExpiradas(agora) {
  var t = lerTabela('Sessoes');
  for (var i = t.length - 1; i >= 0; i--) {
    if (t[i].expiraEm < agora) removerLinha('Sessoes', t[i]._linha);
  }
}

/** Chamar somente dentro de comLock. Devolve o token em texto puro (só o hash é guardado). */
function criarSessaoInterna(userId, agora) {
  var token = aleatorioHex(64);
  inserir('Sessoes', { tokenHash: sha256Hex('sessao|' + token), userId: userId, criadoEm: agora, expiraEm: agora + CFG.SESSAO_MS });
  return token;
}

function usuarioPublico(u) {
  return { id: u.id, usuario: u.usuario, nome: u.nome, papel: u.papel };
}

function autenticar(token) {
  var invalida = erroNegocio('Sessão inválida ou expirada. Entre novamente.');
  if (typeof token !== 'string' || token.length < 32) throw invalida;
  var th = sha256Hex('sessao|' + token);
  var agora = RELOGIO.agora();
  var s = lerTabela('Sessoes').filter(function (x) { return x.tokenHash === th; })[0];
  if (!s || s.expiraEm < agora) throw invalida;
  var u = lerTabela('Usuarios').filter(function (x) { return x.id === s.userId; })[0];
  if (!u || u.status !== 'ativo') throw invalida;
  return u;
}

function exigirAdmin(token) {
  var u = autenticar(token);
  if (u.papel !== 'admin') throw erroNegocio('Acesso restrito ao administrador.');
  return u;
}

// ----- cadastro e login -----
function cadastrar(d) {
  var usuario = normalizarUsuario(d.usuario);
  validarUsuario(usuario);
  var nome = limparTexto(d.nome, 60);
  if (nome.length < 2) throw erroNegocio('Informe seu nome (mínimo 2 caracteres).');
  validarSenha(d.senha, usuario);

  var cod = normalizarCodigo(d.codigoConvite);
  var conviteInvalido = erroNegocio('Convite inválido ou expirado.');
  if (cod.length !== 20) throw conviteInvalido;
  var ch = hashCodigo(cod);
  var achar = function () { return lerTabela('Convites').filter(function (c) { return c.codigoHash === ch; })[0]; };
  var pre = achar();
  if (!pre || pre.status !== 'ativo' || pre.expiraEm < RELOGIO.agora()) throw conviteInvalido;

  var registro = hashSenha(d.senha, iteracoesHash()); // custo alto: fora do lock

  return comLock(function () {
    var agora = RELOGIO.agora();
    var conv = achar();
    if (!conv || conv.status !== 'ativo' || conv.expiraEm < agora) throw conviteInvalido;
    var existe = lerTabela('Usuarios').some(function (u) { return u.usuario === usuario; });
    if (existe) throw erroNegocio('Este nome de usuário já está em uso.');
    var id = novoId();
    inserir('Usuarios', {
      id: id, usuario: usuario, nome: nome, hashSenha: registro, papel: conv.papel, status: 'ativo',
      tentativas: 0, bloqueadoAte: 0, criadoEm: agora, conviteId: conv.id
    });
    conv.status = 'usado';
    conv.usadoPor = id;
    conv.usadoEm = agora;
    atualizar('Convites', conv._linha, conv);
    var token = criarSessaoInterna(id, agora);
    return { token: token, usuario: { id: id, usuario: usuario, nome: nome, papel: conv.papel } };
  });
}

function login(d) {
  var generico = erroNegocio('Usuário ou senha inválidos.');
  var usuario = normalizarUsuario(d.usuario);
  var senha = (typeof d.senha === 'string') ? d.senha : '';
  var u = lerTabela('Usuarios').filter(function (x) { return x.usuario === usuario; })[0];

  if (!u) {
    hashSenha(senha, iteracoesHash()); // equaliza o tempo de resposta
    throw generico;
  }
  if (u.status !== 'ativo') throw generico;
  if (u.bloqueadoAte > RELOGIO.agora()) {
    throw erroNegocio('Muitas tentativas. Tente novamente em alguns minutos.');
  }

  var ok = verificarSenha(senha, u.hashSenha); // fora do lock

  return comLock(function () {
    var agora = RELOGIO.agora();
    var atual = lerTabela('Usuarios').filter(function (x) { return x.id === u.id; })[0];
    if (!atual) throw generico;
    if (!ok) {
      atual.tentativas = (atual.tentativas || 0) + 1;
      if (atual.tentativas >= CFG.MAX_TENTATIVAS) {
        atual.bloqueadoAte = agora + CFG.BLOQUEIO_MS;
        atual.tentativas = 0;
      }
      atualizar('Usuarios', atual._linha, atual);
      throw generico;
    }
    atual.tentativas = 0;
    atual.bloqueadoAte = 0;
    atualizar('Usuarios', atual._linha, atual);
    limparSessoesExpiradas(agora);
    var token = criarSessaoInterna(atual.id, agora);
    return { token: token, usuario: usuarioPublico(atual) };
  });
}

function logout(d) {
  if (typeof d.token !== 'string') return { saiu: true };
  var th = sha256Hex('sessao|' + d.token);
  return comLock(function () {
    var s = lerTabela('Sessoes').filter(function (x) { return x.tokenHash === th; })[0];
    if (s) removerLinha('Sessoes', s._linha);
    return { saiu: true };
  });
}


// ======================= backend/src/04_boloes.js =======================
// ===== Bolões (administrador) =====
/** Uma cota ocupa vaga se não expirou e, antes do pagamento, teve atividade nas últimas 48h. */
function cotaOcupaVaga(c, agora) {
  if (c.status === 'expirada') return false;
  if (c.status === 'rascunho' || c.status === 'completa') {
    return (agora - (c.atualizadoEm || c.criadoEm || 0)) <= CFG.COTA_ABANDONO_MS;
  }
  return true;
}

function cotasAtivasDoBolao(bolaoId) {
  var agora = RELOGIO.agora();
  return lerTabela('Cotas').filter(function (c) { return c.bolaoId === bolaoId && cotaOcupaVaga(c, agora); });
}

function bolaoParaSaida(b, ocupadas) {
  var mod = Regras.obterModalidade(b.modalidade);
  return {
    id: b.id, nome: b.nome, modalidade: b.modalidade, modalidadeNome: mod ? mod.nome : b.modalidade,
    qtdNumeros: b.qtdNumeros, valorCotaCentavos: b.valorCotaCentavos, jogosPorCota: b.jogosPorCota,
    limiteCotas: b.limiteCotas, maxCotasPorPessoa: b.maxCotasPorPessoa, prazo: b.prazo, status: b.status,
    cotasOcupadas: ocupadas, vagas: Math.max(0, b.limiteCotas - ocupadas)
  };
}

function validarConfigCompleta(cfg, agora) {
  var v = Regras.validarBolao(cfg);
  var erros = v.erros.slice();
  if (!Number.isInteger(cfg.maxCotasPorPessoa) || cfg.maxCotasPorPessoa < 1) {
    erros.push('Máximo de cotas por pessoa deve ser um inteiro maior ou igual a 1.');
  } else if (Number.isInteger(cfg.limiteCotas) && cfg.maxCotasPorPessoa > cfg.limiteCotas) {
    erros.push('Máximo de cotas por pessoa não pode passar do limite de cotas.');
  }
  if (!Number.isInteger(cfg.prazo) || cfg.prazo <= agora) erros.push('O prazo deve ser uma data futura.');
  if (erros.length) throw erroNegocio(erros.join(' '));
}

function criarBolao(admin, d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var cfg = {
      nome: limparTexto(d.nome, 60), modalidade: String(d.modalidade || ''), qtdNumeros: d.qtdNumeros,
      valorCotaCentavos: d.valorCotaCentavos, jogosPorCota: d.jogosPorCota, limiteCotas: d.limiteCotas,
      maxCotasPorPessoa: (d.maxCotasPorPessoa === undefined ? 1 : d.maxCotasPorPessoa), prazo: d.prazo
    };
    validarConfigCompleta(cfg, agora);
    cfg.id = novoId();
    cfg.status = 'rascunho';
    cfg.criadoPor = admin.id;
    cfg.criadoEm = agora;
    cfg.atualizadoEm = agora;
    inserir('Boloes', cfg);
    return bolaoParaSaida(cfg, 0);
  });
}

function achaBolao(id) {
  var b = lerTabela('Boloes').filter(function (x) { return x.id === id; })[0];
  if (!b) throw erroNegocio('Bolão não encontrado.');
  return b;
}

var CAMPOS_BLOQUEADOS_COM_COTAS = ['modalidade', 'qtdNumeros', 'valorCotaCentavos', 'jogosPorCota', 'limiteCotas', 'maxCotasPorPessoa'];

function editarBolao(d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var b = achaBolao(d.id);
    if (b.status === 'arquivado' || b.status === 'fechado') throw erroNegocio('Este bolão não pode mais ser editado.');
    var ocupadas = cotasAtivasDoBolao(b.id).length;

    var novo = {};
    var k;
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) novo[k] = b[k];

    if (ocupadas > 0) {
      for (var i = 0; i < CAMPOS_BLOQUEADOS_COM_COTAS.length; i++) {
        var f = CAMPOS_BLOQUEADOS_COM_COTAS[i];
        if (d[f] !== undefined && d[f] !== b[f]) {
          throw erroNegocio('Este bolão já tem cotas: só o nome e o prazo podem ser alterados.');
        }
      }
    } else {
      for (var j = 0; j < CAMPOS_BLOQUEADOS_COM_COTAS.length; j++) {
        var g = CAMPOS_BLOQUEADOS_COM_COTAS[j];
        if (d[g] !== undefined) novo[g] = d[g];
      }
    }
    if (d.nome !== undefined) novo.nome = limparTexto(d.nome, 60);
    if (d.prazo !== undefined) novo.prazo = d.prazo;

    validarConfigCompleta(novo, agora);
    novo.atualizadoEm = agora;
    atualizar('Boloes', b._linha, novo);
    return bolaoParaSaida(novo, ocupadas);
  });
}

function alterarStatusBolao(d) {
  return comLock(function () {
    var b = achaBolao(d.id);
    var ocupadas = cotasAtivasDoBolao(b.id).length;
    var para = d.status;
    var permitido = (b.status === 'rascunho' && para === 'aberto') || (b.status === 'aberto' && para === 'rascunho');
    if (!permitido) throw erroNegocio('Mudança de status não permitida.');
    if (para === 'rascunho' && ocupadas > 0) throw erroNegocio('Não é possível voltar a rascunho: já existem cotas.');
    if (para === 'aberto' && b.prazo <= RELOGIO.agora()) throw erroNegocio('O prazo já passou. Edite o prazo antes de abrir.');
    b.status = para;
    b.atualizadoEm = RELOGIO.agora();
    atualizar('Boloes', b._linha, b);
    return bolaoParaSaida(b, ocupadas);
  });
}

/** Sem cotas: apaga de verdade. Com cotas: arquiva, preservando o histórico. */
function excluirBolao(d) {
  return comLock(function () {
    var b = achaBolao(d.id);
    var todasCotas = lerTabela('Cotas').filter(function (c) { return c.bolaoId === b.id; });
    if (todasCotas.length === 0) {
      removerLinha('Boloes', b._linha);
      return { id: b.id, removido: true, arquivado: false };
    }
    b.status = 'arquivado';
    b.atualizadoEm = RELOGIO.agora();
    atualizar('Boloes', b._linha, b);
    return { id: b.id, removido: false, arquivado: true };
  });
}

function listarBoloesAdmin(d) {
  var agora = RELOGIO.agora();
  var todas = lerTabela('Cotas');
  return lerTabela('Boloes')
    .filter(function (b) { return d.incluirArquivados || b.status !== 'arquivado'; })
    .map(function (b) {
      var n = todas.filter(function (c) { return c.bolaoId === b.id && cotaOcupaVaga(c, agora); }).length;
      return bolaoParaSaida(b, n);
    });
}

function boloesAbertos() {
  var agora = RELOGIO.agora();
  var todas = lerTabela('Cotas');
  return lerTabela('Boloes')
    .filter(function (b) { return b.status === 'aberto'; })
    .map(function (b) {
      var n = todas.filter(function (c) { return c.bolaoId === b.id && cotaOcupaVaga(c, agora); }).length;
      return bolaoParaSaida(b, n);
    });
}

function modalidadesDisponiveis() {
  return Object.keys(Regras.MODALIDADES).map(function (id) {
    var m = Regras.MODALIDADES[id];
    return { id: id, nome: m.nome, minimo: m.minimo, maximo: m.maximo, dezenasMin: m.dezenasMin, dezenasMax: m.dezenasMax };
  });
}


// ======================= backend/src/05_api.js =======================
// ===== API HTTP (doGet/doPost) =====
var ACOES = {
  'cadastrar':             { nivel: 'publico', fn: function (d) { return cadastrar(d); } },
  'login':                 { nivel: 'publico', fn: function (d) { return login(d); } },
  'logout':                { nivel: 'publico', fn: function (d) { return logout(d); } },
  'eu':                    { nivel: 'usuario', fn: function (d, u) { return usuarioPublico(u); } },
  'modalidades':           { nivel: 'usuario', fn: function () { return modalidadesDisponiveis(); } },
  'boloes.abertos':        { nivel: 'usuario', fn: function () { return boloesAbertos(); } },
  'cotas.minhas':          { nivel: 'usuario', fn: function (d, u) { return minhasCotas(u); } },
  'cotas.criar':           { nivel: 'usuario', fn: function (d, u) { return criarCota(u, d); } },
  'cotas.cancelar':        { nivel: 'usuario', fn: function (d, u) { return cancelarCota(u, d); } },
  'jogos.salvar':          { nivel: 'usuario', fn: function (d, u) { return salvarJogo(u, d); } },
  'jogos.remover':         { nivel: 'usuario', fn: function (d, u) { return removerJogo(u, d); } },
  'admin.convites.criar':  { nivel: 'admin',   fn: function (d, u) { return criarConvite(u, d); } },
  'admin.convites.listar': { nivel: 'admin',   fn: function () { return listarConvites(); } },
  'admin.convites.revogar': { nivel: 'admin',  fn: function (d) { return revogarConvite(d); } },
  'admin.boloes.listar':   { nivel: 'admin',   fn: function (d) { return listarBoloesAdmin(d); } },
  'admin.boloes.criar':    { nivel: 'admin',   fn: function (d, u) { return criarBolao(u, d); } },
  'admin.boloes.editar':   { nivel: 'admin',   fn: function (d) { return editarBolao(d); } },
  'admin.boloes.status':   { nivel: 'admin',   fn: function (d) { return alterarStatusBolao(d); } },
  'admin.boloes.excluir':  { nivel: 'admin',   fn: function (d) { return excluirBolao(d); } }
};

function despachar(corpo) {
  try {
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw erroNegocio('Requisição inválida.');
    var def = Object.prototype.hasOwnProperty.call(ACOES, corpo.acao) ? ACOES[corpo.acao] : null;
    if (!def) throw erroNegocio('Ação desconhecida.');
    var usuario = null;
    if (def.nivel === 'usuario') usuario = autenticar(corpo.token);
    if (def.nivel === 'admin') usuario = exigirAdmin(corpo.token);
    return { ok: true, dados: def.fn(corpo, usuario), agora: RELOGIO.agora() };
  } catch (err) {
    if (err && err.negocio) return { ok: false, erro: err.message };
    console.error('Erro interno: ' + (err && err.stack ? err.stack : err));
    return { ok: false, erro: 'Erro interno. Tente novamente.' };
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var corpo = null;
  try {
    corpo = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, erro: 'Requisição inválida.' });
  }
  return responder(despachar(corpo));
}

function doGet() {
  return responder({ ok: true, servico: 'bolao-api' });
}


// ======================= backend/src/06_setup.js =======================
// ===== Funções para rodar manualmente no editor do Apps Script =====

/** Passo 1: cria as abas e guarda o ID da planilha. Pode ser executada de novo sem perder dados. */
function configurar() {
  var ss = SpreadsheetApp.getActive();
  props().setProperty('PLANILHA_ID', ss.getId());
  var nomes = Object.keys(CFG.ABAS);
  for (var i = 0; i < nomes.length; i++) {
    var nome = nomes[i];
    var cols = CFG.ABAS[nome];
    var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  Logger.log('Configuração concluída. Abas: ' + nomes.join(', '));
}

/** Passo 2: gera o código de convite do primeiro administrador (aparece no registro de execução). */
function primeiroAdmin() {
  var admins = lerTabela('Usuarios').filter(function (u) { return u.papel === 'admin'; });
  if (admins.length > 0) {
    Logger.log('Já existe um administrador cadastrado. Nada foi criado.');
    return;
  }
  var conv = comLock(function () { return criarConviteInterno('admin', 'sistema', CFG.CONVITE_HORAS_PADRAO); });
  Logger.log('CÓDIGO DO PRIMEIRO ADMINISTRADOR (uso único, válido por ' + CFG.CONVITE_HORAS_PADRAO + 'h): ' + conv.codigo);
}

/** Passo 3: confere no seu ambiente real o que a simulação local não consegue provar. */
function testeRapido() {
  var falhas = [];
  var ss = planilha();

  // 1) Textos que o Planilhas costuma converter precisam voltar iguais (usa a mesma codificação do sistema).
  var amostras = ['12e4', '0123', '1-2-3', 'TRUE', '1,5', '12:30', '31/12/2026', '1/2', '=1+1', '2003', 'Maria Silva'];
  var tmp = ss.getSheetByName('_teste') || ss.insertSheet('_teste');
  try {
    tmp.clear();
    var linhaA = amostras.map(codificarTexto);
    linhaA.push(1700000000000);
    tmp.appendRow(linhaA);                                              // gravação por appendRow
    tmp.getRange(2, 1, 1, linhaA.length).setValues([linhaA]);           // gravação por setValues
    var lidas = tmp.getRange(1, 1, 2, linhaA.length).getValues();
    for (var r = 0; r < 2; r++) {
      for (var i = 0; i < amostras.length; i++) {
        var volta = decodificarTexto(lidas[r][i]);
        if (volta !== amostras[i]) falhas.push('linha ' + (r + 1) + ': "' + amostras[i] + '" voltou como "' + volta + '"');
      }
      if (Number(lidas[r][amostras.length]) !== 1700000000000) falhas.push('número grande voltou como ' + lidas[r][amostras.length]);
    }
  } finally {
    ss.deleteSheet(tmp);
  }

  // 2) Velocidade do hash de senha.
  var iter = iteracoesHash();
  var t0 = Date.now();
  var reg = hashSenha('senha-de-teste', iter);
  var ms = Date.now() - t0;
  if (!verificarSenha('senha-de-teste', reg)) falhas.push('verificação de senha falhou');
  if (verificarSenha('outra-senha', reg)) falhas.push('senha errada foi aceita');
  Logger.log('Hash de senha: ' + iter + ' iterações em ' + ms + ' ms.');
  if (ms > 3000) falhas.push('hash lento demais (' + ms + ' ms): reduza HASH_ITER nas Propriedades do Script');

  // 3) Lock.
  try {
    comLock(function () { return true; });
  } catch (e) {
    falhas.push('LockService: ' + e);
  }

  if (falhas.length === 0) Logger.log('TESTE RÁPIDO: TUDO OK.');
  else Logger.log('TESTE RÁPIDO: FALHOU -> ' + falhas.join(' | '));
}


// ======================= backend/src/07_cotas.js =======================
// ===== Cotas e jogos (participante) =====
function textoParaNumeros(t) {
  return String(t).split('-').filter(function (x) { return x !== ''; }).map(Number);
}

function cotaParaSaida(c, jogosDaCota) {
  var ordenados = jogosDaCota.slice().sort(function (a, b) { return (a.criadoEm || 0) - (b.criadoEm || 0); });
  return {
    id: c.id, bolaoId: c.bolaoId, status: c.status,
    jogos: ordenados.map(function (j) { return { id: j.id, numeros: textoParaNumeros(j.numeros) }; })
  };
}

/** Só o dono acessa a cota. Cota abandonada há mais de 48h é encerrada aqui (chamar dentro de comLock). */
function minhaCotaOuErro(u, cotaId, agora) {
  var c = lerTabela('Cotas').filter(function (x) { return x.id === cotaId && x.userId === u.id && x.status !== 'expirada'; })[0];
  if (!c) throw erroNegocio('Cota não encontrada.');
  if (!cotaOcupaVaga(c, agora)) {
    c.status = 'expirada';
    atualizar('Cotas', c._linha, c);
    throw erroNegocio('Esta cota expirou por inatividade. Inicie uma nova.');
  }
  return c;
}

function exigirEditavel(c, b, agora) {
  if (b.status !== 'aberto') throw erroNegocio('Este bolão não está aberto para alterações.');
  if (b.prazo <= agora) throw erroNegocio('O prazo deste bolão terminou.');
  if (c.status !== 'rascunho' && c.status !== 'completa') throw erroNegocio('Esta cota não pode mais ser alterada.');
}

function reavaliarStatus(c, b, qtdJogos, agora) {
  var novo = (qtdJogos === b.jogosPorCota) ? 'completa' : 'rascunho';
  if (novo !== c.status && Rateio.podeTransitar(c.status, novo)) c.status = novo;
  c.atualizadoEm = agora;
  atualizar('Cotas', c._linha, c);
}

function minhasCotas(u) {
  var agora = RELOGIO.agora();
  var jogos = lerTabela('Jogos');
  return lerTabela('Cotas')
    .filter(function (c) { return c.userId === u.id && cotaOcupaVaga(c, agora); })
    .map(function (c) { return cotaParaSaida(c, jogos.filter(function (j) { return j.cotaId === c.id; })); });
}

function criarCota(u, d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var b = achaBolao(d.bolaoId);
    if (b.status !== 'aberto') throw erroNegocio('Este bolão não está aberto.');
    if (b.prazo <= agora) throw erroNegocio('O prazo deste bolão terminou.');
    var ocupadas = lerTabela('Cotas').filter(function (c) { return c.bolaoId === b.id && cotaOcupaVaga(c, agora); });
    if (ocupadas.length >= b.limiteCotas) throw erroNegocio('Todas as cotas deste bolão já foram preenchidas.');
    var minhas = ocupadas.filter(function (c) { return c.userId === u.id; });
    if (minhas.length >= b.maxCotasPorPessoa) throw erroNegocio('Você já atingiu o máximo de cotas deste bolão.');
    var c = { id: novoId(), bolaoId: b.id, userId: u.id, status: 'rascunho', criadoEm: agora, atualizadoEm: agora, confirmadaEm: '' };
    inserir('Cotas', c);
    return cotaParaSaida(c, []);
  });
}

function salvarJogo(u, d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var c = minhaCotaOuErro(u, d.cotaId, agora);
    var b = achaBolao(c.bolaoId);
    exigirEditavel(c, b, agora);
    var v = Regras.validarJogo(d.numeros, b);
    if (!v.ok) throw erroNegocio(v.erros.join(' '));
    var chave = Regras.chaveJogo(v.numeros);
    var jogos = lerTabela('Jogos').filter(function (j) { return j.cotaId === c.id; });

    var alvo = null;
    if (d.jogoId !== undefined && d.jogoId !== null) {
      alvo = jogos.filter(function (j) { return j.id === d.jogoId; })[0];
      if (!alvo) throw erroNegocio('Jogo não encontrado.');
    } else if (jogos.length >= b.jogosPorCota) {
      throw erroNegocio('Sua cota já tem todos os ' + b.jogosPorCota + ' jogos.');
    }
    var repetido = jogos.some(function (j) {
      return (!alvo || j.id !== alvo.id) && Regras.chaveJogo(textoParaNumeros(j.numeros)) === chave;
    });
    if (repetido) throw erroNegocio('Este jogo já está na sua cota.');

    if (alvo) {
      alvo.numeros = chave;
      atualizar('Jogos', alvo._linha, alvo);
    } else {
      var novo = { id: novoId(), cotaId: c.id, numeros: chave, criadoEm: agora };
      inserir('Jogos', novo);
      jogos.push(novo);
    }
    reavaliarStatus(c, b, jogos.length, agora);
    return cotaParaSaida(c, jogos);
  });
}

function removerJogo(u, d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var c = minhaCotaOuErro(u, d.cotaId, agora);
    var b = achaBolao(c.bolaoId);
    exigirEditavel(c, b, agora);
    var jogos = lerTabela('Jogos').filter(function (j) { return j.cotaId === c.id; });
    var alvo = jogos.filter(function (j) { return j.id === d.jogoId; })[0];
    if (!alvo) throw erroNegocio('Jogo não encontrado.');
    removerLinha('Jogos', alvo._linha);
    var restantes = jogos.filter(function (j) { return j.id !== alvo.id; });
    reavaliarStatus(c, b, restantes.length, agora);
    return cotaParaSaida(c, restantes);
  });
}

/** Desistir da cota antes do pagamento: libera a vaga e apaga os jogos. */
function cancelarCota(u, d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var c = minhaCotaOuErro(u, d.cotaId, agora);
    if (c.status !== 'rascunho' && c.status !== 'completa') throw erroNegocio('Esta cota não pode mais ser cancelada por aqui.');
    var jogos = lerTabela('Jogos').filter(function (j) { return j.cotaId === c.id; });
    jogos.sort(function (a, b) { return b._linha - a._linha; }); // de baixo para cima, para não deslocar as linhas
    jogos.forEach(function (j) { removerLinha('Jogos', j._linha); });
    c.status = 'expirada';
    c.atualizadoEm = agora;
    atualizar('Cotas', c._linha, c);
    return { id: c.id, cancelada: true };
  });
}

