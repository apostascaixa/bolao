// ===== Limpeza de dados de teste (apaga bolões e tudo que depende deles) =====
function contagemLimpeza() {
  var cotas = lerTabela('Cotas');
  return {
    boloes: lerTabela('Boloes').length,
    cotas: cotas.length,
    confirmadas: cotas.filter(function (c) { return c.status === 'confirmada'; }).length,
    aguardando: cotas.filter(function (c) { return c.status === 'aguardando_pagamento'; }).length,
    jogos: lerTabela('Jogos').length,
    comprovantes: lerTabela('Auditoria').filter(function (e) { return e.tipo === 'comprovante'; }).length,
    conferencias: lerTabela('Conferencias').length,
    participantes: lerTabela('Usuarios').filter(function (u) { return u.papel !== 'admin'; }).length
  };
}

function apagarLinhasDaAba(nome) {
  var sh = aba(nome);
  var ult = sh.getLastRow();
  if (ult > 1) sh.deleteRows(2, ult - 1);
}

/**
 * Apaga todos os bolões, cotas, jogos, auditoria (com as imagens dos comprovantes) e conferências.
 * Mantém administradores, PIX, QR, banners e convites ainda não usados.
 * Com incluirParticipantes, apaga também as contas que não são de administrador.
 */
function limparTudo(d) {
  return comLock(function () {
    if (d.confirmacao !== 'APAGAR TUDO') throw erroNegocio('Confirmação incorreta. Digite exatamente APAGAR TUDO.');
    var antes = contagemLimpeza();

    lerTabela('Auditoria').forEach(function (e) { if (e.imagemId) removerImagemInterna(e.imagemId); });
    ['Jogos', 'Cotas', 'Auditoria', 'Conferencias', 'Boloes'].forEach(apagarLinhasDaAba);

    if (d.incluirParticipantes === true) {
      var alvo = {};
      var usuarios = lerTabela('Usuarios').filter(function (u) { return u.papel !== 'admin'; });
      usuarios.forEach(function (u) { alvo[u.id] = true; });
      var sessoes = lerTabela('Sessoes').filter(function (s) { return alvo[s.userId]; }).sort(function (a, b) { return b._linha - a._linha; });
      sessoes.forEach(function (s) { removerLinha('Sessoes', s._linha); });
      var convites = lerTabela('Convites').filter(function (c) { return c.usadoPor && alvo[c.usadoPor]; }).sort(function (a, b) { return b._linha - a._linha; });
      convites.forEach(function (c) { removerLinha('Convites', c._linha); });
      usuarios.sort(function (a, b) { return b._linha - a._linha; }).forEach(function (u) { removerLinha('Usuarios', u._linha); });
    }
    console.log('Limpeza de dados de teste: ' + JSON.stringify(antes) + ' (participantes incluídos: ' + (d.incluirParticipantes === true) + ')');
    return antes;
  });
}
