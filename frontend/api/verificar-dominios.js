const axios = require('axios');
const dns = require('dns').promises;

function isValidDomain(domain) {
  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido. Use POST.' });
  }

  const apiKey = process.env.ABUSEIPDB_KEY;
  const { dominios } = req.body;

  if (!dominios || !Array.isArray(dominios) || dominios.length === 0) {
    return res.status(400).json({ message: 'Lista de domínios inválida.' });
  }

  const resultados = [];
  const erros = [];

  for (const dominio of dominios) {
    if (!isValidDomain(dominio)) {
      erros.push({ domain: dominio, error: 'Formato de domínio inválido.' });
      continue;
    }

    let ip = null;
    let via = 'domínio';

    try {
      const resolved = await dns.lookup(dominio);
      ip = resolved.address;
      via = 'IP';
    } catch (err) {
      erros.push({ domain: dominio, error: 'Erro ao resolver domínio para IP.' });
      continue;
    }

    try {
      const response = await axios.get(`https://api.abuseipdb.com/api/v2/check`, {
        params: {
          ipAddress: ip,
          maxAgeInDays: 90
        },
        headers: {
          Key: apiKey,
          Accept: 'application/json'
        }
      });

      const data = response.data.data;

      resultados.push({
        dominioOriginal: dominio,
        consultaUsada: ip,
        via,
        abuseConfidenceScore: data.abuseConfidenceScore,
        totalReports: data.totalReports,
        lastReportedAt: data.lastReportedAt || 'Nunca',
        countryCode: data.countryCode || '-',
        domain: data.domain || '-',
        hostnames: data.hostnames ? data.hostnames.join('; ') : '-'
      });
    } catch (error) {
      erros.push({ domain: dominio, error: 'Erro ao consultar API AbuseIPDB.' });
    }
  }

  return res.status(200).json({
    resultados,
    erros
  });
};
