const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../shared/regras.js');
const T = require('../shared/rateio.js');
const P = require('../shared/pix.js');

const megaCfg = { nome: 'Mega 1', modalidade: 'mega-sena', qtdNumeros: 6, valorCotaCentavos: 6000, jogosPorCota: 10, limiteCotas: 20 };

// ---------- regras ----------
test('bolão válido', () => {
  assert.equal(R.validarBolao(megaCfg).ok, true);
});

test('bolão inválido: modalidade, dezenas, valor, jogos, limite, nome', () => {
  assert.equal(R.validarBolao({ ...megaCfg, modalidade: 'x' }).ok, false);
  assert.equal(R.validarBolao({ ...megaCfg, qtdNumeros: 5 }).ok, false);   // abaixo do mínimo da Mega
  assert.equal(R.validarBolao({ ...megaCfg, qtdNumeros: 21 }).ok, false);  // acima do máximo
  assert.equal(R.validarBolao({ ...megaCfg, valorCotaCentavos: 0 }).ok, false);
  assert.equal(R.validarBolao({ ...megaCfg, valorCotaCentavos: 10.5 }).ok, false);
  assert.equal(R.validarBolao({ ...megaCfg, jogosPorCota: 0 }).ok, false);
  assert.equal(R.validarBolao({ ...megaCfg, limiteCotas: 0 }).ok, false);
  assert.equal(R.validarBolao({ ...megaCfg, nome: '  ' }).ok, false);
  assert.equal(R.validarBolao(null).ok, false);
});

test('jogo válido é devolvido ordenado', () => {
  const r = R.validarJogo([42, 7, 1, 60, 33, 18], megaCfg);
  assert.equal(r.ok, true);
  assert.deepEqual(r.numeros, [1, 7, 18, 33, 42, 60]);
});

test('jogo inválido: quantidade, repetido, fora do intervalo, não inteiro', () => {
  assert.equal(R.validarJogo([1, 2, 3, 4, 5], megaCfg).ok, false);
  assert.equal(R.validarJogo([1, 2, 3, 4, 5, 6, 7], megaCfg).ok, false);
  assert.equal(R.validarJogo([1, 1, 2, 3, 4, 5], megaCfg).ok, false);
  assert.equal(R.validarJogo([0, 2, 3, 4, 5, 6], megaCfg).ok, false);
  assert.equal(R.validarJogo([1, 2, 3, 4, 5, 61], megaCfg).ok, false);
  assert.equal(R.validarJogo([1, 2, 3, 4, 5, '6'], megaCfg).ok, false);
  assert.equal(R.validarJogo([1, 2, 3, 4, 5, 6.5], megaCfg).ok, false);
  assert.equal(R.validarJogo('1,2,3', megaCfg).ok, false);
});

test('Lotofácil: 15 números de 1 a 25', () => {
  const cfg = { ...megaCfg, modalidade: 'lotofacil', qtdNumeros: 15 };
  const ok = Array.from({ length: 15 }, (_, i) => i + 1);
  assert.equal(R.validarJogo(ok, cfg).ok, true);
  assert.equal(R.validarJogo([...ok.slice(0, 14), 26], cfg).ok, false);
});

test('Mega-Sena com 7 números (aposta múltipla) quando o bolão permitir', () => {
  const cfg = { ...megaCfg, qtdNumeros: 7 };
  assert.equal(R.validarJogo([1, 2, 3, 4, 5, 6, 7], cfg).ok, true);
  assert.equal(R.validarJogo([1, 2, 3, 4, 5, 6], cfg).ok, false);
});

test('chave do jogo ignora a ordem digitada', () => {
  const a = R.validarJogo([6, 5, 4, 3, 2, 1], megaCfg).numeros;
  const b = R.validarJogo([1, 2, 3, 4, 5, 6], megaCfg).numeros;
  assert.equal(R.chaveJogo(a), R.chaveJogo(b));
});

// ---------- rateio ----------
test('rateio exato', () => {
  const r = T.ratear(1000, 4);
  assert.deepEqual(r.porCota, [250, 250, 250, 250]);
  assert.equal(r.resto, 0);
});

test('rateio com resto: soma sempre igual ao prêmio', () => {
  for (const [premio, n] of [[1000, 3], [1, 7], [999999, 13], [0, 5], [100, 1], [5000000000, 17]]) {
    const r = T.ratear(premio, n);
    assert.equal(r.porCota.reduce((a, b) => a + b, 0), premio);
    assert.equal(r.porCota.length, n);
    assert.ok(Math.max(...r.porCota) - Math.min(...r.porCota) <= 1);
  }
});

