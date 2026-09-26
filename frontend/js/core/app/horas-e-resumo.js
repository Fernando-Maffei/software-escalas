
/* ===========================
   UTILITÁRIOS
=========================== */
function formatarHora(hora) {
    if (!hora) {
        return "";
    }

    if (hora instanceof Date && !isNaN(hora.getTime())) {
        const isTimeOnlyDate = hora.getUTCFullYear() === 1970
            && hora.getUTCMonth() === 0
            && hora.getUTCDate() === 1;
        const h = String(isTimeOnlyDate ? hora.getUTCHours() : hora.getHours()).padStart(2, "0");
        const m = String(isTimeOnlyDate ? hora.getUTCMinutes() : hora.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
    }

    const raw = String(hora).trim();

    if (!raw) {
        return "";
    }

    const isoMatch = raw.match(/T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?/);
    if (isoMatch) {
        return isoMatch[1];
    }

    const timeMatch = raw.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
    if (timeMatch) {
        return timeMatch[1];
    }

    return "";
}

// Função para mostrar toast
function mostrarToast(mensagem, tipo = "success") {
    
    // Cria o container se não existir
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;
    
    let icone = "fa-info-circle";
    if (tipo === "success") {
        icone = "fa-check-circle";
    }
    else if (tipo === "error") {
        icone = "fa-exclamation-circle";
    }
    else if (tipo === "warning") {
        icone = "fa-exclamation-triangle";
    }
    
    toast.innerHTML = `<i class="fas ${icone}"></i> ${mensagem}`;
    
    container.appendChild(toast);
    
    // Remove após 3 segundos
    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease";
        setTimeout(() => {
            if (toast.parentNode === container) {
                toast.remove();
            }
            
            // Remove container se estiver vazio
            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, 3000);
}

// Tela de Usuarios (antes era uma aba dentro de Configuracoes; virou item
// proprio no menu, admin-only). O conteudo em si e montado por
// inicializarUsuariosTela() em configuracoes-usuarios.js, que popula o
// #usuariosCardConteudo. A visibilidade e navegacao ja sao filtradas por
// permissoes.js (o item some e a rota cai no calendario para nao-admin).
function renderUsuarios() {
    if (!appContent) {
        return;
    }

    appContent.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-users-cog"></i> Usuários</h1>
            <p>Contas e acessos ao sistema</p>
        </div>

        <div class="configuracoes-grid">
            <div class="config-card config-card-wide" data-config-section="usuarios">
                <div class="config-card-body" id="usuariosCardConteudo">
                    <p class="config-descricao">Carregando usuarios...</p>
                </div>
            </div>
        </div>
    `;

    if (typeof window.inicializarUsuariosTela === 'function') {
        window.inicializarUsuariosTela();
    }
}

