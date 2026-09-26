// Tipagem do que o backend acrescenta ao Request do Express. So para a
// checagem de tipos (npm run typecheck); nao gera codigo.
import 'express-serve-static-core';

declare module 'express-serve-static-core' {
    interface Request {
        // Preenchido por requireAuth (backend/auth/auth.js) em toda rota
        // autenticada.
        user?: {
            id: number;
            username: string;
            isAdmin: boolean;
        };
    }
}
