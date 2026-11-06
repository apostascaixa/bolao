// ===== Configurações do administrador: PIX, banner do topo, carrossel =====
function lerConfig() {
  var o = {};
  lerTabela('Config').forEach(function (r) { o[r.chave] = r.valor; });
  return o;
}

/** Chamar dentro de comLock. */
function gravarConfig(pares) {
  var t = lerTabela('Config');
  Object.keys(pares).forEach(function (k) {
    var ex = t.filter(function (r) { return r.chave === k; })[0];
    if (ex) { ex.valor = String(pares[k]); atualizar('Config', ex._linha, ex); }
    else inserir('Config', { chave: k, valor: String(pares[k]) });
  });
}

function segundosCarrossel(c) {
  var n = Number(c['carrossel.segundos']);
  return (n >= 2 && n <= 30) ? n : 6;
}

function validarLink(l) {
  l = String(l === undefined || l === null ? '' : l).trim();
  if (l === '') return '';
  if (!/^https:\/\/[^\s]+$/i.test(l) || l.length > 300) throw erroNegocio('O link deve começar com https:// e não ter espaços.');
  return l;
}

function listarBanners(soAtivos) {
  return lerTabela('Banners')
    .filter(function (b) { return !soAtivos || b.ativo === 1; })
    .sort(function (a, b) { return a.ordem - b.ordem; })
    .map(function (b) { return { id: b.id, imagemId: b.imagemId, titulo: b.titulo, link: b.link, ativo: b.ativo === 1, ordem: b.ordem }; });
}

function configParaAdmin() {
  var c = lerConfig();
  return {
    pix: { chave: c['pix.chave'] || '', nome: c['pix.nome'] || '', cidade: c['pix.cidade'] || '', instrucoes: c['pix.instrucoes'] || '', qrImagemId: c['pix.qrImagemId'] || '' },
    topo: { imagemId: c['topo.imagemId'] || '', link: c['topo.link'] || '' },
    carrossel: { segundos: segundosCarrossel(c), incluirBoloes: c['carrossel.incluirBoloes'] !== '0' },
    banners: listarBanners(false)
  };
}

/** Só o que o público pode ver: nada de chave PIX. */
function configPublica() {
  var c = lerConfig();
  return {
    topo: { imagemId: c['topo.imagemId'] || '', link: c['topo.link'] || '' },
    carrossel: { segundos: segundosCarrossel(c), incluirBoloes: c['carrossel.incluirBoloes'] !== '0' },
    banners: listarBanners(true).map(function (b) { return { id: b.id, imagemId: b.imagemId, titulo: b.titulo, link: b.link }; })
  };
}

function salvarConfig(d) {
  return comLock(function () {
    var pares = {};
    if (d.pix !== undefined) {
      var p = d.pix || {};
      var chave = String(p.chave === undefined || p.chave === null ? '' : p.chave).trim();
      var nome = limparTexto(p.nome, 60);
      var cidade = limparTexto(p.cidade, 30);
      var instr = limparTexto(p.instrucoes, 300);
      if (chave.length > 140) throw erroNegocio('Chave PIX muito longa.');
      if (chave !== '') {
        if (!nome || !cidade) throw erroNegocio('Com a chave PIX, informe também o nome do recebedor e a cidade.');
        try {
          Pix.gerarPix({ chave: chave, nomeRecebedor: nome, cidade: cidade, valorCentavos: 100 });
        } catch (e) {
          throw erroNegocio('Dados do PIX inválidos: ' + e.message);
        }
      }
      pares['pix.chave'] = chave; pares['pix.nome'] = nome; pares['pix.cidade'] = cidade; pares['pix.instrucoes'] = instr;
    }
    if (d.topo !== undefined) pares['topo.link'] = validarLink((d.topo || {}).link);
    if (d.carrossel !== undefined) {
      var cr = d.carrossel || {};
      if (cr.segundos !== undefined) {
        if (!Number.isInteger(cr.segundos) || cr.segundos < 2 || cr.segundos > 30) throw erroNegocio('A velocidade deve ser de 2 a 30 segundos por banner.');
        pares['carrossel.segundos'] = cr.segundos;
      }
      if (cr.incluirBoloes !== undefined) pares['carrossel.incluirBoloes'] = cr.incluirBoloes ? '1' : '0';
    }
    gravarConfig(pares);
    return configParaAdmin();
  });
}
