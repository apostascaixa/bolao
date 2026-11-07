// ===== Auditoria (registro oficial) e conferência de resultados =====
var LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function letraJogo(i) {
  return i < 26 ? LETRAS.charAt(i) : LETRAS.charAt(Math.floor(i / 26) - 1) + LETRAS.charAt(i % 26);
}

function statusAuditavel(b) {
  return b.status === 'aberto' || b.status === 'fechado';
}

/** Cotas confirmadas de um bolão, na ordem de confirmação, com nome e jogos. */
function cotasConfirmadasDetalhe(bolaoId) {
  var cotas = lerTabela('Cotas')
    .filter(function (c) { return c.bolaoId === bolaoId && c.status === 'confirmada'; })
    .sort(function (a, b) { return (a.confirmadaEm || 0) - (b.confirmadaEm || 0); });
  var jogos = lerTabela('Jogos');
  var usuarios = lerTabela('Usuarios');
  return cotas.map(function (c) {
    var u = usuarios.filter(function (x) { return x.id === c.userId; })[0];
    return {
      nome: u ? u.nome : '(removido)', usuario: u ? u.usuario : '?',
      jogos: jogos.filter(function (j) { return j.cotaId === c.id; })
        .sort(function (x, y) { return (x.criadoEm || 0) - (y.criadoEm || 0); })
        .map(function (j) { return textoParaNumeros(j.numeros); })
    };
  });
}

function jogosDoSistema(detalhe) {
  var out = [];
  detalhe.forEach(function (d) { d.jogos.forEach(function (j) { out.push(j); }); });
  return out;
}

function compararRegistro(b, texto, sistema) {
  var ex = Conf.extrairJogos(texto, b.qtdNumeros, b.modalidade);
  var cmp = Conf.compararJogos(ex.jogos, sistema);
  return {
    registrados: ex.jogos.length, ignoradas: ex.ignoradas.length, iguais: cmp.iguais,
    faltamNoRegistro: cmp.faltamNoRegistro, sobramNoRegistro: cmp.sobramNoRegistro,
    confere: ex.jogos.length > 0 && cmp.faltamNoRegistro.length === 0 && cmp.sobramNoRegistro.length === 0
  };
}

function resumoAuditoria() {
  var entradas = lerTabela('Auditoria');
  return lerTabela('Boloes').filter(statusAuditavel).map(function (b) {
    var det = cotasConfirmadasDetalhe(b.id);
    var sistema = jogosDoSistema(det);
    var minhas = entradas.filter(function (e) { return e.bolaoId === b.id; });
    var txt = minhas.filter(function (e) { return e.tipo === 'jogos'; })[0];
    var mod = Regras.obterModalidade(b.modalidade);
    return {
      id: b.id, nome: b.nome, modalidade: b.modalidade, modalidadeNome: mod ? mod.nome : b.modalidade, qtdNumeros: b.qtdNumeros,
      concurso: b.concurso || 0, registradoEm: b.registradoEm || 0,
      cotasConfirmadas: det.length, jogosNoSistema: sistema.length,
      comprovantes: minhas.filter(function (e) { return e.tipo === 'comprovante'; })
        .map(function (e) { return { id: e.id, imagemId: e.imagemId, criadoEm: e.criadoEm }; }),
      textoRegistrado: txt ? txt.texto : '',
      comparacao: txt ? compararRegistro(b, txt.texto, sistema) : null
    };
  });
}

function bolaoAuditavelOuErro(id) {
  var b = achaBolao(id);
  if (!statusAuditavel(b)) throw erroNegocio('Só bolões abertos ou fechados entram na auditoria.');
  return b;
}

function enviarComprovante(d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var b = bolaoAuditavelOuErro(d.bolaoId);
    var minhas = lerTabela('Auditoria').filter(function (e) { return e.bolaoId === b.id && e.tipo === 'comprovante'; });
    if (minhas.length >= 20) throw erroNegocio('Limite de 20 comprovantes por bolão.');
    var v = validarDataUrl(d.dataUrl);
    var imagemId = salvarImagemInterna(v, agora);
    inserir('Auditoria', { id: novoId(), bolaoId: b.id, tipo: 'comprovante', imagemId: imagemId, texto: '', criadoEm: agora });
    return resumoAuditoria();
  });
}

function removerEntradaAuditoria(d) {
  return comLock(function () {
    var todas = lerTabela('Auditoria');
    var e = todas.filter(function (x) { return x.id === d.id; })[0];
    if (!e) throw erroNegocio('Registro não encontrado.');
    var b = achaBolao(e.bolaoId);
    var restantes = todas.filter(function (x) { return x.bolaoId === e.bolaoId && x.id !== e.id; }).length;
    if (b.registradoEm > 0 && restantes === 0) throw erroNegocio('Desfaça o registro oficial antes de remover o último comprovante.');
    removerLinha('Auditoria', e._linha);
    if (e.imagemId) removerImagemInterna(e.imagemId);
    return resumoAuditoria();
  });
}

