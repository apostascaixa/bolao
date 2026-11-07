// Gera backend/Codigo.gs juntando shared/*.js e backend/src/*.js (um único arquivo para colar no Apps Script).
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const partes = [
  'shared/regras.js', 'shared/rateio.js', 'shared/pix.js', 'shared/conferencia.js',
  ...fs.readdirSync(path.join(raiz, 'backend/src')).sort().map((f) => 'backend/src/' + f)
];
let saida = '// ARQUIVO GERADO por scripts/build-backend.js. Não edite aqui: edite shared/ ou backend/src/ e gere de novo.\n';
for (const p of partes) {
  saida += '\n// ======================= ' + p + ' =======================\n';
  saida += fs.readFileSync(path.join(raiz, p), 'utf8').replace(/\r\n/g, '\n') + '\n';
}
fs.writeFileSync(path.join(raiz, 'backend/Codigo.gs'), saida);
console.log('Gerado backend/Codigo.gs (' + saida.length + ' caracteres)');
