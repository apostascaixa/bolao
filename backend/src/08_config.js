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

// Espaços de propaganda do site (o banner do topo e o carrossel têm telas próprias).
var SLOT_NOMES = ['navbar', 'lateral', 'rodape'];
var SLOT_TIPOS = ['', 'imagem', 'codigo'];
var SLOT_CODIGO_MAX = 6000;

function lerSlots(c, publico) {
  var out = {};
  SLOT_NOMES.forEach(function (n) {
    var p = 'slot.' + n + '.';
    var tipo = SLOT_TIPOS.indexOf(c[p + 'tipo']) === -1 ? '' : (c[p + 'tipo'] || '');
    var s = { tipo: tipo, imagemId: c[p + 'imagemId'] || '', link: c[p + 'link'] || '', codigo: c[p + 'codigo'] || '' };
    if (publico) {
      // o público só recebe o que está em uso
      s = { tipo: tipo, imagemId: tipo === 'imagem' ? s.imagemId : '', link: tipo === 'imagem' ? s.link : '', codigo: tipo === 'codigo' ? s.codigo : '' };
    }
    out[n] = s;
  });
  return out;
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
    slots: lerSlots(c, false),
    loterias: { ativo: c['loterias.ativo'] !== '0', apiBase: c['loterias.apiBase'] || '', apiPadrao: LOTERIAS_BASE_PADRAO },
    banners: listarBanners(false)
  };
}

/** Só o que o público pode ver: nada de chave PIX. */
function configPublica() {
  var c = lerConfig();
  return {
    topo: { imagemId: c['topo.imagemId'] || '', link: c['topo.link'] || '' },
    carrossel: { segundos: segundosCarrossel(c), incluirBoloes: c['carrossel.incluirBoloes'] !== '0' },
    slots: lerSlots(c, true),
    loterias: { ativo: c['loterias.ativo'] !== '0' },
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
    if (d.slots !== undefined) {
      var sl = d.slots || {};
      SLOT_NOMES.forEach(function (n) {
        if (sl[n] === undefined) return;
        var s = sl[n] || {};
        var p = 'slot.' + n + '.';
        if (s.tipo !== undefined) {
          if (SLOT_TIPOS.indexOf(s.tipo) === -1) throw erroNegocio('Tipo de propaganda inválido.');
          pares[p + 'tipo'] = s.tipo;
        }
        if (s.link !== undefined) pares[p + 'link'] = validarLink(s.link);
        if (s.codigo !== undefined) {
          var cod = String(s.codigo === null ? '' : s.codigo).replace(/\r\n/g, '\n');
          if (cod.length > SLOT_CODIGO_MAX) throw erroNegocio('O código da propaganda passa de ' + SLOT_CODIGO_MAX + ' caracteres.');
          pares[p + 'codigo'] = cod;
        }
      });
    }
    var mudouLoterias = false;
    if (d.loterias !== undefined) {
      var lo = d.loterias || {};
      if (lo.ativo !== undefined) { pares['loterias.ativo'] = lo.ativo ? '1' : '0'; mudouLoterias = true; }
      if (lo.apiBase !== undefined) { pares['loterias.apiBase'] = validarBaseLoterias(lo.apiBase); mudouLoterias = true; }
    }
    gravarConfig(pares);
    if (mudouLoterias) limparCacheLoterias();
    return configParaAdmin();
  });
}
