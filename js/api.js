/** Cliente da API (Apps Script). Usa POST sem cabeçalhos personalizados para evitar preflight de CORS. */
(function (root) {
  'use strict';
  var CHAVE = 'bolao.token';

  function lerToken() {
    try { return root.localStorage.getItem(CHAVE) || ''; } catch (e) { return ''; }
  }
  function guardarToken(t) {
    try {
      if (t) root.localStorage.setItem(CHAVE, t);
      else root.localStorage.removeItem(CHAVE);
    } catch (e) { /* armazenamento indisponível: o login vale só até fechar a página */ }
  }

  function ErroApi(msg, sessaoInvalida) {
    var e = new Error(msg);
    e.sessaoInvalida = !!sessaoInvalida;
    return e;
  }

  var diferencaRelogio = 0; // horário do servidor menos o do aparelho (para o cronômetro)
  function agoraServidor() { return Date.now() + diferencaRelogio; }

  async function chamar(acao, dados) {
    var url = (root.BOLAO_CONFIG || {}).API_URL;
    var corpo = Object.assign({}, dados || {}, { acao: acao });
    var tk = lerToken();
    if (tk && corpo.token === undefined) corpo.token = tk;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 30000);
    var resp;
    try {
      resp = await fetch(url, { method: 'POST', body: JSON.stringify(corpo), signal: ctrl.signal });
    } catch (e) {
      throw ErroApi(e && e.name === 'AbortError'
        ? 'A conexão demorou demais. Tente novamente.'
        : 'Sem conexão com o servidor. Verifique a internet e tente novamente.');
    } finally {
      clearTimeout(timer);
    }
    var json;
    try { json = await resp.json(); } catch (e) { throw ErroApi('Resposta inesperada do servidor.'); }
    if (json && typeof json.agora === 'number') diferencaRelogio = json.agora - Date.now();
    if (!json || !json.ok) {
      var msg = (json && json.erro) || 'Erro desconhecido.';
      throw ErroApi(msg, /^Sessão inválida/.test(msg));
    }
    return json.dados;
  }

  root.BolaoApi = { chamar: chamar, lerToken: lerToken, guardarToken: guardarToken, agoraServidor: agoraServidor };
})(window);
