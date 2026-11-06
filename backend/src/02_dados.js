// ===== Acesso à planilha =====
var PLANILHA_EM_CACHE = null; // vale só durante uma execução (cada chamada à API reinicia as variáveis globais)

function planilha() {
  if (PLANILHA_EM_CACHE) return PLANILHA_EM_CACHE;
  var id = props().getProperty('PLANILHA_ID');
  if (!id) throw new Error('Execute configurar() primeiro.');
  PLANILHA_EM_CACHE = SpreadsheetApp.openById(id);
  return PLANILHA_EM_CACHE;
}

/** Devolve a aba; se ela ainda não existe (versão nova do sistema), cria com o cabeçalho. */
function aba(nome) {
  var ss = planilha();
  var s = ss.getSheetByName(nome);
  if (!s) {
    var cols = CFG.ABAS[nome];
    if (!cols) throw new Error('Aba desconhecida: ' + nome);
    try {
      s = ss.insertSheet(nome);
    } catch (e) {
      s = ss.getSheetByName(nome); // outra execução criou ao mesmo tempo
      if (!s) throw e;
    }
    s.getRange(1, 1, 1, cols.length).setValues([cols]);
    s.setFrozenRows(1);
  }
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
