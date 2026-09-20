


async function testarConexaoBackend() {
    console.log("Testando conexão com backend...");
    
    const testes = [
        { url: 'http://localhost:3000/api/feriados', nome: 'Feriados' },
        { url: 'http://localhost:3000/api/ausencias', nome: 'Ausências' },
        { url: 'http://localhost:3000/api/colaboradores', nome: 'Colaboradores' }
    ];
    
    for (const teste of testes) {
        try {
            const response = await fetch(teste.url);
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ ${teste.nome}: OK (${data.length} registros)`);
            } else {
                console.error(`❌ ${teste.nome}: Erro ${response.status}`);
            }
        } catch (error) {
            console.error(`❌ ${teste.nome}: Falha na conexão`, error.message);
        }
    }
}

