import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FinbalanceLogo } from "../../components/FinbalanceLogo";
import { supabase } from "../../lib/supabase";
import {
  getCurrentWorkspace,
  listUserWorkspaces,
} from "../../lib/workspaces";

type WorkspaceType = "personal" | "business";

type Workspace = {
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

const CURRENCIES = ["MXN", "USD"];

function getWorkspaceTypeLabel(type: WorkspaceType) {
  return type === "business" ? "Negocio" : "Personal";
}

export default function SettingsScreen() {
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
    null
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceType, setNewWorkspaceType] =
    useState<WorkspaceType>("business");
  const [newWorkspaceCurrency, setNewWorkspaceCurrency] = useState("MXN");

  const [editWorkspaceName, setEditWorkspaceName] = useState("");
  const [editWorkspaceType, setEditWorkspaceType] =
    useState<WorkspaceType>("business");
  const [editWorkspaceCurrency, setEditWorkspaceCurrency] = useState("MXN");

  const loadSettings = useCallback(async () => {
    setGlobalError(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/auth/login");
        return;
      }

      const current = await getCurrentWorkspace();
      setCurrentWorkspace(current);

      const workspaceList = await listUserWorkspaces();
      setWorkspaces(workspaceList);

      if (current) {
        setEditWorkspaceName(current.name);
        setEditWorkspaceType(current.workspace_type);
        setEditWorkspaceCurrency(current.currency);
      }
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos cargar la configuración.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadSettings();
  };

  const resetCreateForm = () => {
    setNewWorkspaceName("");
    setNewWorkspaceType("business");
    setNewWorkspaceCurrency("MXN");
    setShowCreateForm(false);
    setGlobalError(null);
  };

  const validateWorkspaceForm = (
    name: string,
    currency: string,
    mode: "create" | "edit"
  ) => {
    if (!name.trim()) {
      setGlobalError("Ingresa el nombre del workspace.");
      return false;
    }

    if (name.trim().length > 60) {
      setGlobalError("El nombre del workspace no puede exceder 60 caracteres.");
      return false;
    }

    if (!currency.trim() || currency.trim().length !== 3) {
      setGlobalError("La moneda debe tener 3 caracteres.");
      return false;
    }

    if (mode === "create") {
      const duplicatedName = workspaces.some(
        (workspace) =>
          workspace.name.trim().toLowerCase() === name.trim().toLowerCase()
      );

      if (duplicatedName) {
        setGlobalError("Ya tienes un workspace activo con ese nombre.");
        return false;
      }
    }

    return true;
  };

  const handleCreateWorkspace = async () => {
    setGlobalError(null);
    setSuccessMessage(null);

    if (
      !validateWorkspaceForm(
        newWorkspaceName,
        newWorkspaceCurrency,
        "create"
      )
    ) {
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase.rpc("create_empty_workspace", {
        p_name: newWorkspaceName.trim(),
        p_workspace_type: newWorkspaceType,
        p_currency: newWorkspaceCurrency.trim().toUpperCase(),
      });

      if (error) {
        throw new Error(error.message);
      }

      resetCreateForm();
      setSuccessMessage(
        "Workspace creado y seleccionado. Ahora puedes agregarle cuentas."
      );
      await loadSettings();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos crear el workspace.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetCurrentWorkspace = async (workspaceId: string) => {
    setGlobalError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const { error } = await supabase.rpc("set_current_workspace", {
        p_workspace_id: workspaceId,
      });

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage("Workspace seleccionado.");
      await loadSettings();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos cambiar de workspace.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCurrentWorkspace = async () => {
    setGlobalError(null);
    setSuccessMessage(null);

    if (!currentWorkspace) {
      setGlobalError("No encontramos un workspace actual.");
      return;
    }

    if (
      !validateWorkspaceForm(editWorkspaceName, editWorkspaceCurrency, "edit")
    ) {
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase.rpc("update_workspace_settings", {
        p_workspace_id: currentWorkspace.id,
        p_name: editWorkspaceName.trim(),
        p_workspace_type: editWorkspaceType,
        p_currency: editWorkspaceCurrency.trim().toUpperCase(),
      });

      if (error) {
        throw new Error(error.message);
      }

      setShowEditForm(false);
      setSuccessMessage("Workspace actualizado.");
      await loadSettings();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos actualizar el workspace.");
    } finally {
      setIsSaving(false);
    }
  };

  const archiveWorkspace = async (workspaceId: string) => {
    setGlobalError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const { error } = await supabase.rpc("archive_workspace", {
        p_workspace_id: workspaceId,
      });

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage("Workspace eliminado.");
      await loadSettings();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos eliminar el workspace.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveWorkspace = (workspace: Workspace) => {
    Alert.alert(
      "Eliminar workspace",
      `Vas a eliminar "${workspace.name}". No podrás verlo en la app, pero sus registros quedarán guardados en la base de datos.`,
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => archiveWorkspace(workspace.id),
        },
      ]
    );
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#0b9387" size="large" />
          <Text style={styles.loadingText}>Cargando configuración...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#0b9387"
            />
          }
        >
          <View style={styles.header}>
            <FinbalanceLogo variant="dark" />

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => router.replace("/dashboard/dashboard")}
              disabled={isSaving}
            >
              <Feather name="x" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <View style={styles.titleBlock}>
            <Text style={styles.kicker}>Configuración</Text>
            <Text style={styles.title}>Administra tu espacio</Text>
            <Text style={styles.subtitle}>
              Cambia de workspace, crea nuevos espacios financieros o ajusta la
              configuración general.
            </Text>
          </View>

          {globalError && (
            <View style={styles.errorAlert}>
              <Feather name="alert-triangle" size={18} color="#f79191" />
              <Text style={styles.errorAlertText}>{globalError}</Text>
            </View>
          )}

          {successMessage && (
            <View style={styles.successAlert}>
              <Feather name="check-circle" size={18} color="#86EFAC" />
              <Text style={styles.successAlertText}>{successMessage}</Text>
            </View>
          )}

          <View style={styles.currentWorkspaceCard}>
            <Text style={styles.cardKicker}>Workspace actual</Text>
            <Text style={styles.currentWorkspaceName}>
              {currentWorkspace?.name || "Sin workspace seleccionado"}
            </Text>

            {currentWorkspace && (
              <View style={styles.workspaceMetaRow}>
                <View style={styles.workspaceBadge}>
                  <Text style={styles.workspaceBadgeText}>
                    {getWorkspaceTypeLabel(currentWorkspace.workspace_type)}
                  </Text>
                </View>

                <View style={styles.workspaceBadge}>
                  <Text style={styles.workspaceBadgeText}>
                    {currentWorkspace.currency}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.currentActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  if (currentWorkspace) {
                    setEditWorkspaceName(currentWorkspace.name);
                    setEditWorkspaceType(currentWorkspace.workspace_type);
                    setEditWorkspaceCurrency(currentWorkspace.currency);
                  }
                  setShowEditForm((prev) => !prev);
                  setShowCreateForm(false);
                  setGlobalError(null);
                }}
                disabled={!currentWorkspace || isSaving}
              >
                <Feather name="edit-3" size={16} color="#0b9387" />
                <Text style={styles.secondaryButtonText}>Editar actual</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push("/finances/accounts")}
                disabled={!currentWorkspace || isSaving}
              >
                <Feather name="plus-circle" size={16} color="#0b9387" />
                <Text style={styles.secondaryButtonText}>Agregar cuentas</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showEditForm && currentWorkspace && (
            <WorkspaceFormCard
              title="Editar workspace"
              name={editWorkspaceName}
              setName={setEditWorkspaceName}
              workspaceType={editWorkspaceType}
              setWorkspaceType={setEditWorkspaceType}
              currency={editWorkspaceCurrency}
              setCurrency={setEditWorkspaceCurrency}
              isSaving={isSaving}
              submitLabel="Guardar cambios"
              onSubmit={handleUpdateCurrentWorkspace}
              onCancel={() => {
                setShowEditForm(false);
                setGlobalError(null);
              }}
            />
          )}

          {!showCreateForm ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                setShowCreateForm(true);
                setShowEditForm(false);
                setGlobalError(null);
              }}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              <Feather name="plus-circle" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Crear nuevo workspace</Text>
            </TouchableOpacity>
          ) : (
            <WorkspaceFormCard
              title="Nuevo workspace"
              name={newWorkspaceName}
              setName={setNewWorkspaceName}
              workspaceType={newWorkspaceType}
              setWorkspaceType={setNewWorkspaceType}
              currency={newWorkspaceCurrency}
              setCurrency={setNewWorkspaceCurrency}
              isSaving={isSaving}
              submitLabel="Crear workspace"
              onSubmit={handleCreateWorkspace}
              onCancel={resetCreateForm}
            />
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tus workspaces</Text>
              <Text style={styles.sectionHint}>
                Selecciona el espacio financiero que quieres ver en el dashboard.
              </Text>
            </View>

            {workspaces.length > 0 ? (
              workspaces.map((workspace) => (
                <WorkspaceRow
                  key={workspace.id}
                  workspace={workspace}
                  isCurrent={workspace.id === currentWorkspace?.id}
                  isSaving={isSaving}
                  onSelect={() => handleSetCurrentWorkspace(workspace.id)}
                  onArchive={() => handleArchiveWorkspace(workspace)}
                />
              ))
            ) : (
              <EmptyState text="Todavía no tienes workspaces activos." />
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Configuración general</Text>
              <Text style={styles.sectionHint}>
                Opciones básicas de la aplicación.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push("/user_config/profile")}
            >
              <View style={styles.settingLeft}>
                <View style={styles.settingIcon}>
                  <Feather name="user" size={17} color="#0b9387" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Perfil</Text>
                  <Text style={styles.settingDescription}>
                    Edita tu nombre e información personal.
                  </Text>
                </View>
              </View>

              <Feather name="chevron-right" size={20} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingRow}
              onPress={handleLogout}
              disabled={isSaving}
            >
              <View style={styles.settingLeft}>
                <View style={styles.settingIconDanger}>
                  <Feather name="log-out" size={17} color="#FCA5A5" />
                </View>
                <View>
                  <Text style={styles.settingTitleDanger}>Cerrar sesión</Text>
                  <Text style={styles.settingDescription}>
                    Salir de Finbalance en este dispositivo.
                  </Text>
                </View>
              </View>

              <Feather name="chevron-right" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WorkspaceFormCard({
  title,
  name,
  setName,
  workspaceType,
  setWorkspaceType,
  currency,
  setCurrency,
  isSaving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  name: string;
  setName: (value: string) => void;
  workspaceType: WorkspaceType;
  setWorkspaceType: (value: WorkspaceType) => void;
  currency: string;
  setCurrency: (value: string) => void;
  isSaving: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.formCard}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>{title}</Text>

        <TouchableOpacity onPress={onCancel} disabled={isSaving}>
          <Feather name="x" size={20} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Tipo</Text>

        <View style={styles.rowButtons}>
          <OptionButton
            label="Negocio"
            icon="briefcase"
            active={workspaceType === "business"}
            onPress={() => setWorkspaceType("business")}
            disabled={isSaving}
          />

          <OptionButton
            label="Personal"
            icon="user"
            active={workspaceType === "personal"}
            onPress={() => setWorkspaceType("personal")}
            disabled={isSaving}
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Nombre</Text>

        <View style={styles.inputWrapper}>
          <Feather
            name="layout"
            size={20}
            color="#9CA3AF"
            style={styles.inputIcon}
          />

          <TextInput
            style={styles.input}
            placeholder="Ej. Consultoría Jaime"
            placeholderTextColor="#64748B"
            value={name}
            onChangeText={setName}
            editable={!isSaving}
            autoCapitalize="words"
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Moneda</Text>

        <View style={styles.currencyRow}>
          {CURRENCIES.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.currencyChip,
                currency === option && styles.currencyChipActive,
              ]}
              onPress={() => setCurrency(option)}
              disabled={isSaving}
            >
              <Text
                style={[
                  styles.currencyChipText,
                  currency === option && styles.currencyChipTextActive,
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
        onPress={onSubmit}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <Text style={styles.primaryButtonText}>{submitLabel}</Text>
            <Feather name="check" size={20} color="#FFFFFF" />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function OptionButton({
  label,
  icon,
  active,
  onPress,
  disabled,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.typeButton, active && styles.typeButtonActive]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <Feather
        name={icon}
        size={22}
        color={active ? "#FFFFFF" : "#9CA3AF"}
      />

      <Text style={[styles.typeButtonText, active && styles.typeButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function WorkspaceRow({
  workspace,
  isCurrent,
  isSaving,
  onSelect,
  onArchive,
}: {
  workspace: Workspace;
  isCurrent: boolean;
  isSaving: boolean;
  onSelect: () => void;
  onArchive: () => void;
}) {
  return (
    <View style={[styles.workspaceRowCard, isCurrent && styles.workspaceRowActive]}>
      <View style={styles.workspaceRowTop}>
        <View style={styles.workspaceRowLeft}>
          <View style={styles.workspaceRowIcon}>
            <Feather
              name={workspace.workspace_type === "business" ? "briefcase" : "user"}
              size={18}
              color="#0b9387"
            />
          </View>

          <View style={styles.workspaceRowInfo}>
            <Text style={styles.workspaceRowName}>{workspace.name}</Text>
            <Text style={styles.workspaceRowMeta}>
              {getWorkspaceTypeLabel(workspace.workspace_type)} ·{" "}
              {workspace.currency}
            </Text>
          </View>
        </View>

        {isCurrent && (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>Actual</Text>
          </View>
        )}
      </View>

      <View style={styles.workspaceRowActions}>
        {!isCurrent && (
          <TouchableOpacity
            style={styles.rowActionButton}
            onPress={onSelect}
            disabled={isSaving}
          >
            <Text style={styles.rowActionText}>Usar</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.rowDangerButton}
          onPress={onArchive}
          disabled={isSaving}
        >
          <Text style={styles.rowDangerText}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <Feather name="info" size={18} color="#94A3B8" />
      <Text style={styles.emptyStateText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 42,
    paddingBottom: 42,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  titleBlock: {
    marginBottom: 24,
  },
  kicker: {
    color: "#0b9387",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    padding: 16,
    borderRadius: 14,
    marginBottom: 22,
  },
  errorAlertText: {
    color: "#FCA5A5",
    marginLeft: 12,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  successAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    padding: 16,
    borderRadius: 14,
    marginBottom: 22,
  },
  successAlertText: {
    color: "#86EFAC",
    marginLeft: 12,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  currentWorkspaceCard: {
    backgroundColor: "#0b9387",
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
  },
  cardKicker: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },
  currentWorkspaceName: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  workspaceMetaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  workspaceBadge: {
    backgroundColor: "rgba(15,23,42,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  workspaceBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  currentActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.2)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  primaryButton: {
    backgroundColor: "#0b9387",
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 26,
  },
  primaryButtonDisabled: {
    backgroundColor: "#0b938780",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  formCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 22,
    padding: 18,
    marginBottom: 26,
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },
  formTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  rowButtons: {
    flexDirection: "row",
    gap: 12,
  },
  typeButton: {
    flex: 1,
    height: 82,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  typeButtonActive: {
    borderColor: "#0b9387",
    backgroundColor: "rgba(11,147,135,0.16)",
  },
  typeButtonText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "800",
  },
  typeButtonTextActive: {
    color: "#FFFFFF",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    height: "100%",
  },
  currencyRow: {
    flexDirection: "row",
    gap: 10,
  },
  currencyChip: {
    minWidth: 72,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  currencyChipActive: {
    backgroundColor: "rgba(11,147,135,0.16)",
    borderColor: "#0b9387",
  },
  currencyChipText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "900",
  },
  currencyChipTextActive: {
    color: "#FFFFFF",
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  sectionHint: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 4,
    lineHeight: 19,
  },
  workspaceRowCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  workspaceRowActive: {
    borderColor: "#0b9387",
  },
  workspaceRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  workspaceRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  workspaceRowIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceRowInfo: {
    flex: 1,
  },
  workspaceRowName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  workspaceRowMeta: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 3,
    fontWeight: "600",
  },
  currentBadge: {
    backgroundColor: "rgba(11,147,135,0.16)",
    borderWidth: 1,
    borderColor: "rgba(11,147,135,0.35)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  currentBadgeText: {
    color: "#0b9387",
    fontSize: 11,
    fontWeight: "900",
  },
  workspaceRowActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  rowActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: "rgba(11,147,135,0.1)",
    borderWidth: 1,
    borderColor: "#0b9387",
    alignItems: "center",
    justifyContent: "center",
  },
  rowActionText: {
    color: "#0b9387",
    fontSize: 13,
    fontWeight: "900",
  },
  rowDangerButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowDangerText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "900",
  },
  settingRow: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingIconDanger: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  settingTitleDanger: {
    color: "#FCA5A5",
    fontSize: 15,
    fontWeight: "900",
  },
  settingDescription: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  emptyState: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "rgba(30,41,59,0.5)",
    padding: 18,
    alignItems: "center",
    gap: 10,
  },
  emptyStateText: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});