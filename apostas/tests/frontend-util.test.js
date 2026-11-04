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
