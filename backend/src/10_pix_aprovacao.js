// ===== PIX, aprovação do administrador e página pública =====
function pixConfigurado(cfg) {
  return !!(cfg['pix.chave'] || cfg['pix.qrImagemId']);
}

/** Dados para o participante pagar: valor, copia e cola (se houver chave), QR (se houver) e instruções. */
function pixDaCota(c, b) {
  var cfg = lerConfig();
  var copia = '';
  if (cfg['pix.chave']) {
    copia = Pix.gerarPix({
      chave: cfg['pix.chave'], nomeRecebedor: cfg['pix.nome'], cidade: cfg['pix.cidade'],
      valorCentavos: b.valorCotaCentavos, txid: 'BOLAO' + String(c.id).replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 12)
    });
  }
  return {
    valorCentavos: b.valorCotaCentavos, copiaECola: copia, qrImagemId: cfg['pix.qrImagemId'] || '',
    instrucoes: cfg['pix.instrucoes'] || '', nomeRecebedor: cfg['pix.nome'] || ''
  };
}

function gerarPixCota(u, d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var c = minhaCotaOuErro(u, d.cotaId, agora);
    var b = achaBolao(c.bolaoId);
    if (b.status !== 'aberto') throw erroNegocio('Este bolão não está aberto.');
    if (b.prazo <= agora) throw erroNegocio('O prazo deste bolão terminou.');
    var jogos = lerTabela('Jogos').filter(function (j) { return j.cotaId === c.id; });
    if (c.status !== 'completa' || jogos.length !== b.jogosPorCota) throw erroNegocio('Complete todos os ' + b.jogosPorCota + ' jogos antes de gerar o PIX.');
    if (!pixConfigurado(lerConfig())) throw erroNegocio('O administrador ainda não configurou o PIX. Tente novamente mais tarde.');
    if (!Rateio.podeTransitar(c.status, 'aguardando_pagamento')) throw erroNegocio('Esta cota não pode gerar PIX agora.');
    c.status = 'aguardando_pagamento';
    c.pixGeradoEm = agora;
    c.atualizadoEm = agora;
    c.observacao = '';
    atualizar('Cotas', c._linha, c);
    return { cota: cotaParaSaida(c, jogos), pix: pixDaCota(c, b) };
  });
}

/** Releitura dos dados de pagamento (ao recarregar a página). */
function pixDaMinhaCota(u, d) {
  var c = lerTabela('Cotas').filter(function (x) { return x.id === d.cotaId && x.userId === u.id; })[0];
  if (!c || c.status !== 'aguardando_pagamento') throw erroNegocio('Esta cota não está aguardando pagamento.');
  return pixDaCota(c, achaBolao(c.bolaoId));
}

// ----- administrador -----
function listarCotasAdmin(d) {
  var filtro = Array.isArray(d.status) ? d.status : ['aguardando_pagamento', 'confirmada'];
  var boloes = lerTabela('Boloes');
  var usuarios = lerTabela('Usuarios');
  var jogos = lerTabela('Jogos');
  return lerTabela('Cotas')
    .filter(function (c) { return filtro.indexOf(c.status) !== -1; })
    .sort(function (a, b) { return (a.pixGeradoEm || a.criadoEm) - (b.pixGeradoEm || b.criadoEm); })
    .map(function (c) {
      var b = boloes.filter(function (x) { return x.id === c.bolaoId; })[0];
      var u = usuarios.filter(function (x) { return x.id === c.userId; })[0];
      return {
        id: c.id, bolaoId: c.bolaoId, bolaoNome: b ? b.nome : '(bolão removido)', valorCentavos: b ? b.valorCotaCentavos : 0,
        status: c.status, pixGeradoEm: c.pixGeradoEm || 0, confirmadaEm: c.confirmadaEm || 0,
        usuario: u ? { usuario: u.usuario, nome: u.nome } : { usuario: '?', nome: '(removido)' },
        jogos: jogos.filter(function (j) { return j.cotaId === c.id; })
          .sort(function (x, y) { return (x.criadoEm || 0) - (y.criadoEm || 0); })
          .map(function (j) { return textoParaNumeros(j.numeros); })
      };
    });
}

