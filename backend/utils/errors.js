class AppError extends Error {
    constructor(statusCode, message, details) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.details = details || null;
    }
}

module.exports = {
    AppError
};
