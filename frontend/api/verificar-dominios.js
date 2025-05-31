const dns = require('dns').promises;

// Lista de DNSBLs (IP-based e Domain-based)
const DNSBLS = [
  // IP-based
  { name: 'Spamhaus ZEN', host: 'zen.spamhaus.org', type: 'ip' },
  { name: 'Spamcop', host: 'bl.spamcop.net', type: 'ip' },
  { name: 'PSBL', host: 'psbl.surriel.com', type: 'ip' },
  { name: 'UCEPROTECT L1', host: 'dnsbl-1.uceprotect.net', type: 'ip' },
  { name: 'UCEPROTECT L2', host: 'dnsbl-2.uceprotect.net', type: 'ip' },
  { name: 'UCEPROTECT L3', host: 'dnsbl-3.uceprotect.net', type: 'ip' },
  { name: 'Hostkarma', host: 'hostkarma.junkemailfilter.com', type: 'ip' },
  { name: 'SORBS SPAM', host: 'dnsbl.sorbs.net', type: 'ip' },
  { name: 'DRONE BL', host: 'dnsbl.dronebl.org', type: 'ip' },
  { name: 'MSRBL Spam', host: 'spam.msrbl.net', type: 'ip' },
  { name: 'MSRBL Phishing', host: 'phishing.msrbl.net', type: 'ip' },
  // Domain-based
  { name: 'Spamhaus DBL', host: 'dbl.spamhaus.org', type: 'domain' },
  { name: 'SURBL multi', host: 'multi.surbl.org', type: 'domain' },
  { name: 'ivmURI (Abuse.CH)', host: 'ivmuri.abuse.ch', type: 'domain' },
  { name: 'ivmSIP (Abuse.CH)', host: 'ivmsip.abuse.ch', type: 'domain' }
];

// Função para validar formato de domínio
function isValidDomain(domain) {
  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

// Inverte um IP (ex: "1.2.3.4" → "4.3.2.1")
function invertIP(ip) {
  return ip.split('.').reverse().join('.');
}

/**
 * Verifica, via DNS, se determinado IP/domínio está em uma lista (DNSBL).
 * 
 * @param {string} queryTerm - Se type === 'ip', deve ser IP invertido; se 'domain', deve ser domínio.
 * @param {string} host - O host da lista (ex: 'zen.spamhaus.org' ou 'dbl.spamhaus.org').
 * @returns {Promise<boolean>} - resolve(true) se listado (retornou algum IP); resolve(false) se não listado (ENOTFOUND).
 */
async function checkListingViaDNS(queryTerm, host) {
  const dnsName = `${queryTerm}.${host}`;
  try {
    // Se resolver, significa que está listado.
    await dns.resolve4(dnsName);
    return true;
  } catch (err) {
    if (err.code === 'ENOTFOUND') {
      // Não listado
      return false;
    }
    // Qualquer outro erro de DNS, repassa
    throw err;
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
    // 1) Validação de formato de domínio
    if (!isValidDomain(dominio)) {
      erros.push({ domain: dominio, error: 'Formato de domínio inválido.' });
      continue;
    }

    // 2) Resolver perído (domain → IP)
    let consulta = dominio;
    let via = 'domínio';
    let ip;

    try {
      const resolved = await dns.lookup(dominio);
      ip = resolved.address;
      consulta = ip;
      via = 'IP';
    } catch (err) {
      // Se não conseguir resolver o domínio, consideramos erro e pulamos
      erros.push({ domain: dominio, error: `Erro de DNS: ${err.code}` });
      continue;
    }

    // 3) Preparar array de queries para cada DNSBL
    const listedOn = [];

    for (const dnsbl of DNSBLS) {
      try {
        let queryTerm;

        if (dnsbl.type === 'ip') {
          queryTerm = invertIP(consulta); // consulta contém o IP
        } else if (dnsbl.type === 'domain') {
          queryTerm = dominio; // consulta o domínio diretamente
        }

        const isListed = await checkListingViaDNS(queryTerm, dnsbl.host);
        if (isListed) {
          listedOn.push(dnsbl.name);
        }
      } catch (err) {
        // Se algum erro de DNS diferente de ENOTFOUND, registramos na lista de erros
        erros.push({
          domain: dominio,
          error: `Erro ao consultar ${dnsbl.name}: ${err.code || err.message}`
        });
      }
    }

    // 4) Montar o objeto de resultado para esse domínio
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