function cotaPendenteOuErro(id) {
  var c = lerTabela('Cotas').filter(function (x) { return x.id === id; })[0];
  if (!c) throw erroNegocio('Cota não encontrada.');
  if (c.status !== 'aguardando_pagamento') throw erroNegocio('Esta cota não está aguardando aprovação.');
  return c;
}

function aprovarCota(d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var c = cotaPendenteOuErro(d.cotaId);
    if (!Rateio.podeTransitar(c.status, 'confirmada')) throw erroNegocio('Transição não permitida.');
    c.status = 'confirmada';
    c.confirmadaEm = agora;
    c.atualizadoEm = agora;
    c.observacao = '';
    atualizar('Cotas', c._linha, c);
    return { id: c.id, status: c.status };
  });
}

function reprovarCota(d) {
  return comLock(function () {
    var motivo = limparTexto(d.motivo, 200);
    if (motivo.length < 3) throw erroNegocio('Informe o motivo da reprovação (mínimo 3 caracteres).');
    var agora = RELOGIO.agora();
    var c = cotaPendenteOuErro(d.cotaId);
    if (!Rateio.podeTransitar(c.status, 'completa')) throw erroNegocio('Transição não permitida.');
    c.status = 'completa';
    c.pixGeradoEm = '';
    c.atualizadoEm = agora;
    c.observacao = motivo;
    atualizar('Cotas', c._linha, c);
    return { id: c.id, status: c.status };
  });
}

// ----- página pública -----
function nomeAbreviado(nome) {
  var p = String(nome).trim().split(/\s+/);
  if (p.length < 2) return p[0] || '';
  return p[0] + ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.';
}

/** Só participantes aprovados; nome abreviado, sem usuário nem contato. */
function paginaPublica() {
  var cotas = lerTabela('Cotas').filter(function (c) { return c.status === 'confirmada'; });
  var jogos = lerTabela('Jogos');
  var usuarios = lerTabela('Usuarios');
  return lerTabela('Boloes')
    .filter(function (b) { return b.status === 'aberto' || b.status === 'fechado'; })
    .map(function (b) {
      var minhas = cotas.filter(function (c) { return c.bolaoId === b.id; })
        .sort(function (x, y) { return (x.confirmadaEm || 0) - (y.confirmadaEm || 0); });
      var mod = Regras.obterModalidade(b.modalidade);
      return {
        id: b.id, nome: b.nome, modalidade: b.modalidade, modalidadeNome: mod ? mod.nome : b.modalidade,
        qtdNumeros: b.qtdNumeros, jogosPorCota: b.jogosPorCota, valorCotaCentavos: b.valorCotaCentavos,
        limiteCotas: b.limiteCotas, prazo: b.prazo, status: b.status, confirmadas: minhas.length,
        concurso: b.concurso || 0, registradoEm: b.registradoEm || 0,
        participantes: minhas.map(function (c, idx) {
          var u = usuarios.filter(function (x) { return x.id === c.userId; })[0];
          var cod = sha256Hex('recibo|' + c.id).substring(0, 16).toUpperCase();
          return {
            nome: u ? nomeAbreviado(u.nome) : 'Participante',
            cotaNumero: idx + 1, confirmadaEm: c.confirmadaEm || 0,
            codigo: cod.substring(0, 4) + '-' + cod.substring(4, 8) + '-' + cod.substring(8, 12) + '-' + cod.substring(12, 16),
            jogos: jogos.filter(function (j) { return j.cotaId === c.id; })
              .sort(function (x, y) { return (x.criadoEm || 0) - (y.criadoEm || 0); })
              .map(function (j) { return textoParaNumeros(j.numeros); })
          };
        })
      };
    });
}
