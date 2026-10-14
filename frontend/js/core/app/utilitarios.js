import { buscarFeriadosNacionais } from '../api.js';
import { estado } from '../estado.js';

// ========== FUNÇÃO PARA CARREGAR OS FERIADOS NACIONAIS ==========
// A lista vem do servidor (que a calcula); a BrasilAPI ficou como reserva
// dentro de buscarFeriadosNacionais, em api.js.
export async function carregarFeriadosAPI(ano) {
    try {
        estado.feriadosAPI = await buscarFeriadosNacionais(ano);
        return estado.feriadosAPI;
    } catch (error) {
        console.error("❌ Erro ao carregar feriados nacionais:", error);
        estado.feriadosAPI = [];
        estado.feriadosAPI = [];
        return [];
    }
}