function salvarJogosRegistrados(d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var b = bolaoAuditavelOuErro(d.bolaoId);
    var texto = String(d.texto === undefined || d.texto === null ? '' : d.texto);
    if (texto.length > 40000) throw erroNegocio('Texto grande demais (máximo de 40 mil caracteres).');
    var atual = lerTabela('Auditoria').filter(function (e) { return e.bolaoId === b.id && e.tipo === 'jogos'; })[0];
    if (texto.trim() === '') {
      if (atual) {
        var restantes = lerTabela('Auditoria').filter(function (e) { return e.bolaoId === b.id && e.id !== atual.id; }).length;
        if (b.registradoEm > 0 && restantes === 0) throw erroNegocio('Desfaça o registro oficial antes de apagar os jogos registrados.');
        removerLinha('Auditoria', atual._linha);
      }
    } else if (atual) {
      atual.texto = texto; atual.criadoEm = agora;
      atualizar('Auditoria', atual._linha, atual);
    } else {
      inserir('Auditoria', { id: novoId(), bolaoId: b.id, tipo: 'jogos', imagemId: '', texto: texto, criadoEm: agora });
    }
    return resumoAuditoria();
  });
}

function registrarBolao(d) {
  return comLock(function () {
    var b = bolaoAuditavelOuErro(d.bolaoId);
    if (!Number.isInteger(d.concurso) || d.concurso < 1 || d.concurso > 99999) throw erroNegocio('Informe o número do concurso (inteiro de 1 a 99999).');
    var tem = lerTabela('Auditoria').some(function (e) { return e.bolaoId === b.id; });
    if (!tem) throw erroNegocio('Envie ao menos um comprovante ou os jogos registrados antes de marcar o registro oficial.');
    b.concurso = d.concurso;
    b.registradoEm = RELOGIO.agora();
    b.atualizadoEm = b.registradoEm;
    atualizar('Boloes', b._linha, b);
    return resumoAuditoria();
  });
}

function desregistrarBolao(d) {
  return comLock(function () {
    var b = bolaoAuditavelOuErro(d.bolaoId);
    b.concurso = 0;
    b.registradoEm = 0;
    b.atualizadoEm = RELOGIO.agora();
    atualizar('Boloes', b._linha, b);
    return resumoAuditoria();
  });
}

// ----- conferência com o resultado oficial -----
function consultarConferencia(d) {
  return comLock(function () {
    var mod = Regras.obterModalidade(d.modalidade);
    if (!mod) throw erroNegocio('Modalidade desconhecida.');
    if (!Number.isInteger(d.concurso) || d.concurso < 1 || d.concurso > 99999) throw erroNegocio('Informe o número do concurso (inteiro de 1 a 99999).');
    var v = Conf.validarResultado(d.resultado, d.modalidade);
    if (!v.ok) throw erroNegocio(v.erros.join(' '));

    var todos = lerTabela('Boloes').filter(function (b) { return statusAuditavel(b) && b.modalidade === d.modalidade; });
    var registrados = todos.filter(function (b) { return b.registradoEm > 0 && b.concurso === d.concurso; });
    var naoRegistrados = todos.filter(function (b) { return !(b.registradoEm > 0 && b.concurso === d.concurso); })
      .map(function (b) { return { nome: b.nome, registrado: b.registradoEm > 0, concurso: b.concurso || 0 }; });
    var entradas = lerTabela('Auditoria');

    var boloes = registrados.map(function (b) {
      var det = cotasConfirmadasDetalhe(b.id);
      var premiados = [];
      var faixas = {};
      var conferidos = 0;
      var melhor = 0;
      det.forEach(function (p) {
        p.jogos.forEach(function (j, i) {
          conferidos++;
          var r = Conf.conferirJogo(j, v.numeros, b.modalidade);
          if (r.acertos > melhor) melhor = r.acertos;
          if (r.premios.length > 0) {
            premiados.push({ participante: p.nome, usuario: p.usuario, letra: letraJogo(i), numeros: j, acertados: r.acertados, acertos: r.acertos, premios: r.premios });
            r.premios.forEach(function (pr) { faixas[pr.nome] = (faixas[pr.nome] || 0) + pr.quantidade; });
          }
        });
      });
      var txt = entradas.filter(function (e) { return e.bolaoId === b.id && e.tipo === 'jogos'; })[0];
      var divergencias = null;
      if (txt) {
        var cmp = compararRegistro(b, txt.texto, jogosDoSistema(det));
        divergencias = cmp.confere ? 0 : Math.max(1, cmp.faltamNoRegistro.length + cmp.sobramNoRegistro.length);
      }
      return { id: b.id, nome: b.nome, cotas: det.length, jogosConferidos: conferidos, melhorAcerto: melhor, premiados: premiados, faixas: faixas, divergencias: divergencias };
    });
    var total = boloes.reduce(function (s, b) { return s + b.premiados.length; }, 0);
    inserir('Conferencias', { id: novoId(), modalidade: d.modalidade, concurso: d.concurso, resultado: v.numeros.join('-'), premiados: total, criadoEm: RELOGIO.agora() });
    return { modalidade: d.modalidade, modalidadeNome: mod.nome, concurso: d.concurso, resultado: v.numeros, boloes: boloes, naoRegistrados: naoRegistrados, totalPremiados: total };
  });
}

function historicoConferencias() {
  return lerTabela('Conferencias').sort(function (a, b) { return b.criadoEm - a.criadoEm; }).slice(0, 30).map(function (c) {
    var mod = Regras.obterModalidade(c.modalidade);
    return { id: c.id, modalidade: c.modalidade, modalidadeNome: mod ? mod.nome : c.modalidade, concurso: c.concurso, resultado: textoParaNumeros(c.resultado), premiados: c.premiados, criadoEm: c.criadoEm };
  });
}
