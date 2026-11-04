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
