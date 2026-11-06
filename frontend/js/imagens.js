/** Carregamento de imagens (com cache no aparelho) e compressão antes do envio. */
(function (root) {
  'use strict';
  var PREFIXO = 'bolao.img.';
  var memoria = {};

  function lerCache(id) { try { return root.localStorage.getItem(PREFIXO + id); } catch (e) { return null; } }
  function gravarCache(id, url) {
    try { if (url.length < 450000) root.localStorage.setItem(PREFIXO + id, url); } catch (e) { /* sem espaço: segue sem cache */ }
  }

  /** Busca a imagem uma única vez por aparelho (os ids nunca mudam de conteúdo). */
  function carregar(id) {
    if (!id) return Promise.reject(new Error('sem imagem'));
    if (memoria[id]) return memoria[id];
    var c = lerCache(id);
    if (c) { memoria[id] = Promise.resolve(c); return memoria[id]; }
    memoria[id] = root.BolaoApi.chamar('imagem.obter', { id: id }).then(function (r) {
      gravarCache(id, r.dataUrl);
      return r.dataUrl;
    }).catch(function (e) { delete memoria[id]; throw e; });
    return memoria[id];
  }

  function elemento(id, alt, classe) {
    var img = document.createElement('img');
    img.alt = alt || '';
    img.className = classe || '';
    img.decoding = 'async';
    carregar(id).then(function (u) { img.src = u; img.classList.add('carregada'); }).catch(function () { img.classList.add('falhou'); });
    return img;
  }

  function lerArquivo(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error('Não foi possível ler o arquivo.')); };
      fr.readAsDataURL(file);
    });
  }
  function abrirImagem(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('Arquivo de imagem inválido.')); };
      im.src = url;
    });
  }

  /**
   * Reduz a imagem no navegador até caber no limite do servidor.
   * opc: { larguraMax, alturaMax, formato: 'jpeg' | 'png', maxChars }
   */
  async function comprimir(file, opc) {
    opc = opc || {};
    if (!file || !/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) throw new Error('Escolha uma imagem PNG, JPEG ou WEBP.');
    if (file.size > 15 * 1024 * 1024) throw new Error('A imagem é muito grande (máximo de 15 MB).');
    var im = await abrirImagem(await lerArquivo(file));
    var formato = opc.formato || 'jpeg';
    var maxChars = opc.maxChars || 280000;
    var escala = Math.min(1, (opc.larguraMax || 1280) / im.width, (opc.alturaMax || 99999) / im.height);
    var w = Math.max(1, Math.round(im.width * escala));
    var h = Math.max(1, Math.round(im.height * escala));
    for (var tentativa = 0; tentativa < 8; tentativa++) {
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      if (formato === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(im, 0, 0, w, h);
      var url = formato === 'jpeg' ? cv.toDataURL('image/jpeg', Math.max(0.5, 0.88 - tentativa * 0.06)) : cv.toDataURL('image/png');
      if (url.length - url.indexOf(',') - 1 <= maxChars) return url;
      w = Math.max(1, Math.round(w * 0.8));
      h = Math.max(1, Math.round(h * 0.8));
    }
    throw new Error('Não foi possível reduzir a imagem o bastante. Tente uma imagem menor.');
  }

  root.BolaoImagens = { carregar: carregar, elemento: elemento, comprimir: comprimir };
})(window);
