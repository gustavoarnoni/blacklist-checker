import fetch from "node-fetch";

const API_KEY = process.env.SAFE_BROWSING_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido. Use POST." });
  }

  const { dominios } = req.body;
  if (!dominios || !Array.isArray(dominios) || dominios.length === 0) {
    return res.status(400).json({ error: "Lista de domínios inválida." });
  }

  const resultados = [];
  const erros = [];

  for (const dominio of dominios) {
    // 1) Validar formato de domínio simples
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(dominio)) {
      erros.push({ domain: dominio, error: "Formato de domínio inválido." });
      continue;
    }

    // 2) Montar URL “http://dominio” (o Safe Browsing quer o protocolo)
    let urlParaChecar = dominio;
    if (!/^https?:\/\//i.test(dominio)) {
      urlParaChecar = "http://" + dominio;
    }

    // 3) Corpo da requisição para o Safe Browsing v4
    const requestBody = {
      client: {
        clientId: "meu-projeto-seo",
        clientVersion: "1.0"
      },
      threatInfo: {
        threatTypes: [
          "MALWARE",
          "SOCIAL_ENGINEERING",
          "UNWANTED_SOFTWARE",
          "POTENTIALLY_HARMFUL_APPLICATION"
        ],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url: urlParaChecar }]
      }
    };

    try {
      const response = await fetch(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        }
      );
      const data = await response.json();

      if (data && Array.isArray(data.matches) && data.matches.length > 0) {
        resultados.push({
          dominioOriginal: dominio,
          safeBrowsingStatus: "TOXICO",
          threats: data.matches.map((m) => m.threatType)
        });
      } else {
        resultados.push({
          dominioOriginal: dominio,
          safeBrowsingStatus: "LIMPO",
          threats: []
        });
      }
    } catch (err) {
      erros.push({ domain: dominio,
        error: "Erro ao consultar Safe Browsing: " + err.message
      });
    }
  }

  return res.status(200).json({ resultados, erros });
}