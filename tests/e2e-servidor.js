// Sobe o frontend estático e uma API local que usa o backend real (Codigo.gs) sobre a simulação do Apps Script.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { novoAmbiente } = require('./mocks-apps-script.js');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

async function subir() {
  const env = novoAmbiente();
  env.propriedades.HASH_ITER = '20';
  env.ctx.configurar();
  env.ctx.primeiroAdmin();
  const codigoAdmin = env.logs.find((l) => l.includes('CÓDIGO DO PRIMEIRO')).match(/: ([0-9A-F-]{23})$/)[1];

  const pedidos = { options: 0, posts: 0, porAcao: {} };
  let atrasoMs = 0; // simula a lentidão do Apps Script
  const api = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { pedidos.options++; res.writeHead(404); return res.end(); } // sem preflight no Apps Script
    if (req.method !== 'POST') { res.writeHead(404); return res.end(); }
    let corpo = '';
    req.on('data', (d) => (corpo += d));
    req.on('end', () => {
      pedidos.posts++;
      try { const a = JSON.parse(corpo).acao; pedidos.porAcao[a] = (pedidos.porAcao[a] || 0) + 1; } catch (e) { /* ignora */ }
      const saida = env.ctx.doPost({ postData: { contents: corpo } }).getContent();
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(saida);
      }, atrasoMs);
    });
  });

  const raiz = path.join(__dirname, '..', 'frontend');
  const estatico = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const arq = path.join(raiz, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!arq.startsWith(raiz) || !fs.existsSync(arq)) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'text/plain' });
    res.end(fs.readFileSync(arq));
  });

  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  await new Promise((r) => estatico.listen(0, '127.0.0.1', r));
  return {
    env, codigoAdmin, pedidos, definirAtraso: (ms) => { atrasoMs = ms; },
    urlSite: 'http://127.0.0.1:' + estatico.address().port,
    urlApi: 'http://127.0.0.1:' + api.address().port + '/exec',
    fechar: () => { api.close(); estatico.close(); }
  };
}

module.exports = { subir };
