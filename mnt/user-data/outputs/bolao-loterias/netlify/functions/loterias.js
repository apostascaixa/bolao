// Busca o último resultado de cada loteria direto na API da Caixa (sem CORS, pois roda no servidor).
// Se a Caixa falhar para alguma loteria, tenta uma API pública como reserva.
const LOTERIAS = [
  ["megasena", "Mega-Sena"], ["lotofacil", "Lotofácil"], ["quina", "Quina"],
  ["lotomania", "Lotomania"], ["timemania", "Timemania"], ["duplasena", "Dupla Sena"],
  ["diadesorte", "Dia de Sorte"], ["supersete", "Super Sete"], ["maismilionaria", "+Milionária"],
];
const CAIXA = "https://servicebus2.caixa.gov.br/portaldeloterias/api/";
const RESERVA = "https://loteriascaixa-api.herokuapp.com/api/";

async function buscar(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function daCaixa(slug, nome, d) {
  if (!d || !Array.isArray(d.listaDezenas) || !d.listaDezenas.length) return null;
  const trevos = Array.isArray(d.trevosSorteados) && d.trevosSorteados.length
    ? "Trevos: " + d.trevosSorteados.join(" ") : "";
  return {
    slug, nome,
    concurso: d.numero,
    data: d.dataApuracao,
    dezenas: d.listaDezenas,
    dezenas2: Array.isArray(d.listaDezenasSegundoSorteio) ? d.listaDezenasSegundoSorteio : undefined,
    acumulou: !!d.acumulado,
    proximo: d.valorEstimadoProximoConcurso,
    extra: trevos || undefined,
  };
}

function daReserva(slug, nome, d) {
  if (!d || !Array.isArray(d.dezenas) || !d.dezenas.length) return null;
  return {
    slug, nome,
    concurso: d.concurso,
    data: d.data,
    dezenas: d.dezenas,
    acumulou: !!d.acumulou,
    proximo: d.valorEstimadoProximoConcurso,
  };
}

async function uma([slug, nome]) {
  try {
    const r = daCaixa(slug, nome, await buscar(CAIXA + slug));
    if (r) return r;
  } catch (e) { /* tenta a reserva */ }
  try {
    return daReserva(slug, nome, await buscar(RESERVA + slug + "/latest"));
  } catch (e) {
    return null;
  }
}

exports.handler = async () => {
  const lista = (await Promise.all(LOTERIAS.map(uma))).filter(Boolean);
  return {
    statusCode: lista.length ? 200 : 502,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
    body: JSON.stringify(lista),
  };
};
