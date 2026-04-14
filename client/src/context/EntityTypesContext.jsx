import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ENTITY_TYPES } from '../constants';
import { api } from '../api';
import { useAuth } from './AuthContext';

const EntityTypesContext = createContext(null);

// Built-in type colors (hardcoded defaults)
export const BUILTIN_COLORS = {
  power_automate_flow:  '#6366f1',
  sql_table:            '#0ea5e9',
  qlik_app:             '#10b981',
  microsoft_dataverse:  '#742774',
  sharepoint_list:      '#e11d48',
  api:                  '#a855f7',
  power_app:            '#8b5cf6',
  pp_dataflow:          '#0066b8',
  sql_stored_procedure: '#06b6d4',
  sap:                  '#0070f3',
  custom:               '#64748b',
};

export function EntityTypesProvider({ children }) {
  const { token } = useAuth();
  const [customTypes, setCustomTypes] = useState([]);

  const reload = useCallback(() => {
    if (!token) return;
    api.getEntityTypes().then(setCustomTypes).catch(() => {});
  }, [token]);

  useEffect(() => { reload(); }, [reload]);

  // Merged: built-in defaults + workspace custom types, sorted alphabetically
  const allTypes = [
    ...ENTITY_TYPES,
    ...customTypes.map(t => ({ value: t.value, label: t.label, color: t.color })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  // Full color map (built-ins + custom)
  const nodeColors = Object.fromEntries(allTypes.map(t => [t.value, t.color || BUILTIN_COLORS[t.value] || '#64748b']));
  // Ensure built-in defaults always win for built-in types
  Object.assign(nodeColors, BUILTIN_COLORS);

  // Label map
  const typeLabels = Object.fromEntries(allTypes.map(t => [t.value, t.label]));

  return (
    <EntityTypesContext.Provider value={{ allTypes, customTypes, nodeColors, typeLabels, reload }}>
      {children}
    </EntityTypesContext.Provider>
  );
}

export const useEntityTypes = () => useContext(EntityTypesContext);
