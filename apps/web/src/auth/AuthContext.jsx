import { useEffect, useState } from "react";
import AuthContext from "./context";
import api from "../api/client";

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const interceptorId = api.interceptors.response.use(
            (response) => response,
            (requestError) => {
                const url = requestError.config?.url;
                if (
                    requestError.response?.status === 401 &&
                    url !== "/auth/me" &&
                    url !== "/auth/login" &&
                    url !== "/auth/logout"
                ) {
                    setUser(null);
                }
                return Promise.reject(requestError);
            }
        );
        api.get("/auth/me")
            .then(({ data }) => {
                if (active) setUser(data.data.user);
            })
            .catch(() => {
                if (active) setUser(null);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
            api.interceptors.response.eject(interceptorId);
        };
    }, []);

    async function login(email, password) {
        const { data } = await api.post("/auth/login", { email, password });
        setUser(data.data.user);
        return data.data.user;
    }

    async function logout() {
        await api.post("/auth/logout");
        setUser(null);
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
            {children}
        </AuthContext.Provider>
    );
}
