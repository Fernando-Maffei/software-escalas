// api.js
const API = {
    baseURL: 'http://localhost:3000/api',
    
    async get(endpoint) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`);
            if (!response.ok) throw new Error(`Erro ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Erro em GET ${endpoint}:`, error);
            throw error;
        }
    },
    
    async post(endpoint, data) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`Erro ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Erro em POST ${endpoint}:`, error);
            throw error;
        }
    },
    
    async put(endpoint, data) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`Erro ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Erro em PUT ${endpoint}:`, error);
            throw error;
        }
    },
    
    async delete(endpoint) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error(`Erro ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Erro em DELETE ${endpoint}:`, error);
            throw error;
        }
    },
    
    // Colaboradores
    getColaboradores: () => API.get('/colaboradores'),
    salvarColaborador: (data) => data.id ? API.put(`/colaboradores/${data.id}`, data) : API.post('/colaboradores', data),
    excluirColaborador: (id) => API.delete(`/colaboradores/${id}`),
    
    // Ausências
    getAusencias: () => API.get('/ausencias'),
    salvarAusencia: (data) => data.id ? API.put(`/ausencias/${data.id}`, data) : API.post('/ausencias', data),
    excluirAusencia: (id) => API.delete(`/ausencias/${id}`),
    
    // Feriados
    getFeriados: () => API.get('/feriados'),
    salvarFeriado: (data) => data.id ? API.put(`/feriados/${data.id}`, data) : API.post('/feriados', data),
    excluirFeriado: (id) => API.delete(`/feriados/${id}`),
    
    // Plantões
    getPlantoes: () => API.get('/plantoes'),
    salvarPlantao: (data) => API.post('/plantoes', data),
    excluirPlantao: (dataISO) => API.delete(`/plantoes/${dataISO}`)
};

window.API = API;