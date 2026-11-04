// Simulação mínima dos serviços do Apps Script usados pelo backend.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Imita o que o Planilhas real fez no teste do usuário: converte texto parecido com número/data/booleano.
function comoPlanilhas(v) {
  if (typeof v !== 'string') return v;
  if (/^\s*[-+]?\d+([.,]\d+)?(e[-+]?\d+)?\s*$/i.test(v)) return Number(v.replace(',', '.'));
  if (/^\d{1,2}[-/]\d{1,2}([-/]\d{1,4})?$/.test(v) || /^\d{1,2}:\d{2}$/.test(v)) return new Date(2003, 1, 1);
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  if (v.charAt(0) === '=') return '#ERRO';
  return v;
}

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  setValues(vals) {
    for (let i = 0; i < vals.length; i++) {
      const row = this.sheet.rows[this.r - 1 + i] || (this.sheet.rows[this.r - 1 + i] = []);
      for (let j = 0; j < vals[i].length; j++) row[this.c - 1 + j] = comoPlanilhas(vals[i][j]);
    }
    return this;
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.rows[this.r - 1 + i] || [];
      const l = [];
      for (let j = 0; j < this.nc; j++) l.push(row[this.c - 1 + j] === undefined ? '' : row[this.c - 1 + j]);
      out.push(l);
    }
    return out;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
}
class FakeSheet {
  constructor(name) { this.name = name; this.rows = []; }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr || 1, nc || 1); }
  getDataRange() {
    const w = Math.max(0, ...this.rows.map((r) => r.length));
    const self = this;
    return { getValues: () => self.rows.map((r) => { const x = []; for (let i = 0; i < w; i++) x.push(r[i] === undefined ? '' : r[i]); return x; }) };
  }
  appendRow(arr) { this.rows.push(arr.map(comoPlanilhas)); }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  getMaxRows() { return 1000; }
  setFrozenRows() {}
  clear() { this.rows = []; }
}
class FakeSpreadsheet {
  constructor() { this.id = 'planilha-fake-1'; this.sheets = { Sheet1: new FakeSheet('Sheet1') }; }
  getId() { return this.id; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { return (this.sheets[n] = new FakeSheet(n)); }
  deleteSheet(s) { delete this.sheets[s.name]; }
}

function novoAmbiente() {
  const ss = new FakeSpreadsheet();
  const propriedades = {};
  const logs = [];
  const erros = [];
  let travado = false;
  let travasTotais = 0;

  const sandbox = {
    console: { log() {}, error: (m) => erros.push(String(m)) },
    SpreadsheetApp: {
      getActive: () => ss,
      openById: (id) => { if (id !== ss.id) throw new Error('ID de planilha desconhecido'); return ss; }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in propriedades ? propriedades[k] : null), setProperty: (k, v) => { propriedades[k] = String(v); } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (alg, valor) => Array.from(new Int8Array(crypto.createHash('sha256').update(valor, 'utf8').digest()))
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() { if (travado) throw new Error('Lock reentrante: comLock aninhado!'); travado = true; travasTotais++; },
        releaseLock() { travado = false; }
      })
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (t) => ({ getContent: () => t, setMimeType() { return this; } })
    },
    Logger: { log: (m) => logs.push(String(m)) },
    Date
  };
  const ctx = vm.createContext(sandbox);
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'backend', 'Codigo.gs'), 'utf8');
  vm.runInContext(codigo, ctx);

  const chamar = (acao, dados) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ acao, ...dados }) } }).getContent());
  return { ctx, ss, propriedades, logs, erros, chamar, travas: () => travasTotais, estaTravado: () => travado };
}

module.exports = { novoAmbiente };
