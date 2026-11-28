import { supabaseRest } from "../supabase-rest.cjs";

export const DEFAULT_MAQUETE_MODO = "rastreio";
export const MAQUETE_MODOS = ["rastreio", "exibicao"];

export function normalizeMaqueteModo(value) {
  const modo = String(value || "").trim().toLowerCase();
  return MAQUETE_MODOS.includes(modo) ? modo : DEFAULT_MAQUETE_MODO;
}

export function isValidMaqueteModo(value) {
  return MAQUETE_MODOS.includes(String(value || "").trim().toLowerCase());
}

export async function readMaqueteModo(options = {}) {
  const rest = options.supabaseRest || supabaseRest;
  try {
    const result = await rest("app_state?id=eq.1&select=maquete_modo", {
      allowServiceRole: true,
      env: options.env,
      fetchImpl: options.fetchImpl,
    });
    if (!result?.ok) return DEFAULT_MAQUETE_MODO;
    const rows = Array.isArray(result.json) ? result.json : [];
    return normalizeMaqueteModo(rows[0]?.maquete_modo);
  } catch {
    return DEFAULT_MAQUETE_MODO;
  }
}
