// ===== Base: configuração, erros, utilitários =====
var G = (typeof globalThis !== 'undefined') ? globalThis : this;
var Regras = G.BolaoRegras;
var Rateio = G.BolaoRateio;
var Pix = G.BolaoPix;
var Conf = G.BolaoConferencia;

var CFG = {
  ABAS: {
    Usuarios: ['id', 'usuario', 'nome', 'hashSenha', 'papel', 'status', 'tentativas', 'bloqueadoAte', 'criadoEm', 'conviteId'],
    Convites: ['id', 'codigoHash', 'papel', 'criadoPor', 'criadoEm', 'expiraEm', 'status', 'usadoPor', 'usadoEm'],
    Sessoes: ['tokenHash', 'userId', 'criadoEm', 'expiraEm'],
    Boloes: ['id', 'nome', 'modalidade', 'qtdNumeros', 'valorCotaCentavos', 'jogosPorCota', 'limiteCotas', 'maxCotasPorPessoa', 'prazo', 'status', 'criadoPor', 'criadoEm', 'atualizadoEm', 'concurso', 'registradoEm'],
    Cotas: ['id', 'bolaoId', 'userId', 'status', 'criadoEm', 'atualizadoEm', 'confirmadaEm', 'pixGeradoEm', 'observacao'],
    Jogos: ['id', 'cotaId', 'numeros', 'criadoEm'],
    Config: ['chave', 'valor'],
    Banners: ['id', 'imagemId', 'titulo', 'link', 'ativo', 'ordem', 'criadoEm'],
    Imagens: ['id', 'parte', 'tipo', 'dados', 'criadoEm'],
    Auditoria: ['id', 'bolaoId', 'tipo', 'imagemId', 'texto', 'criadoEm'],
    Conferencias: ['id', 'modalidade', 'concurso', 'resultado', 'premiados', 'criadoEm']
  },
  COLUNAS_NUM: ['tentativas', 'bloqueadoAte', 'criadoEm', 'expiraEm', 'usadoEm', 'qtdNumeros', 'valorCotaCentavos',
    'jogosPorCota', 'limiteCotas', 'maxCotasPorPessoa', 'prazo', 'atualizadoEm', 'confirmadaEm', 'pixGeradoEm',
    'parte', 'ordem', 'ativo', 'concurso', 'registradoEm', 'premiados'],
  SESSAO_MS: 7 * 24 * 3600 * 1000,
  MAX_TENTATIVAS: 5,
  BLOQUEIO_MS: 10 * 60 * 1000,
  HASH_ITER_PADRAO: 1500,
  CONVITE_HORAS_PADRAO: 72,
  COTA_ABANDONO_MS: 48 * 3600 * 1000, // cota em rascunho/completa sem atividade por 48h libera a vaga
  IMG_MAX_B64: 300000,  // tamanho máximo da imagem em base64 (cerca de 225 KB)
  IMG_PARTE: 30000,     // cada célula guarda no máximo 30 mil caracteres
  MAX_BANNERS: 10
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
