import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { http } from "@/lib/api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [perspective, setPerspectiveState] = useState(localStorage.getItem("fos_perspective") || "combined");
  const [theme, setThemeState] = useState(localStorage.getItem("fos_theme") || "light");

  const check = useCallback(async () => {
    try { setUser((await http.get("/auth/me")).data); } catch { setUser(false); }
  }, []);

  useEffect(() => { check(); }, [check]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("fos_theme", theme);
  }, [theme]);

  const signIn = (data) => {
    if (data.access_token) localStorage.setItem("fos_token", data.access_token);
    const { access_token, ...u } = data;
    setUser(u);
  };
  const logout = async () => {
    try { await http.post("/auth/logout"); } catch { /* ignore */ }
    localStorage.removeItem("fos_token");
    setUser(false);
  };
  const setPerspective = (p) => { localStorage.setItem("fos_perspective", p); setPerspectiveState(p); };
  const setTheme = (t) => { setThemeState(t); http.patch("/me/profile", { theme: t }).catch(() => {}); };

  return (
    <Ctx.Provider value={{ user, setUser, check, signIn, logout, perspective, setPerspective, theme, setTheme,
      currency: user?.settings?.currency || "USD" }}>
      {children}
    </Ctx.Provider>
  );
}
