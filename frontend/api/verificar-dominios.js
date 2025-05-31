const dns = require('dns').promises;

// DNSBLs ajustadas para evitar “falsos positivos” (PBL/DBL)
const DNSBLS = [
  { name: 'Spamhaus SBL', host: 'sbl.spamhaus.org', type: 'ip' },
  { name: 'Spamhaus XBL', host: 'xbl.spamhaus.org', type: 'ip' },
  { name: 'Spamcop', host: 'bl.spamcop.net', type: 'ip' },
  { name: 'PSBL', host: 'psbl.surriel.com', type: 'ip' },
  { name: 'DRONE BL', host: 'dnsbl.dronebl.org', type: 'ip' },
  { name: 'SORBS SPAM', host: 'dnsbl.sorbs.net', type: 'ip' },
  { name: 'UCEPROTECT L1', host: 'dnsbl-1.uceprotect.net', type: 'ip' },
  { name: 'UCEPROTECT L2', host: 'dnsbl-2.uceprotect.net', type: 'ip' },
  { name: 'UCEPROTECT L3', host: 'dnsbl-3.uceprotect.net', type: 'ip' },
  { name: 'Hostkarma (IP)', host: 'hostkarma.junkemailfilter.com', type: 'ip' }
];

// Valida o formato “exemplo.com”
function isValidDomain(domain) {
  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

// Inverte IP: “1.2.3.4” → “4.3.2.1”
function invertIP(ip) {
  return ip.split('.').reverse().join('.');
}

// Retorna true se o DNSBL listar, false se não listar (tratando timeout/SERVFAIL como “não listado”)
async function checkListingViaDNS(queryTerm, host) {
  const dnsName = `${queryTerm}.${host}`;
  try {
    await dns.resolve4(dnsName);
    return true;
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      return false; // NXDOMAIN → não listado
    }
    if (err.code === 'ETIMEOUT' || err.code === 'SERVFAIL') {
      console.warn(`[Aviso] ${dnsName} retornou ${err.code}. Considerando NÃO listado.`);
      return false;
    }
    throw err; // outro erro inesperado
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido. Use POST.' });
  }

  const { dominios } = req.body;
  const resultados = [];
  const erros = [];

  if (!dominios || !Array.isArray(dominios) || dominios.length === 0) {
    return res.status(400).json({ message: 'Lista de domínios inválida.' });
  }

  for (const dominio of dominios) {
    // 1) Validar formato
    if (!isValidDomain(dominio)) {
      erros.push({ domain: dominio, error: 'Formato de domínio inválido.' });
      continue;
    }

    // 2) Resolver domínio → IP
    let consulta = dominio;
    let via = 'domínio';
    let ip;
    try {
      const resolved = await dns.lookup(dominio);
      ip = resolved.address;
      consulta = ip;
      via = 'IP';
    } catch (err) {
      erros.push({ domain: dominio, error: `Erro de DNS (lookup): ${err.code}` });
      continue;
    }

    // 3) Iterar por cada DNSBL
    const listedOn = [];
    for (const dnsbl of DNSBLS) {
      try {
        const queryTerm = dnsbl.type === 'ip' ? invertIP(consulta) : dominio;
        const isListed = await checkListingViaDNS(queryTerm, dnsbl.host);
        if (isListed) {
          listedOn.push(dnsbl.name);
        }
      } catch (err) {
        console.error(`Erro consultando ${dnsbl.name} para ${dominio} (${consulta}): ${err.code || err.message}`);
        erros.push({
          domain: dominio,
          error: `Erro ao consultar ${dnsbl.name}: ${err.code || err.message}`
        });
      }
    }

    console.log(`→ [${dominio}] (${consulta} via ${via}) listado em:`, listedOn);

    resultados.push({
      dominioOriginal: dominio,
      consultaUsada: consulta,
      via,
      listedOn,
      listedCount: listedOn.length
    });
  }

  return res.status(200).json({ resultados, erros });
};
