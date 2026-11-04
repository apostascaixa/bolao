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
