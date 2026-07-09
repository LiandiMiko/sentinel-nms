export const notFoundHandler = (req, res, next) => {
    const error = new Error("Route not found: " + req.method + " " + req.originalUrl);
    error.status = 404;
    next(error);
};