test('resto vai para as primeiras cotas', () => {
  assert.deepEqual(T.ratear(1000, 3).porCota, [334, 333, 333]);
  assert.deepEqual(T.ratear(5, 3).porCota, [2, 2, 1]);
});

test('rateio rejeita entradas inválidas', () => {
  assert.throws(() => T.ratear(-1, 3));
  assert.throws(() => T.ratear(10.5, 3));
  assert.throws(() => T.ratear(100, 0));
  assert.throws(() => T.ratear(100, 2.5));
});

// ---------- estados da cota ----------
test('transições permitidas e proibidas', () => {
  assert.equal(T.podeTransitar('rascunho', 'completa'), true);
  assert.equal(T.podeTransitar('completa', 'aguardando_pagamento'), true);
  assert.equal(T.podeTransitar('aguardando_pagamento', 'confirmada'), true);
  assert.equal(T.podeTransitar('aguardando_pagamento', 'rascunho'), true);
  assert.equal(T.podeTransitar('rascunho', 'confirmada'), false); // não pula pagamento
  assert.equal(T.podeTransitar('rascunho', 'aguardando_pagamento'), false); // exige cota completa
  assert.equal(T.podeTransitar('confirmada', 'rascunho'), false);
  assert.equal(T.podeTransitar('expirada', 'completa'), false);
  assert.equal(T.podeTransitar('xyz', 'completa'), false);
});

test('cota completa exige exatamente os jogos definidos', () => {
  assert.equal(T.cotaCompleta(10, 10), true);
  assert.equal(T.cotaCompleta(9, 10), false);
  assert.equal(T.cotaCompleta(11, 10), false);
});

// ---------- PIX ----------
test('CRC16/CCITT-FALSE: vetor padrão "123456789" = 29B1', () => {
  assert.equal(P.crc16('123456789'), '29B1');
});

const dadosPix = { chave: 'bolao@exemplo.com', nomeRecebedor: 'João da Silva', cidade: 'Brasília', valorCentavos: 6000, txid: 'BOLAO1COTA7' };

test('PIX: estrutura, campos e CRC consistentes', () => {
  const cod = P.gerarPix(dadosPix);
  assert.equal(P.validarCrc(cod), true);
  const c = P.lerCampos(cod);
  assert.equal(c['00'], '01');
  assert.equal(c['01'], '11');
  assert.equal(c['52'], '0000');
  assert.equal(c['53'], '986');
  assert.equal(c['54'], '60.00');
  assert.equal(c['58'], 'BR');
  assert.equal(c['59'], 'JOAO DA SILVA');
  assert.equal(c['60'], 'BRASILIA');
  assert.equal(P.lerCampos(c['26'])['00'], 'br.gov.bcb.pix');
  assert.equal(P.lerCampos(c['26'])['01'], 'bolao@exemplo.com');
  assert.equal(P.lerCampos(c['62'])['05'], 'BOLAO1COTA7');
  assert.ok(cod.startsWith('000201'));
  assert.ok(/6304[0-9A-F]{4}$/.test(cod));
});

test('PIX: valores em centavos viram decimal correto', () => {
  const v = (cent) => P.lerCampos(P.gerarPix({ ...dadosPix, valorCentavos: cent }))['54'];
  assert.equal(v(1), '0.01');
  assert.equal(v(5), '0.05');
  assert.equal(v(100), '1.00');
  assert.equal(v(12345), '123.45');
});

test('PIX: alterar qualquer caractere invalida o CRC', () => {
  const cod = P.gerarPix(dadosPix);
  const adulterado = cod.replace('60.00', '10.00');
  assert.equal(P.validarCrc(adulterado), false);
});

test('PIX: nome e cidade são truncados e txid vazio vira ***', () => {
  const cod = P.gerarPix({ ...dadosPix, nomeRecebedor: 'A'.repeat(40), cidade: 'B'.repeat(30), txid: '' });
  const c = P.lerCampos(cod);
  assert.equal(c['59'].length, 25);
  assert.equal(c['60'].length, 15);
  assert.equal(P.lerCampos(c['62'])['05'], '***');
  assert.equal(P.validarCrc(cod), true);
});

test('PIX: entradas inválidas são recusadas', () => {
  assert.throws(() => P.gerarPix({ ...dadosPix, chave: '' }));
  assert.throws(() => P.gerarPix({ ...dadosPix, valorCentavos: 0 }));
  assert.throws(() => P.gerarPix({ ...dadosPix, valorCentavos: 10.5 }));
  assert.throws(() => P.gerarPix({ ...dadosPix, nomeRecebedor: '' }));
  assert.throws(() => P.gerarPix({ ...dadosPix, cidade: '' }));
});
