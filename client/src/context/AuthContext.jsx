import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

function parseToken(token) {
  try { return JSON.parse(atob(token.split('.')[1])); }
  catch { return null; }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('fp_token'));
  const [user,  setUser]  = useState(() => {
    const t = localStorage.getItem('fp_token');
    return t ? parseToken(t) : null;
  });

  function login(newToken) {
    localStorage.setItem('fp_token', newToken);
    setToken(newToken);
    setUser(parseToken(newToken));
  }

  function logout() {
    localStorage.removeItem('fp_token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
