// ===== Resultados das loterias (fonte configurável pelo administrador) =====
var LOTERIAS = [
  { chave: 'megasena',  nome: 'Mega-Sena' },
  { chave: 'lotofacil', nome: 'Lotofácil' },
  { chave: 'quina',     nome: 'Quina' }
];
var LOTERIAS_BASE_PADRAO = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/';
var LOTERIAS_CACHE_CHAVE = 'loterias.v1';
var LOTERIAS_CACHE_OK_S = 1800;   // resultado completo: 30 minutos
var LOTERIAS_CACHE_FALHA_S = 120; // algo falhou: tenta de novo em 2 minutos

/** Vazio = fonte padrão. Aceita "{loteria}" no endereço; sem ele, o nome da loteria é colocado no fim. */
function validarBaseLoterias(u) {
  u = String(u === undefined || u === null ? '' : u).trim();
  if (u === '') return '';
  if (!/^https:\/\/[^\s?#]+$/i.test(u) || u.length > 200) throw erroNegocio('O endereço da fonte deve começar com https:// e não ter espaços, ? ou #.');
  if (u.indexOf('{loteria}') === -1 && u.charAt(u.length - 1) !== '/') u += '/';
  return u;
}

function baseLoteriasDe(c) {
  return c['loterias.apiBase'] || LOTERIAS_BASE_PADRAO;
}

function urlLoteria(base, m) {
  return base.indexOf('{loteria}') !== -1 ? base.replace('{loteria}', m.chave) : base + m.chave;
}

/** Só aceita o que esperamos: números como número, dezenas como "01".."99", textos curtos. */
function normalizarLoteria(m, d) {
  d = d || {};
  var rateio = d.listaRateioPremio || d.premiacoes || [];
  var faixa = rateio[0] || {};
  var bruto = faixa.numeroDeGanhadores !== undefined ? faixa.numeroDeGanhadores
    : (faixa.ganhadores !== undefined ? faixa.ganhadores : faixa.vencedores);
  var dezenas = (d.listaDezenas || d.dezenas || []).map(function (x) { return String(x); })
    .filter(function (x) { return /^\d{1,2}$/.test(x); })
    .map(function (x) { return x.length === 1 ? '0' + x : x; });
  return {
    chave: m.chave,
    nome: m.nome,
    concurso: Number(d.numero !== undefined ? d.numero : d.concurso) || 0,
    data: String(d.dataApuracao || d.data || '').substring(0, 20),
    dezenas: dezenas,
    ganhadores: Number(bruto) || 0,
    acumulou: d.acumulado !== undefined ? !!d.acumulado : !!d.acumulou,
    proximoPremio: Number(d.valorEstimadoProximoConcurso || d.valorAcumuladoProximoConcurso) || 0,
    proximoData: String(d.dataProximoConcurso || '').substring(0, 20)
  };
}

/** Busca uma loteria na fonte. Lança erro com o motivo se falhar. */
function buscarUmaLoteria(base, m) {
  var r = UrlFetchApp.fetch(urlLoteria(base, m), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
  var item = normalizarLoteria(m, JSON.parse(r.getContentText()));
  if (!item.concurso || item.dezenas.length === 0) throw new Error('resposta sem concurso ou dezenas');
  return item;
}

function buscarResultadosLoterias(base) {
  var p = props();
  var lista = [];
  var falhas = [];
  LOTERIAS.forEach(function (m) {
    try {
      var item = buscarUmaLoteria(base, m);
      lista.push(item);
      p.setProperty('loterias.ultimo.' + m.chave, JSON.stringify(item));
    } catch (e) {
      falhas.push(m.nome + ': ' + (e && e.message ? e.message : e));
      var ultimo = p.getProperty('loterias.ultimo.' + m.chave); // se a fonte cair, mostra o último resultado bom
      if (ultimo) lista.push(JSON.parse(ultimo));
    }
  });
  return { lista: lista, falhas: falhas };
}

/** Público: resultados com cache de 30 minutos (visitantes não derrubam a fonte). */
function loteriasPublicas() {
  var c = lerConfig();
  if (c['loterias.ativo'] === '0') return { ativo: false, loterias: [] };
  var cache = CacheService.getScriptCache();
  var guardado = cache.get(LOTERIAS_CACHE_CHAVE);
  if (guardado) return JSON.parse(guardado);
  var r = buscarResultadosLoterias(baseLoteriasDe(c));
  var saida = { ativo: true, atualizadoEm: RELOGIO.agora(), loterias: r.lista };
  if (r.falhas.length > 0) console.error('Loterias: ' + r.falhas.join(' | '));
  cache.put(LOTERIAS_CACHE_CHAVE, JSON.stringify(saida), r.falhas.length > 0 ? LOTERIAS_CACHE_FALHA_S : LOTERIAS_CACHE_OK_S);
  return saida;
}

function limparCacheLoterias() {
  CacheService.getScriptCache().remove(LOTERIAS_CACHE_CHAVE);
}

/** Admin: testa uma fonte (a digitada ou a salva) sem usar o cache e sem gravar nada. */
function testarFonteLoterias(d) {
  var digitada = validarBaseLoterias(d.apiBase);
  var base = digitada || baseLoteriasDe(lerConfig());
  return LOTERIAS.map(function (m) {
    try {
      var i = buscarUmaLoteria(base, m);
      return { chave: m.chave, nome: m.nome, ok: true, concurso: i.concurso, dezenas: i.dezenas.length, ganhadores: i.ganhadores, acumulou: i.acumulou };
    } catch (e) {
      return { chave: m.chave, nome: m.nome, ok: false, erro: String(e && e.message ? e.message : e).substring(0, 120) };
    }
  });
}
