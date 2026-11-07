// ===== Imagens (guardadas na planilha, em partes) e banners =====
var ASSINATURAS_IMG = { 'image/png': 'iVBORw0KGgo', 'image/jpeg': '/9j/', 'image/webp': 'UklGR' };

function validarDataUrl(dataUrl) {
  var m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+\/]+={0,2})$/.exec(String(dataUrl === undefined || dataUrl === null ? '' : dataUrl));
  if (!m) throw erroNegocio('Imagem inválida. Envie PNG, JPEG ou WEBP.');
  if (m[2].length > CFG.IMG_MAX_B64) throw erroNegocio('Imagem grande demais. Use uma imagem menor.');
  if (m[2].indexOf(ASSINATURAS_IMG[m[1]]) !== 0) throw erroNegocio('O arquivo não parece ser uma imagem válida.');
  return { tipo: m[1], b64: m[2] };
}

/** Chamar dentro de comLock. Grava a imagem em linhas consecutivas e devolve o id. */
function salvarImagemInterna(v, agora) {
  var id = novoId();
  var linhas = [];
  for (var i = 0, parte = 0; i < v.b64.length; i += CFG.IMG_PARTE, parte++) {
    linhas.push(linhaDe('Imagens', { id: id, parte: parte, tipo: v.tipo, dados: v.b64.substring(i, i + CFG.IMG_PARTE), criadoEm: agora }));
  }
  var sh = aba('Imagens');
  sh.getRange(sh.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
  return id;
}

/** Linhas (números) onde a imagem está, lendo só a coluna do id. */
function linhasDaImagem(id) {
  var sh = aba('Imagens');
  var ult = sh.getLastRow();
  var out = [];
  if (ult < 2) return out;
  var ids = sh.getRange(2, 1, ult - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (decodificarTexto(ids[i][0]) === id) out.push(i + 2);
  return out;
}

function lerImagemDataUrl(id) {
  var linhas = linhasDaImagem(id);
  if (linhas.length === 0) return null;
  var sh = aba('Imagens');
  var ini = linhas[0];
  var fim = linhas[linhas.length - 1];
  var vals = sh.getRange(ini, 1, fim - ini + 1, CFG.ABAS.Imagens.length).getValues()
    .filter(function (r) { return decodificarTexto(r[0]) === id; })
    .sort(function (a, b) { return Number(a[1]) - Number(b[1]); });
  var tipo = decodificarTexto(vals[0][2]);
  var b64 = vals.map(function (r) { return decodificarTexto(r[3]); }).join('');
  return 'data:' + tipo + ';base64,' + b64;
}

function removerImagemInterna(id) {
  if (!id) return;
  var linhas = linhasDaImagem(id);
  for (var i = linhas.length - 1; i >= 0; i--) removerLinha('Imagens', linhas[i]);
}

function idsImagensPermitidas() {
  var c = lerConfig();
  var ids = [c['topo.imagemId'], c['pix.qrImagemId']];
  lerTabela('Banners').forEach(function (b) { ids.push(b.imagemId); });
  lerTabela('Auditoria').forEach(function (e) { ids.push(e.imagemId); });
  return ids.filter(function (x) { return !!x; });
}

/** Público para banners; a imagem do QR do PIX exige login. */
function obterImagem(d) {
  var naoAchou = erroNegocio('Imagem não encontrada.');
  if (typeof d.id !== 'string' || d.id.length > 60) throw naoAchou;
  if (idsImagensPermitidas().indexOf(d.id) === -1) throw naoAchou;
  if (lerConfig()['pix.qrImagemId'] === d.id) autenticar(d.token);
  if (lerTabela('Auditoria').some(function (e) { return e.imagemId === d.id; })) exigirAdmin(d.token); // comprovantes: só administrador
  var url = lerImagemDataUrl(d.id);
  if (!url) throw naoAchou;
  return { dataUrl: url };
}

function enviarImagem(d) {
  return comLock(function () {
    var agora = RELOGIO.agora();
    var uso = d.uso;
    if (['qr', 'topo', 'banner'].indexOf(uso) === -1) throw erroNegocio('Uso da imagem inválido.');
    var titulo = limparTexto(d.titulo, 80);
    var link = validarLink(d.link);
    var banners = lerTabela('Banners');
    if (uso === 'banner' && banners.length >= CFG.MAX_BANNERS) throw erroNegocio('Limite de ' + CFG.MAX_BANNERS + ' banners. Remova algum antes de adicionar.');
    var v = validarDataUrl(d.dataUrl);
    var id = salvarImagemInterna(v, agora);
    var c = lerConfig();

    if (uso === 'qr' || uso === 'topo') {
      var chave = uso === 'qr' ? 'pix.qrImagemId' : 'topo.imagemId';
      var antiga = c[chave];
      var pares = {};
      pares[chave] = id;
      gravarConfig(pares);
      if (antiga) removerImagemInterna(antiga);
      return configParaAdmin();
    }
    var ordem = banners.reduce(function (m, b) { return Math.max(m, b.ordem || 0); }, 0) + 1;
    inserir('Banners', { id: novoId(), imagemId: id, titulo: titulo, link: link, ativo: 1, ordem: ordem, criadoEm: agora });
    return configParaAdmin();
  });
}

function removerImagemUso(d) {
  return comLock(function () {
    if (['qr', 'topo'].indexOf(d.uso) === -1) throw erroNegocio('Uso da imagem inválido.');
    var chave = d.uso === 'qr' ? 'pix.qrImagemId' : 'topo.imagemId';
    var antiga = lerConfig()[chave];
    var pares = {};
    pares[chave] = '';
    gravarConfig(pares);
    removerImagemInterna(antiga);
    return configParaAdmin();
  });
}

function achaBanner(id) {
  var b = lerTabela('Banners').filter(function (x) { return x.id === id; })[0];
  if (!b) throw erroNegocio('Banner não encontrado.');
  return b;
}

function atualizarBanner(d) {
  return comLock(function () {
    var b = achaBanner(d.id);
    if (d.titulo !== undefined) b.titulo = limparTexto(d.titulo, 80);
    if (d.link !== undefined) b.link = validarLink(d.link);
    if (d.ativo !== undefined) b.ativo = d.ativo ? 1 : 0;
    atualizar('Banners', b._linha, b);
    return configParaAdmin();
  });
}

function moverBanner(d) {
  return comLock(function () {
    if (d.direcao !== 'cima' && d.direcao !== 'baixo') throw erroNegocio('Direção inválida.');
    var todos = lerTabela('Banners').sort(function (a, b) { return a.ordem - b.ordem; });
    var i = todos.map(function (x) { return x.id; }).indexOf(d.id);
    if (i === -1) throw erroNegocio('Banner não encontrado.');
    var j = d.direcao === 'cima' ? i - 1 : i + 1;
    if (j >= 0 && j < todos.length) {
      var oi = todos[i].ordem;
      todos[i].ordem = todos[j].ordem;
      todos[j].ordem = oi;
      atualizar('Banners', todos[i]._linha, todos[i]);
      atualizar('Banners', todos[j]._linha, todos[j]);
    }
    return configParaAdmin();
  });
}

function removerBanner(d) {
  return comLock(function () {
    var b = achaBanner(d.id);
    removerLinha('Banners', b._linha);
    removerImagemInterna(b.imagemId);
    return configParaAdmin();
  });
}
