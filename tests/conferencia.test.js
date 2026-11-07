const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../shared/conferencia.js');

test('combinações', () => {
  assert.equal(C.comb(6, 4), 15);
  assert.equal(C.comb(60, 6), 50063860);
  assert.equal(C.comb(5, 0), 1);
  assert.equal(C.comb(3, 4), 0);
  assert.equal(C.comb(0, 0), 1);
});

test('resultado: valida quantidade, intervalo e repetidas', () => {
  assert.equal(C.validarResultado([4, 12, 23, 33, 41, 56], 'mega-sena').ok, true);
  assert.deepEqual(C.validarResultado([56, 4, 41, 12, 23, 33], 'mega-sena').numeros, [4, 12, 23, 33, 41, 56]);
  assert.equal(C.validarResultado([1, 2, 3, 4, 5], 'mega-sena').ok, false);
  assert.equal(C.validarResultado([1, 2, 3, 4, 5, 61], 'mega-sena').ok, false);
  assert.equal(C.validarResultado([1, 1, 2, 3, 4, 5], 'mega-sena').ok, false);
  assert.equal(C.validarResultado([1, 2, 3, 4, 5, '6'], 'mega-sena').ok, false);
  assert.equal(C.validarResultado([1, 2, 3, 4, 5, 6], 'x').ok, false);
  assert.equal(C.validarResultado(Array.from({ length: 15 }, (_, i) => i + 1), 'lotofacil').ok, true);
  assert.equal(C.validarResultado([1, 2, 3, 4, 5], 'quina').ok, true);
});

test('mega-sena: jogo simples, uma faixa por vez', () => {
  const res = [1, 2, 3, 4, 5, 6];
  const f = (jogo) => C.conferirJogo(jogo, res, 'mega-sena');
  assert.deepEqual(f([1, 2, 3, 4, 5, 6]).premios, [{ nome: 'Sena', acertos: 6, quantidade: 1 }]);
  assert.deepEqual(f([1, 2, 3, 4, 5, 7]).premios, [{ nome: 'Quina', acertos: 5, quantidade: 1 }]);
  assert.deepEqual(f([1, 2, 3, 4, 8, 9]).premios, [{ nome: 'Quadra', acertos: 4, quantidade: 1 }]);
  assert.deepEqual(f([1, 2, 3, 10, 11, 12]).premios, []);
  assert.equal(f([1, 2, 3, 10, 11, 12]).acertos, 3);
  assert.deepEqual(f([1, 2, 3, 10, 11, 12]).acertados, [1, 2, 3]);
  assert.equal(f([20, 21, 22, 23, 24, 25]).acertos, 0);
});

test('mega-sena: aposta com 7 números e 6 acertos = 1 sena + 6 quinas (regra oficial das múltiplas)', () => {
  const r = C.conferirJogo([1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6], 'mega-sena');
  assert.deepEqual(r.premios, [{ nome: 'Sena', acertos: 6, quantidade: 1 }, { nome: 'Quina', acertos: 5, quantidade: 6 }]);
});

test('mega-sena: jogo de 8 números (como no comprovante) com 4 acertos', () => {
  // h = 4, n = 8: quadras = C(4,4) * C(4,2) = 6
  const r = C.conferirJogo([2, 15, 16, 26, 35, 39, 44, 56], [2, 15, 16, 26, 1, 3], 'mega-sena');
  assert.equal(r.acertos, 4);
  assert.deepEqual(r.premios, [{ nome: 'Quadra', acertos: 4, quantidade: 6 }]);
});

test('quina e lotofácil: faixas próprias', () => {
  assert.deepEqual(C.conferirJogo([1, 2, 3, 40, 41], [1, 2, 3, 4, 5], 'quina').premios, [{ nome: 'Terno', acertos: 3, quantidade: 1 }]);
  assert.deepEqual(C.conferirJogo([1, 2, 30, 40, 41], [1, 2, 3, 4, 5], 'quina').premios, [{ nome: 'Duque', acertos: 2, quantidade: 1 }]);
  const res = Array.from({ length: 15 }, (_, i) => i + 1);
  const jogo = [...Array.from({ length: 11 }, (_, i) => i + 1), 16, 17, 18, 19];
  assert.deepEqual(C.conferirJogo(jogo, res, 'lotofacil').premios, [{ nome: '11 acertos', acertos: 11, quantidade: 1 }]);
  assert.deepEqual(C.conferirJogo(Array.from({ length: 10 }, (_, i) => i + 1).concat([16, 17, 18, 19, 20]), res, 'lotofacil').premios, []);
});

