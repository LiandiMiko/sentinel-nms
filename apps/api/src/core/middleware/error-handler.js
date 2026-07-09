import { ZodError } from "zod";
import { error } from "../response/response.js";

const formatZodErrors = (issues) => {
    return issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
    }));
};

export const errorHandler = (err, req, res, next) => {
    if (err instanceof ZodError) {
        return error(res, "Validation error", 400, formatZodErrors(err.issues));
    }

    const status = err.status || 500;
    const message = status === 500 ? "Internal server error" : err.message;

    if (status === 500) {
        console.error(err);
    }

    return error(res, message, status);
};
