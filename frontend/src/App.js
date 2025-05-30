  import React, { useState } from 'react';
  import Papa from 'papaparse';
  import './App.css';
  import { Analytics } from "@vercel/analytics/react"

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

      const dominiosArray = [...new Set(
        dominiosTexto
          .split('\n')
          .map(d => d.trim().toLowerCase())
          .filter(d => d.length > 0)
      )];

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
    
      const headers = [
        'Domínio Original',
        'Consulta Usada',
        'Tipo',
        'Status',
        'Número de Blacklists',
        'Severidade'
      ];
    
      const rows = resultados.map(item => [
        item.dominioOriginal,
        item.consultaUsada,
        item.via,
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
    
    const handleDownloadErrosCSV = () => {
      if (erros.length === 0) {
        alert('Nenhum erro para exportar.');
        return;
      }
    
      const headers = ['Domínio', 'Motivo do Erro'];
      const rows = erros.map(item => [item.domain, item.error]);
    
      const csvContent =
        'data:text/csv;charset=utf-8,' +
        [headers, ...rows]
          .map(e => e.join(','))
          .join('\n');
    
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', 'erros.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    
    const handleFileUpload = (e) => {
      const file = e.target.files[0];

      if (!file) return;

      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const linhas = results.data.map(row => row[0]);
          const linhasFiltradas = linhas.filter((d, idx) => {
            if (idx === 0 && d.toLowerCase() === 'domain') return false;
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
      <div className="container">
        <h1>Verificador de Domínios</h1>

        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          style={{ marginBottom: '15px' }}
        />

        <textarea
          rows="10"
          placeholder="Cole os domínios aqui, um por linha"
          value={dominiosTexto}
          onChange={(e) => setDominiosTexto(e.target.value)}
        />

        <button
          onClick={handleVerificar}
          disabled={loading}
          className="verify"
        >
          {loading ? '🔄 Verificando...' : 'Verificar Domínios'}
        </button>

        {resultados.length > 0 && (
          <>
            <h2>Resultados</h2>
            <table>
              <thead>
                <tr>
                  <th>Domínio</th>
                  <th>Consulta Usada</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Nº Blacklists</th>
                  <th>Severidade</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.dominioOriginal}</td>
                    <td>{item.consultaUsada}</td>
                    <td>{item.via === 'ip' ? 'IP' : 'Domínio'}</td>
                    <td>{item.status}</td>
                    <td>{item.blacklistCount}</td>
                    <td>{item.blacklistSeverity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={handleDownloadCSV} className="download">
              📥 Baixar Resultados CSV
            </button>
          </>
        )}

        {erros.length > 0 && (
          <div>
            <p className="alert-erro">
              ⚠️ {erros.length} domínios apresentaram erro na verificação.
            </p>
            <button onClick={handleDownloadErrosCSV} className="erros">
              📥 Baixar Erros CSV
            </button>
          </div>
        )}
        <Analytics/>
      </div>
    );
  }

  export default App;
  