test('o total de combinações de uma múltipla fecha com C(n, sorteados)', () => {
  // qualquer jogo de 8 números: a soma de TODAS as combinações possíveis (0 a 6 acertos) = C(8,6) = 28
  const res = [1, 2, 3, 4, 5, 6];
  for (const h of [0, 1, 2, 3, 4, 5, 6]) {
    const jogo = [...res.slice(0, h), ...[20, 21, 22, 23, 24, 25, 26, 27].slice(0, 8 - h)];
    let soma = 0;
    for (let t = 0; t <= 6; t++) soma += C.comb(h, t) * C.comb(8 - h, 6 - t);
    assert.equal(soma, 28, 'h=' + h + ' jogo=' + jogo.length);
  }
});

test('extrair jogos de um texto de comprovante', () => {
  const texto = [
    'MEGA-SENA', 'BOLÃO CAIXA', 'COTA 3/17', '03DEZ2015  HORA DE 09:23:57',
    'A 02 15 16 26 35 39 44 56 SU', 'B 04 16 17 24 25 27 50 54 SU',
    'C 1, 2, 3, 4, 5, 6, 7, 8', 'D 01 01 02 03 04 05 06 07', 'E 61 02 03 04 05 06 07 08', 'CONC 1767'
  ].join('\n');
  const r = C.extrairJogos(texto, 8, 'mega-sena');
  assert.deepEqual(r.jogos, [[2, 15, 16, 26, 35, 39, 44, 56], [4, 16, 17, 24, 25, 27, 50, 54], [1, 2, 3, 4, 5, 6, 7, 8]]);
  assert.ok(r.ignoradas.includes('D 01 01 02 03 04 05 06 07')); // repetido
  assert.ok(r.ignoradas.includes('E 61 02 03 04 05 06 07 08')); // fora do intervalo
  assert.ok(r.ignoradas.includes('COTA 3/17'));
});

test('extrair: aceita vírgulas, hífens, letras e linhas vazias', () => {
  const r = C.extrairJogos('Jogo 1: 1-2-3-4-5-6\n\n  7,8,9,10,11,12  \r\nJogo 3: 13 14 15 16 17 18', 6, 'mega-sena');
  assert.equal(r.jogos.length, 3);
  assert.deepEqual(r.jogos[2], [13, 14, 15, 16, 17, 18]);
  assert.deepEqual(C.extrairJogos('A) 1 2 3 4 5 6\nJogo 12. 7 8 9 10 11 12', 6, 'mega-sena').jogos, [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]]);
  assert.equal(C.extrairJogos('Jogo 1-2-3-4-5-6', 6, 'mega-sena').jogos.length, 1);
  assert.equal(C.extrairJogos('Jogo 1-2-3-4-5-6-7', 6, 'mega-sena').jogos.length, 0); // 7 números não são um jogo de 6
  assert.equal(C.extrairJogos('', 6, 'mega-sena').jogos.length, 0);
  assert.equal(C.extrairJogos(null, 6, 'mega-sena').jogos.length, 0);
});

test('comparar jogos registrados com os do sistema (multiconjunto, ordem irrelevante)', () => {
  const sis = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18]];
  assert.deepEqual(C.compararJogos([[13, 14, 15, 16, 17, 18], [1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]], sis), { iguais: 3, faltamNoRegistro: [], sobramNoRegistro: [] });
  const r = C.compararJogos([[1, 2, 3, 4, 5, 6], [20, 21, 22, 23, 24, 25]], sis);
  assert.equal(r.iguais, 1);
  assert.deepEqual(r.faltamNoRegistro, [[7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18]]);
  assert.deepEqual(r.sobramNoRegistro, [[20, 21, 22, 23, 24, 25]]);
  // jogo repetido no registro conta uma vez só
  const rep = C.compararJogos([[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]], [[1, 2, 3, 4, 5, 6]]);
  assert.equal(rep.iguais, 1);
  assert.equal(rep.sobramNoRegistro.length, 1);
});
