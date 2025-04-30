const axios = require('axios');
const dns = require('dns').promises;

// Função simples para validar formato de domínio
function isValidDomain(domain) {
  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido. Use POST.' });
  }

  const apiKey = process.env.API_KEY;
  const { dominios } = req.body;

  if (!dominios || !Array.isArray(dominios) || dominios.length === 0) {
    return res.status(400).json({ message: 'Lista de domínios inválida.' });
  }

  if (dominios.length > 100) {
    return res.status(400).json({ message: 'Você pode verificar no máximo 100 domínios por vez.' });
  }

  const resultados = [];
  const erros = [];

  for (const domain of dominios) {
    if (!isValidDomain(domain)) {
      erros.push({ domain, error: 'Formato de domínio inválido.' });
      continue;
    }

    let consulta = domain;
    let resolvidoPorIP = false;

    try {
      const resolved = await dns.lookup(domain);
      if (resolved && resolved.address) {
        consulta = resolved.address;
        resolvidoPorIP = true;
      }
    } catch (err) {
      // Se falhar, continua com o domínio mesmo
    }

    try {
      const tipo = resolvidoPorIP ? 'ip' : 'domain';
      const apiUrl = `https://www.blacklistmaster.com/restapi/v1/blacklistcheck/${tipo}/${consulta}?apikey=${apiKey}`;
      const response = await axios.get(apiUrl);
      const data = response.data;

      if (data.response !== "OK") {
        throw new Error(data.response || 'Erro desconhecido');
      }

      resultados.push({
        dominioOriginal: domain,
        consultaUsada: consulta,
        status: data.status,
        blacklistCount: data.blacklist_cnt,
        blacklistSeverity: data.blacklist_severity,
        blacklists: data.blacklists ? data.blacklists.map(b => b.blacklist_name).join('; ') : '',
        via: tipo
      });

    } catch (error) {
      erros.push({ domain, error: 'Erro ao consultar a API externa. Tente novamente.' });
    }
  }

  return res.status(200).json({
    resultados: resultados.length > 0 ? resultados : [],
    erros: erros.length > 0 ? erros : []
  });
};
