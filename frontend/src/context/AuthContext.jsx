import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("golah_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me/")
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("golah_token");
      })
      .finally(() => setLoading(false));
  }, []);

  const completeLogin = ({ token, user: nextUser }) => {
    localStorage.setItem("golah_token", token);
    setUser(nextUser);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout/", {});
    } catch {
      // Ignore server cleanup errors during local logout.
    }
    localStorage.removeItem("golah_token");
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, setUser, loading, completeLogin, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
