import { supabase } from "./supabase";

export type BusinessTransactionType = "income" | "expense";

export type OperationalAccount = {
  account_id: string;
  account_name: string;
  account_type: "bank" | "cash";
  balance: number;
  currency?: string;
};

export type BusinessTransaction = {
  id: string;
  workspace_id: string;
  account_id: string;
  account_name: string;
  account_type?: "bank" | "cash";
  transaction_type: BusinessTransactionType;
  amount: number;
  description: string;
  category: string;
  transaction_date: string;
  counterparty?: string | null;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
  is_voided: boolean;
  voided_at?: string | null;
};

export type BusinessTransactionPayload = {
  workspaceId: string;
  accountId: string;
  transactionType: BusinessTransactionType;
  amount: number;
  description: string;
  category: string;
  transactionDate: string;
  counterparty?: string;
  reference?: string;
  notes?: string;
};

export const INCOME_CATEGORIES = [
  "Ventas",
  "Servicios",
  "Aportaciones",
  "Intereses",
  "Reembolsos",
  "Otros ingresos",
] as const;

export const EXPENSE_CATEGORIES = [
  "Proveedores",
  "Nómina",
  "Renta",
  "Servicios",
  "Impuestos",
  "Marketing",
  "Transporte",
  "Equipo",
  "Otros gastos",
] as const;

const TRANSACTION_SELECT = `
  id,
  workspace_id,
  account_id,
  transaction_type,
  amount,
  description,
  category,
  transaction_date,
  counterparty,
  reference,
  notes,
  created_at,
  updated_at,
  is_voided,
  voided_at,
  accounts (
    name,
    account_type
  )
`;

function normalizeTransaction(row: any): BusinessTransaction {
  const relatedAccount = Array.isArray(row.accounts)
    ? row.accounts[0]
    : row.accounts;

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    account_id: row.account_id,
    account_name: relatedAccount?.name || "Cuenta eliminada",
    account_type: relatedAccount?.account_type,
    transaction_type: row.transaction_type,
    amount: Number(row.amount || 0),
    description: row.description,
    category: row.category || "Otros",
    transaction_date: row.transaction_date,
    counterparty: row.counterparty,
    reference: row.reference,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_voided: Boolean(row.is_voided),
    voided_at: row.voided_at,
  };
}

export function getCategoriesForType(type: BusinessTransactionType) {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export async function listOperationalAccounts(workspaceId: string) {
  const { data, error } = await supabase
    .from("latest_account_balances")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("account_type", ["bank", "cash"]);

  if (error) throw new Error(error.message);

  return ((data || []) as any[])
    .map(
      (row): OperationalAccount => ({
        account_id: row.account_id,
        account_name: row.account_name || row.name || "Cuenta",
        account_type: row.account_type,
        balance: Number(row.balance || 0),
        currency: row.currency,
      })
    )
    .sort((a, b) => a.account_name.localeCompare(b.account_name, "es"));
}

export async function listBusinessTransactions(workspaceId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("workspace_id", workspaceId)
    .in("transaction_type", ["income", "expense"])
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map(normalizeTransaction);
}

export async function listRecentBusinessTransactions(
  workspaceId: string,
  limit = 4
) {
  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("is_voided", false)
    .in("transaction_type", ["income", "expense"])
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map(normalizeTransaction);
}

export async function getBusinessTransaction(
  workspaceId: string,
  transactionId: string
) {
  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("id", transactionId)
    .in("transaction_type", ["income", "expense"])
    .single();

  if (error) throw new Error(error.message);
  return normalizeTransaction(data);
}

function getRpcPayload(payload: BusinessTransactionPayload) {
  return {
    p_account_id: payload.accountId,
    p_transaction_type: payload.transactionType,
    p_amount: payload.amount,
    p_description: payload.description.trim(),
    p_category: payload.category.trim(),
    p_transaction_date: `${payload.transactionDate}T12:00:00`,
    p_counterparty: payload.counterparty?.trim() || null,
    p_reference: payload.reference?.trim() || null,
    p_notes: payload.notes?.trim() || null,
  };
}

export async function createBusinessTransaction(
  payload: BusinessTransactionPayload
) {
  const { data, error } = await supabase.rpc(
    "create_business_manual_transaction",
    {
      p_workspace_id: payload.workspaceId,
      ...getRpcPayload(payload),
    }
  );

  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateBusinessTransaction(
  transactionId: string,
  payload: BusinessTransactionPayload
) {
  const { error } = await supabase.rpc(
    "update_business_manual_transaction",
    {
      p_transaction_id: transactionId,
      ...getRpcPayload(payload),
    }
  );

  if (error) throw new Error(error.message);
}

export async function voidBusinessTransaction(transactionId: string) {
  const { error } = await supabase.rpc("void_business_manual_transaction", {
    p_transaction_id: transactionId,
  });

  if (error) throw new Error(error.message);
}
