

// ========== FUNÇÃO PARA CARREGAR OS FERIADOS NACIONAIS ==========
// A lista vem do servidor (que a calcula); a BrasilAPI ficou como reserva
// dentro de buscarFeriadosNacionais, em api.js.
async function carregarFeriadosAPI(ano) {
    try {
        feriadosAPI = await window.buscarFeriadosNacionais(ano);
        window.feriadosAPI = feriadosAPI; // Disponibilizar globalmente
        console.log(`✅ Feriados nacionais carregados: ${feriadosAPI.length}`);
        return feriadosAPI;
    } catch (error) {
        console.error("❌ Erro ao carregar feriados nacionais:", error);
        feriadosAPI = [];
        window.feriadosAPI = [];
        return [];
    }
}

