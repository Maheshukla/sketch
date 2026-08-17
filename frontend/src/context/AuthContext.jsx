import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data);
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setUser(data);
    return data;
  };

  const verifyOtp = async (payload) => {
    const { data } = await api.post("/auth/otp/verify", payload);
    setUser(data);
    return data;
  };

  const googleSession = async (session_id) => {
    const { data } = await api.post("/auth/google/session", { session_id });
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    setUser(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, setUser, login, register, verifyOtp, googleSession, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
