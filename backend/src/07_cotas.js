// ===== Cotas e jogos (participante) =====
function textoParaNumeros(t) {
  return String(t).split('-').filter(function (x) { return x !== ''; }).map(Number);
}

function cotaParaSaida(c, jogosDaCota) {
  var ordenados = jogosDaCota.slice().sort(function (a, b) { return (a.criadoEm || 0) - (b.criadoEm || 0); });
  return {
    id: c.id, bolaoId: c.bolaoId, status: c.status, observacao: c.observacao || '',
    pixGeradoEm: c.pixGeradoEm || 0, confirmadaEm: c.confirmadaEm || 0,
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
