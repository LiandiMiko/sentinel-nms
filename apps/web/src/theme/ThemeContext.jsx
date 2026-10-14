import { useEffect, useState } from "react";
import ThemeContext from "./context";

function getInitialTheme() {
    try {
        return localStorage.getItem("sentinel-theme") === "dark" ? "dark" : "light";
    } catch (error) {
        console.warn("Could not read the saved theme preference.", error);
        return "light";
    }
}

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(getInitialTheme);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        try {
            localStorage.setItem("sentinel-theme", theme);
        } catch (error) {
            console.warn("Could not save the theme preference.", error);
        }
    }, [theme]);

    function toggleTheme() {
        setTheme((current) => current === "dark" ? "light" : "dark");
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
