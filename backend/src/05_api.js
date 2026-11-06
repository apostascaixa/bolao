// ===== API HTTP (doGet/doPost) =====
var ACOES = {
  'cadastrar':             { nivel: 'publico', fn: function (d) { return cadastrar(d); } },
  'login':                 { nivel: 'publico', fn: function (d) { return login(d); } },
  'logout':                { nivel: 'publico', fn: function (d) { return logout(d); } },
  'eu':                    { nivel: 'usuario', fn: function (d, u) { return usuarioPublico(u); } },
  'modalidades':           { nivel: 'usuario', fn: function () { return modalidadesDisponiveis(); } },
  'boloes.abertos':        { nivel: 'usuario', fn: function () { return boloesAbertos(); } },
  'publico.config':        { nivel: 'publico', fn: function () { return configPublica(); } },
  'publico.jogos':         { nivel: 'publico', fn: function () { return paginaPublica(); } },
  'imagem.obter':          { nivel: 'publico', fn: function (d) { return obterImagem(d); } },
  'cotas.gerarPix':        { nivel: 'usuario', fn: function (d, u) { return gerarPixCota(u, d); } },
  'cotas.pix':             { nivel: 'usuario', fn: function (d, u) { return pixDaMinhaCota(u, d); } },
  'cotas.minhas':          { nivel: 'usuario', fn: function (d, u) { return minhasCotas(u); } },
  'cotas.criar':           { nivel: 'usuario', fn: function (d, u) { return criarCota(u, d); } },
  'cotas.cancelar':        { nivel: 'usuario', fn: function (d, u) { return cancelarCota(u, d); } },
  'jogos.salvar':          { nivel: 'usuario', fn: function (d, u) { return salvarJogo(u, d); } },
  'jogos.remover':         { nivel: 'usuario', fn: function (d, u) { return removerJogo(u, d); } },
  'admin.cotas.listar':    { nivel: 'admin',   fn: function (d) { return listarCotasAdmin(d); } },
  'admin.cotas.aprovar':   { nivel: 'admin',   fn: function (d) { return aprovarCota(d); } },
  'admin.cotas.reprovar':  { nivel: 'admin',   fn: function (d) { return reprovarCota(d); } },
  'admin.config.obter':    { nivel: 'admin',   fn: function () { return configParaAdmin(); } },
  'admin.config.salvar':   { nivel: 'admin',   fn: function (d) { return salvarConfig(d); } },
  'admin.imagem.enviar':   { nivel: 'admin',   fn: function (d) { return enviarImagem(d); } },
  'admin.imagem.remover':  { nivel: 'admin',   fn: function (d) { return removerImagemUso(d); } },
  'admin.banners.atualizar': { nivel: 'admin', fn: function (d) { return atualizarBanner(d); } },
  'admin.banners.mover':   { nivel: 'admin',   fn: function (d) { return moverBanner(d); } },
  'admin.banners.remover': { nivel: 'admin',   fn: function (d) { return removerBanner(d); } },
  'admin.convites.criar':  { nivel: 'admin',   fn: function (d, u) { return criarConvite(u, d); } },
  'admin.convites.listar': { nivel: 'admin',   fn: function () { return listarConvites(); } },
  'admin.convites.revogar': { nivel: 'admin',  fn: function (d) { return revogarConvite(d); } },
  'admin.boloes.listar':   { nivel: 'admin',   fn: function (d) { return listarBoloesAdmin(d); } },
  'admin.boloes.criar':    { nivel: 'admin',   fn: function (d, u) { return criarBolao(u, d); } },
  'admin.boloes.editar':   { nivel: 'admin',   fn: function (d) { return editarBolao(d); } },
  'admin.boloes.status':   { nivel: 'admin',   fn: function (d) { return alterarStatusBolao(d); } },
  'admin.boloes.excluir':  { nivel: 'admin',   fn: function (d) { return excluirBolao(d); } }
};

function despachar(corpo) {
  try {
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw erroNegocio('Requisição inválida.');
    var def = Object.prototype.hasOwnProperty.call(ACOES, corpo.acao) ? ACOES[corpo.acao] : null;
    if (!def) throw erroNegocio('Ação desconhecida.');
    var usuario = null;
    if (def.nivel === 'usuario') usuario = autenticar(corpo.token);
    if (def.nivel === 'admin') usuario = exigirAdmin(corpo.token);
    return { ok: true, dados: def.fn(corpo, usuario), agora: RELOGIO.agora() };
  } catch (err) {
    if (err && err.negocio) return { ok: false, erro: err.message };
    console.error('Erro interno: ' + (err && err.stack ? err.stack : err));
    return { ok: false, erro: 'Erro interno. Tente novamente.' };
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var corpo = null;
  try {
    corpo = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, erro: 'Requisição inválida.' });
  }
  return responder(despachar(corpo));
}

var VERSAO_API = '5';

/** Abrir a URL /exec no navegador mostra a versão do código que está realmente publicada. */
function doGet() {
  return responder({ ok: true, servico: 'bolao-api', versao: VERSAO_API });
}
