/**
 * Gerador de PIX "copia e cola" (BR Code estático, padrão EMV do Banco Central).
 * Não há integração bancária: o código é gerado localmente e o pagamento
 * é confirmado manualmente pelo administrador.
 * Funciona em Node (testes), navegador e Apps Script (V8).
 */
(function (root) {
  'use strict';

  function campo(id, valor) {
    var tam = String(valor.length);
    if (tam.length < 2) tam = '0' + tam;
    return id + tam + valor;
  }

  /** CRC16/CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF. */
  function crc16(texto) {
    var crc = 0xFFFF;
    for (var i = 0; i < texto.length; i++) {
      crc ^= (texto.charCodeAt(i) & 0xFF) << 8;
      for (var b = 0; b < 8; b++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    var hex = crc.toString(16).toUpperCase();
    while (hex.length < 4) hex = '0' + hex;
    return hex;
  }

  /** Maiúsculas, sem acentos, só ASCII imprimível. */
  function limparTexto(txt, max) {
    var s = String(txt || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^\x20-\x7E]/g, '')
      .trim();
    return s.substring(0, max);
  }

  function centavosParaDecimal(centavos) {
    var reais = Math.floor(centavos / 100);
    var cent = centavos % 100;
    return reais + '.' + (cent < 10 ? '0' : '') + cent;
  }

  /**
   * gerarPix({ chave, nomeRecebedor, cidade, valorCentavos, txid })
   * Retorna a string do "copia e cola".
   */
  function gerarPix(dados) {
    if (!dados || !dados.chave || String(dados.chave).trim() === '') {
      throw new Error('Chave PIX obrigatória.');
    }
    if (!Number.isInteger(dados.valorCentavos) || dados.valorCentavos <= 0) {
      throw new Error('Valor deve ser um inteiro positivo em centavos.');
    }
    var nome = limparTexto(dados.nomeRecebedor, 25);
    var cidade = limparTexto(dados.cidade, 15);
    if (!nome) throw new Error('Nome do recebedor obrigatório.');
    if (!cidade) throw new Error('Cidade obrigatória.');

    var txid = String(dados.txid || '***').replace(/[^A-Za-z0-9]/g, '').substring(0, 25);
    if (!txid) txid = '***';

    var conta = campo('00', 'br.gov.bcb.pix') + campo('01', String(dados.chave).trim());
    var corpo =
      campo('00', '01') +
      campo('01', '11') +
      campo('26', conta) +
      campo('52', '0000') +
      campo('53', '986') +
      campo('54', centavosParaDecimal(dados.valorCentavos)) +
      campo('58', 'BR') +
      campo('59', nome) +
      campo('60', cidade) +
      campo('62', campo('05', txid)) +
      '6304';
    return corpo + crc16(corpo);
  }

  /** Lê os campos de primeiro nível (usado nos testes). */
  function lerCampos(codigo) {
    var campos = {};
    var i = 0;
    while (i < codigo.length) {
      var id = codigo.substr(i, 2);
      var tam = parseInt(codigo.substr(i + 2, 2), 10);
      campos[id] = codigo.substr(i + 4, tam);
      i += 4 + tam;
    }
    return campos;
  }

  /** Confere se o CRC do código bate com o conteúdo. */
  function validarCrc(codigo) {
    if (typeof codigo !== 'string' || codigo.length < 8) return false;
    var corpo = codigo.substring(0, codigo.length - 4);
    return crc16(corpo) === codigo.substring(codigo.length - 4);
  }

  var api = {
    gerarPix: gerarPix,
    crc16: crc16,
    lerCampos: lerCampos,
    validarCrc: validarCrc
  };

  root.BolaoPix = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
