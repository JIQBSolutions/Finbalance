import { supabase } from "./supabase";

export type WorkspaceType = "personal" | "business";

export type Workspace = {
  id: string;
  name: string;
  workspace_type: WorkspaceType;
  currency: string;
  is_active?: boolean;
  owner_id?: string;
  role?: string;
  is_current?: boolean;
  created_at?: string;
};

type WorkspaceRpcRow = {
  workspace_id: string;
  workspace_name: string;
  workspace_type: WorkspaceType;
  currency: string;
  is_active?: boolean;
  owner_id?: string;
  role?: string;
  is_current?: boolean;
  created_at?: string;
};

function normalizeWorkspace(row: WorkspaceRpcRow): Workspace {
  return {
    id: row.workspace_id,
    name: row.workspace_name,
    workspace_type: row.workspace_type,
    currency: row.currency,
    is_active: row.is_active,
    owner_id: row.owner_id,
    role: row.role,
    is_current: row.is_current,
    created_at: row.created_at,
  };
}

export async function getCurrentWorkspace() {
  const { data, error } = await supabase.rpc("get_current_workspace");

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? (data[0] as WorkspaceRpcRow | undefined) : undefined;

  return row ? normalizeWorkspace(row) : null;
}

export async function listUserWorkspaces() {
  const { data, error } = await supabase.rpc("list_user_workspaces");

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as WorkspaceRpcRow[]).map(normalizeWorkspace);
}