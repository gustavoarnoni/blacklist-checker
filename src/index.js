require('dotenv').config();

const apiKey = process.env.API_KEY;
const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const { parse } = require('json2csv'); // Para salvar resultados e erros em CSV
const filePath = './data/dominios.csv';

// Função para limpar a URL recebida
function cleanDomain(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .trim();
}

// Função para ler os domínios do CSV
function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const domains = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        if (row.domain) {
          const cleaned = cleanDomain(row.domain.trim());
          if (cleaned.length > 0) {
            domains.push(cleaned);
          }
        }
      })
      .on('end', () => resolve(domains))
      .on('error', reject);
  });
}

// Função para consultar a BlacklistMaster API
async function checkDomain(domain, apiKey) {
  const apiUrl = `https://www.blacklistmaster.com/restapi/v1/blacklistcheck/domain/${domain}?apikey=${apiKey}`;

  try {
    const response = await axios.get(apiUrl);
    const data = response.data;

    if (data.response !== "OK") {
      throw new Error(data.response || 'Erro desconhecido');
    }

    // Log de sucesso
    console.log(`✅ Verificado: ${domain} | Status: ${data.status}`);

    // Log de requisições restantes
    if (data.API_calls_remaining !== undefined) {
      console.log(`🔔 Requisições restantes: ${data.API_calls_remaining}`);

      if (data.API_calls_remaining < 500) {
        console.warn('🚨 ATENÇÃO: Menos de 500 requisições restantes na BlacklistMaster!');
      }
    }

    return {
      domain: domain,
      status: data.status,
      blacklistCount: data.blacklist_cnt,
      blacklistSeverity: data.blacklist_severity,
      blacklists: data.blacklists ? data.blacklists.map(b => b.blacklist_name).join('; ') : ''
    };

  } catch (error) {
    console.error(`❌ Erro ao consultar o domínio ${domain}:`, error.message);
    return { domain, error: error.message };
  }
}

// Função para salvar resultados em CSV
function saveCSV(filename, data) {
  const csvData = parse(data);
  fs.writeFileSync(filename, csvData, 'utf8');
  console.log(`📄 Arquivo salvo: ${filename}`);
}

// Função principal
async function processDomains(filePath, apiKey) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Arquivo "${filePath}" não encontrado. Verifique o caminho e tente novamente.`);
    process.exit(1);
  }

  const domains = await readCSV(filePath);
  console.log(`📋 ${domains.length} domínios lidos para verificação.`);

  const checks = domains.map(domain => checkDomain(domain, apiKey));
  const results = await Promise.all(checks);

  const successResults = results.filter(result => !result.error);
  const errorResults = results.filter(result => result.error);

  console.log(`✅ ${successResults.length} domínios verificados com sucesso.`);
  console.log(`❌ ${errorResults.length} domínios com erro.`);

  // TABELA no terminal para resultados de sucesso
  if (successResults.length > 0) {
    console.log('📊 Resultados:');
    console.table(successResults);
    saveCSV('resultados.csv', successResults);
  }

  // TABELA no terminal para erros
  if (errorResults.length > 0) {
    console.log('📊 Erros encontrados:');
    console.table(errorResults);
    saveCSV('erros.csv', errorResults);
  }

  console.log('🏁 Processo finalizado.');
}

processDomains(filePath, apiKey);
