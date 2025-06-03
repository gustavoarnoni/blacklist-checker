// /pages/api/verificar-seo.js

export default async function handler(req, res) {
    // 1) Só aceitamos POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método não permitido. Use POST." });
    }
  
    // 2) Verificar se a chave está definida
    const API_KEY = process.env.SAFE_BROWSING_API_KEY;
    if (!API_KEY) {
      console.error("SAFE_BROWSING_API_KEY não encontrada em process.env");
      return res
        .status(500)
        .json({ error: "SAFE_BROWSING_API_KEY não configurada." });
    }
  
    // 3) Extrair lista de domínios do corpo
    let dominios;
    try {
      dominios = req.body.dominios;
    } catch (e) {
      console.error("Erro ao ler req.body:", e);
      return res
        .status(400)
        .json({ error: "Formato de requisição inválido. Espera { dominios: [...] }" });
    }
  
    if (!Array.isArray(dominios) || dominios.length === 0) {
      return res
        .status(400)
        .json({ error: "Lista de domínios inválida ou vazia." });
    }
  
    const resultados = [];
    const erros = [];
  
    // 4) Para cada domínio, chamar Safe Browsing
    for (const dominio of dominios) {
      // 4.1) Validar formato básico de domínio
      if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(dominio)) {
        erros.push({ domain: dominio, error: "Formato de domínio inválido." });
        continue;
      }
  
      // 4.2) Garantir que tenha protocolo ao checar
      let urlParaChecar = dominio;
      if (!/^https?:\/\//i.test(dominio)) {
        urlParaChecar = "http://" + dominio;
      }
  
      // 4.3) Montar corpo da requisição Safe Browsing
      const requestBody = {
        client: {
          clientId: "meu-projeto-seo",
          clientVersion: "1.0",
        },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url: urlParaChecar }],
        },
      };
  
      try {
        // 4.4) Chamar a API do Google Safe Browsing (usando fetch global)
        const response = await fetch(
          `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          }
        );
  
        // 4.5) Se não for 200 OK, registrar o texto bruto de resposta para debug
        if (!response.ok) {
          const textoErro = await response.text().catch(() => "<não foi possível ler o texto>");
          console.error(
            `[Safe Browsing] erro HTTP ${response.status} ao checar ${dominio}:`,
            textoErro
          );
          erros.push({
            domain: dominio,
            error: `Safe Browsing retornou ${response.status}: ${textoErro}`,
          });
          continue;
        }
  
        // 4.6) Tentar parsear JSON
        let data;
        try {
          data = await response.json();
        } catch (e) {
          const textoBruto = await response.text().catch(() => "<sem corpo>");
          console.error(
            `[Safe Browsing] JSON parsing falhou para ${dominio}, corpo:`,
            textoBruto
          );
          erros.push({
            domain: dominio,
            error: "Resposta não é JSON válido: " + textoBruto,
          });
          continue;
        }
  
        // 4.7) Analisar se há matches
        if (data.matches && Array.isArray(data.matches) && data.matches.length > 0) {
          resultados.push({
            dominioOriginal: dominio,
            safeBrowsingStatus: "TOXICO",
            threats: data.matches.map((m) => m.threatType),
          });
        } else {
          resultados.push({
            dominioOriginal: dominio,
            safeBrowsingStatus: "LIMPO",
            threats: [],
          });
        }
      } catch (err) {
        // 4.8) Qualquer outra exceção (rede, timeout, etc.)
        console.error(`[Safe Browsing] exceção ao checar ${dominio}:`, err);
        erros.push({
          domain: dominio,
          error: "Erro interno ao consultar Safe Browsing: " + err.message,
        });
      }
    }
  
    // 5) Retorna sempre um JSON estruturado
    return res.status(200).json({ resultados, erros });
  }
  