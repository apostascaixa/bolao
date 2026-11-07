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
    concurso: b.concurso || 0, registradoEm: b.registradoEm || 0,
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
      var saida = bolaoParaSaida(b, n);
      saida.confirmadas = todas.filter(function (c) { return c.bolaoId === b.id && c.status === 'confirmada'; }).length;
      saida.aguardando = todas.filter(function (c) { return c.bolaoId === b.id && c.status === 'aguardando_pagamento'; }).length;
      return saida;
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
    return { id: id, nome: m.nome, minimo: m.minimo, maximo: m.maximo, dezenasMin: m.dezenasMin, dezenasMax: m.dezenasMax, sorteados: m.sorteados };
  });
}
