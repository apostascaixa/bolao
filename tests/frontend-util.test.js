const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../frontend/js/util.js');

test('reais para centavos: formatos válidos', () => {
  const casos = { '60': 6000, '60,5': 6050, '60,50': 6050, '1.234,50': 123450, 'R$ 6,00': 600, ' R$ 1000 ': 100000,
    '6.00': 600, '6.5': 650, '0,05': 5, '0': 0, '12,3': 1230, '1.000,00': 100000, '1000,00': 100000 };
  for (const [entrada, esperado] of Object.entries(casos)) assert.equal(U.reaisParaCentavos(entrada), esperado, entrada);
});

test('reais para centavos: entradas inválidas ou ambíguas viram NaN', () => {
  for (const x of ['', 'abc', '6.000', '1.234', '1,234', '1.2.3', '-5', '6,', ',5', '1,2,3', '12a', null, undefined, '1.23.456,00', '1,000.50']) {
    assert.ok(Number.isNaN(U.reaisParaCentavos(x)), String(x));
  }
});

test('centavos para texto', () => {
  assert.equal(U.centavosParaReais(123456), 'R$ 1.234,56');
  assert.equal(U.centavosParaReais(5), 'R$ 0,05');
  assert.equal(U.centavosParaReais(6000), 'R$ 60,00');
  assert.equal(U.centavosParaReais(100000000), 'R$ 1.000.000,00');
  assert.equal(U.centavosParaDecimalBR(6000), '60,00');
});

test('ida e volta: reais -> centavos -> reais', () => {
  for (const c of [1, 99, 100, 6000, 123456, 99999999]) {
    assert.equal(U.reaisParaCentavos(U.centavosParaDecimalBR(c)), c);
  }
});

test('datas locais: ida e volta e entradas inválidas', () => {
  const ms = new Date(2026, 11, 31, 18, 30).getTime();
  assert.equal(U.msParaInputLocal(ms), '2026-12-31T18:30');
  assert.equal(U.inputLocalParaMs('2026-12-31T18:30'), ms);
  assert.ok(Number.isNaN(U.inputLocalParaMs('')));
  assert.ok(Number.isNaN(U.inputLocalParaMs('31/12/2026')));
  assert.ok(Number.isNaN(U.inputLocalParaMs(null)));
});

test('tempo restante em texto curto', () => {
  const MIN = 60000, H = 60 * MIN, D = 24 * H;
  assert.equal(U.formatarRestante(0), 'Encerrado');
  assert.equal(U.formatarRestante(-5), 'Encerrado');
  assert.equal(U.formatarRestante(NaN), 'Encerrado');
  assert.equal(U.formatarRestante(30 * 1000), '1min');
  assert.equal(U.formatarRestante(12 * MIN), '12min');
  assert.equal(U.formatarRestante(5 * H + 10 * MIN), '5h 10min');
  assert.equal(U.formatarRestante(6 * D + 23 * H + 59 * MIN), '6d 23h');
});

test('colunas do volante por modalidade', () => {
  assert.equal(U.colunasVolante(25), 5);
  assert.equal(U.colunasVolante(31), 7);
  assert.equal(U.colunasVolante(60), 6);
  assert.equal(U.colunasVolante(80), 8);
});

test('sorteio de números: distintos, no intervalo, ordenados e completos', () => {
  let semente = 12345;
  const rng = () => { semente = (semente * 1664525 + 1013904223) % 4294967296; return semente / 4294967296; };
  for (const [max, qtd] of [[60, 6], [25, 15], [80, 5], [31, 7], [60, 20], [6, 6]]) {
    for (let k = 0; k < 200; k++) {
      const r = U.sortearNumeros(max, qtd, rng);
      assert.equal(r.length, qtd);
      assert.equal(new Set(r).size, qtd);
      assert.ok(r.every((n) => Number.isInteger(n) && n >= 1 && n <= max));
      assert.deepEqual(r, r.slice().sort((a, b) => a - b));
    }
  }
  // todos os números aparecem alguma vez (sem viés de borda)
  const vistos = new Set();
  for (let k = 0; k < 2000; k++) U.sortearNumeros(60, 6, rng).forEach((n) => vistos.add(n));
  assert.equal(vistos.size, 60);
});

test('letra do jogo, data e dezena', () => {
  assert.equal(U.letraJogo(0), 'A');
  assert.equal(U.letraJogo(25), 'Z');
  assert.equal(U.letraJogo(26), 'AA');
  assert.equal(U.letraJogo(51), 'AZ');
  assert.equal(U.dezena(7), '07');
  assert.equal(U.dezena(42), '42');
  const ms = new Date(2026, 11, 3, 9, 5, 7).getTime();
  assert.equal(U.dataHora(ms), '03/12/2026 09:05:07');
  assert.equal(U.dataCurta(ms), '03/12/2026');
});
