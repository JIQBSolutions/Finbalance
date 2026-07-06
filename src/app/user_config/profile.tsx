import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

function formatDate(dateString?: string | null) {
  if (!dateString) return "Sin fecha";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getInitials(name?: string | null, email?: string | null) {
  if (name?.trim()) {
    const parts = name.trim().split(" ");
    const first = parts[0]?.[0] || "";
    const second = parts[1]?.[0] || "";

    return `${first}${second}`.toUpperCase();
  }

  return email?.[0]?.toUpperCase() || "U";
}

export default function ProfileScreen() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");

  const [fullName, setFullName] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const initials = useMemo(() => getInitials(fullName, email), [fullName, email]);

  const loadProfile = useCallback(async () => {
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

      setEmail(user.email || "");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, created_at, updated_at")
        .eq("id", user.id)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      const currentProfile = data as Profile;

      setProfile(currentProfile);

      const metadataName = user.user_metadata?.full_name as string | undefined;

      setFullName(currentProfile.full_name || metadataName || "");
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos cargar tu perfil.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadProfile();
  };

  const validateName = () => {
    const cleanName = fullName.trim();

    if (!cleanName) {
      setGlobalError("El nombre es obligatorio.");
      return false;
    }

    if (cleanName.length > 75) {
      setGlobalError("El nombre no puede exceder 75 caracteres.");
      return false;
    }

    const nameRegex =
      /^[A-Za-zÁÉÍÓÚáéíóúÑñ]+(?: [A-Za-zÁÉÍÓÚáéíóúÑñ]+)*$/;

    if (!nameRegex.test(cleanName)) {
      setGlobalError("El nombre solo puede contener letras y espacios.");
      return false;
    }

    return true;
  };

  const handleSaveProfile = async () => {
    setGlobalError(null);
    setSuccessMessage(null);

    if (!validateName()) return;

    setIsSaving(true);

    try {
      const cleanName = fullName.trim();

      const { error: rpcError } = await supabase.rpc(
        "update_profile_full_name",
        {
          p_full_name: cleanName,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: cleanName,
        },
      });

      if (authError) {
        throw new Error(authError.message);
      }

      setSuccessMessage("Perfil actualizado.");
      await loadProfile();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos actualizar tu perfil.");
    } finally {
      setIsSaving(false);
    }
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
          <Text style={styles.loadingText}>Cargando perfil...</Text>
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
              onPress={() => router.back()}
              disabled={isSaving}
            >
              <Feather name="x" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <View style={styles.titleBlock}>
            <Text style={styles.kicker}>Perfil</Text>
            <Text style={styles.title}>Tu información</Text>
            <Text style={styles.subtitle}>
              Administra tu nombre y datos principales de tu cuenta.
            </Text>
          </View>

          {globalError && (
            <View style={styles.errorAlert}>
              <Feather name="alert-triangle" size={18} color="#FCA5A5" />
              <Text style={styles.errorAlertText}>{globalError}</Text>
            </View>
          )}

          {successMessage && (
            <View style={styles.successAlert}>
              <Feather name="check-circle" size={18} color="#86EFAC" />
              <Text style={styles.successAlertText}>{successMessage}</Text>
            </View>
          )}

          <View style={styles.profileHeroCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <Text style={styles.profileName}>
              {fullName.trim() || "Usuario Finbalance"}
            </Text>

            <Text style={styles.profileEmail}>{email}</Text>

            <View style={styles.profileBadge}>
              <Text style={styles.profileBadgeText}>
                Miembro desde {formatDate(profile?.created_at)}
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Editar perfil</Text>
              <Text style={styles.formSubtitle}>
                Este nombre se mostrará dentro de Finbalance.
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Nombre completo</Text>

              <View style={styles.inputWrapper}>
                <Feather
                  name="user"
                  size={20}
                  color="#9CA3AF"
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Tu nombre"
                  placeholderTextColor="#64748B"
                  value={fullName}
                  onChangeText={setFullName}
                  editable={!isSaving}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyLabel}>Correo electrónico</Text>
              <Text style={styles.readOnlyValue}>{email}</Text>
              <Text style={styles.readOnlyHint}>
                Por ahora el correo no se puede modificar desde la app.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                isSaving && styles.primaryButtonDisabled,
              ]}
              onPress={handleSaveProfile}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Guardar cambios</Text>
                  <Feather name="check" size={20} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Cuenta</Text>
              <Text style={styles.sectionHint}>
                Opciones generales de tu sesión.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push("/user_config/settings")}
              disabled={isSaving}
            >
              <View style={styles.settingLeft}>
                <View style={styles.settingIcon}>
                  <Feather name="settings" size={17} color="#0b9387" />
                </View>

                <View>
                  <Text style={styles.settingTitle}>Configuración</Text>
                  <Text style={styles.settingDescription}>
                    Workspaces y ajustes generales.
                  </Text>
                </View>
              </View>

              <Feather name="chevron-right" size={20} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() =>
                setGlobalError("El cambio de contraseña lo agregaremos después.")
              }
              disabled={isSaving}
            >
              <View style={styles.settingLeft}>
                <View style={styles.settingIcon}>
                  <Feather name="lock" size={17} color="#0b9387" />
                </View>

                <View>
                  <Text style={styles.settingTitle}>Cambiar contraseña</Text>
                  <Text style={styles.settingDescription}>
                    Próximamente disponible.
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
                    Salir de Finbalance.
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
  profileHeroCard: {
    backgroundColor: "#0b9387",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    marginBottom: 18,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(15,23,42,0.24)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
  },
  profileName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 6,
  },
  profileEmail: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 14,
  },
  profileBadge: {
    backgroundColor: "rgba(15,23,42,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  profileBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  formCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 22,
    padding: 18,
    marginBottom: 28,
  },
  formHeader: {
    marginBottom: 22,
  },
  formTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 4,
  },
  formSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
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
  readOnlyField: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  readOnlyLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 5,
  },
  readOnlyValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  readOnlyHint: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: "#0b9387",
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: "#0b938780",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
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
});