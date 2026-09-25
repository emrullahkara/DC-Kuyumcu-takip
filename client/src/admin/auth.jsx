import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setCsrf, onAuthEvent } from '../lib/api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, permissions: {}, flag: null });

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/api/auth/me');
      setCsrf(me.csrf);
      setState({ loading: false, user: me.user, permissions: me.permissions, site: me.site, flag: me.user.must_change_password ? 'MUST_CHANGE_PASSWORD' : null });
      return me;
    } catch (e) {
      setCsrf(null);
      setState({ loading: false, user: null, permissions: {}, flag: e.code || null });
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onAuthEvent((ev) => {
    if (ev.type === 'unauthorized') setState({ loading: false, user: null, permissions: {}, flag: 'expired' });
    else setState((s) => ({ ...s, flag: ev.type }));
  }), []);

  const logout = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* yoksay */ }
    setCsrf(null);
    setState({ loading: false, user: null, permissions: {}, flag: null });
  };

  /** can('sales') → görüntüleme; can('sales','w') → işlem */
  const can = (module, level = 'r') => {
    const p = state.permissions?.[module];
    return !!p && (level === 'r' || p === 'w');
  };

  return <AuthCtx.Provider value={{ ...state, refresh, logout, can }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
