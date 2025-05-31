/**
 * verificar-dominios.js
 *
 * Rota (Serverless) que:
 * - Recebe um array de domínios (POST),
 * - Resolve cada domínio para IP,
 * - Consulta várias DNSBLs (RBL) via DNS,
 * - Retorna, para cada domínio, em quais listas ele foi encontrado (se houver).
 */

const dns = require('dns').promises;

// Lista de DNSBLs públicas e gratuitas
// "type: 'ip'" usa IP invertido, "type: 'domain'" usa o próprio domínio
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

// Valida se uma string é um domínio no formato correto
function isValidDomain(domain) {
  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

// Inverte um IP (ex: "1.2.3.4" → "4.3.2.1")
function invertIP(ip) {
  return ip.split('.').reverse().join('.');
}

/**
 * Consulta um DNSBL via DNS para saber se "queryTerm.host" está listado.
 * 
 * @param {string} queryTerm  Se type === 'ip', deve ser IP invertido; se 'domain', deve ser o domínio.
 * @param {string} host       O host da lista (ex: 'zen.spamhaus.org').
 * @returns {Promise<boolean>}  true se listado (resolve4 retornar um resultado);
 *                              false se não listado (ENOTFOUND ou timeout/SERVFAIL/etc).
 */
async function checkListingViaDNS(queryTerm, host) {
  const dnsName = `${queryTerm}.${host}`;

  try {
    // Se listar (retornar algum A record), então está listado
    await dns.resolve4(dnsName);
    return true;
  } catch (err) {
    // Se for ENOTFOUND ou NXDOMAIN, interpretar como "não listado"
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      return false;
    }
    // Se for timeout ou SERVFAIL, também tratamos como "não listado",
    // mas podemos logar para depuração
    if (err.code === 'ETIMEOUT' || err.code === 'SERVFAIL') {
      console.warn(`Aviso: consulta à ${dnsName} resultou em ${err.code}. Considerando "não listado".`);
      return false;
    }
    // Qualquer outro erro, repassamos para subir no catch do loop principal
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
    // 1) Validar formato do domínio
    if (!isValidDomain(dominio)) {
      erros.push({ domain: dominio, error: 'Formato de domínio inválido.' });
      continue;
    }

    // 2) Resolver domínio para IP (via DNS)
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

    // 3) Para cada DNSBL, montar a query e verificar listagem
    const listedOn = [];
    for (const dnsbl of DNSBLS) {
      try {
        let queryTerm;
        if (dnsbl.type === 'ip') {
          queryTerm = invertIP(consulta);
        } else {
          queryTerm = dominio;
        }

        const isListed = await checkListingViaDNS(queryTerm, dnsbl.host);
        if (isListed) {
          listedOn.push(dnsbl.name);
        }
      } catch (err) {
        // Log de depuração e adiciona ao array de erros, mas não para toda a verificação
        console.error(`Erro consultando ${dnsbl.name} para ${dominio} (${consulta}): ${err.code || err.message}`);
        erros.push({
          domain: dominio,
          error: `Erro ao consultar ${dnsbl.name}: ${err.code || err.message}`
        });
      }
    }

    // 4) Empurra o resultado para o array de resultados
    console.log(`→ [${dominio}] (${consulta} via ${via}) listado em: ${JSON.stringify(listedOn)}`);

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
