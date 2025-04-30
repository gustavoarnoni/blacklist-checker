import React, { useState } from 'react';
import Papa from 'papaparse';

function App() {
  const [dominiosTexto, setDominiosTexto] = useState('');
  const [resultados, setResultados] = useState([]);
  const [erros, setErros] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleVerificar = async () => {
    if (!dominiosTexto.trim()) {
      alert('Por favor, cole alguns domínios ou envie um arquivo.');
      return;
    }

    const dominiosArray = dominiosTexto
      .split('\n')
      .map(d => d.trim())
      .filter(d => d.length > 0);

    if (dominiosArray.length === 0) {
      alert('Nenhum domínio válido encontrado.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('https://blacklist.gustavoarnoni.dev.br/api/verificar-dominios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dominios: dominiosArray }),
      });

      const data = await response.json();
      setResultados(data.resultados);
      setErros(data.erros);
    } catch (error) {
      console.error('Erro ao verificar domínios:', error);
      alert('Erro ao consultar a API. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (resultados.length === 0) {
      alert('Nenhum resultado disponível para download.');
      return;
    }

    const headers = ['Domínio', 'Status', 'Número de Blacklists', 'Severidade'];
    const rows = resultados.map(item => [
      item.domain,
      item.status,
      item.blacklistCount,
      item.blacklistSeverity
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers, ...rows]
        .map(e => e.join(','))
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'resultados.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
  
    if (!file) {
      return;
    }
  
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const linhas = results.data.map(row => row[0]);
        
        // Pula a primeira linha se ela for "domain" ou "Domain"
        const linhasFiltradas = linhas.filter((d, idx) => {
          if (idx === 0 && d.toLowerCase() === 'domain') {
            return false; // pular a primeira linha se for cabeçalho
          }
          return d && d.trim().length > 0;
        });
  
        const textoDominios = linhasFiltradas.join('\n');
        setDominiosTexto(textoDominios);
      },
      error: (error) => {
        console.error('Erro ao ler o arquivo:', error);
        alert('Erro ao processar o arquivo CSV.');
      }
    });
  };  

  return (
    <div style={{ padding: '20px' }}>
      <h1>Verificador de Domínios</h1>
      <p>Envie um arquivo CSV ou cole a lista de domínios abaixo para verificar.</p>

      {/* Upload de CSV (vamos deixar parado por enquanto) */}
      <div>
        <h2>Upload de Arquivo CSV</h2>
        <input type="file" accept=".csv" onChange={handleFileUpload} />
      </div>

      {/* Caixa de Texto */}
      <div>
        <h2>Ou colar domínios manualmente</h2>
        <textarea
          rows="10"
          cols="50"
          placeholder="Cole os domínios aqui, um por linha"
          value={dominiosTexto}
          onChange={(e) => setDominiosTexto(e.target.value)}
        />
      </div>

      {/* Botão Verificar */}
      <div style={{ marginTop: '20px' }}>
        <button onClick={handleVerificar} disabled={loading}>
          {loading ? '🔄 Verificando...' : 'Verificar Domínios'}
        </button>
      </div>

      {/* Resultados */}
      <div style={{ marginTop: '30px' }}>
        {resultados.length > 0 && (
          <>
            <h2>Resultados</h2>
            <table border="1" cellPadding="5">
              <thead>
                <tr>
                  <th>Domínio</th>
                  <th>Status</th>
                  <th>Nº Blacklists</th>
                  <th>Severidade</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.domain}</td>
                    <td>{item.status}</td>
                    <td>{item.blacklistCount}</td>
                    <td>{item.blacklistSeverity}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Botão para baixar o CSV */}
            <div style={{ marginTop: '20px' }}>
              <button onClick={handleDownloadCSV}>📥 Baixar Resultados CSV</button>
            </div>
          </>
        )}

        {/* Exibe erro se tiver */}
        {erros.length > 0 && (
          <div style={{ marginTop: '20px', color: 'red' }}>
            ⚠️ {erros.length} domínios apresentaram erro na verificação.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
