const axios = require('axios');

// Função simples para validar formato de domínio
function isValidDomain(domain) {
  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

module.exports = async (req, res) => {
  // 🛡️ CORS Headers adicionados para desenvolvimento
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido. Use POST.' });
  }

  const apiKey = process.env.API_KEY;
  const { dominios } = req.body;

  // Validação da lista recebida
  if (!dominios || !Array.isArray(dominios) || dominios.length === 0) {
    return res.status(400).json({ message: 'Lista de domínios inválida.' });
  }

  // Nova verificação: limite de 100 domínios
  if (dominios.length > 100) {
    return res.status(400).json({ message: 'Você pode verificar no máximo 100 domínios por vez.' });
  }

  const resultados = [];
  const erros = [];

  for (const domain of dominios) {
    if (!isValidDomain(domain)) {
      erros.push({ domain, error: 'Formato de domínio inválido.' });
      continue; // pula para o próximo domínio
    }

    try {
      const apiUrl = `https://www.blacklistmaster.com/restapi/v1/blacklistcheck/domain/${domain}?apikey=${apiKey}`;
      const response = await axios.get(apiUrl);
      const data = response.data;

      if (data.response !== "OK") {
        throw new Error(data.response || 'Erro desconhecido');
      }

      resultados.push({
        domain: domain,
        status: data.status,
        blacklistCount: data.blacklist_cnt,
        blacklistSeverity: data.blacklist_severity,
        blacklists: data.blacklists ? data.blacklists.map(b => b.blacklist_name).join('; ') : ''
      });

    } catch (error) {
      erros.push({ domain, error: 'Erro ao consultar a API externa. Tente novamente.' });
    }
  }

  // Responder com arrays válidos sempre
  return res.status(200).json({
    resultados: resultados.length > 0 ? resultados : [],
    erros: erros.length > 0 ? erros : []
  });
};
