import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FieldError } from "../../components/FieldError";
import { FinbalanceLogo } from "../../components/FinbalanceLogo";
import { supabase } from "../../lib/supabase";

function getRecoveryParams(url: string) {
  const [urlWithoutHash, hash = ""] = url.split("#");
  const query = urlWithoutHash.includes("?")
    ? urlWithoutHash.slice(urlWithoutHash.indexOf("?") + 1)
    : "";
  const params = new URLSearchParams([query, hash].filter(Boolean).join("&"));

  return {
    code: params.get("code"),
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    errorDescription: params.get("error_description"),
  };
}

export default function UpdatePasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});

  const prepareSession = useCallback(async (incomingUrl?: string | null) => {
    setError(null);

    try {
      const url = incomingUrl || (await Linking.getInitialURL());
      const recovery = url ? getRecoveryParams(url) : null;

      if (recovery?.errorDescription) {
        throw new Error(recovery.errorDescription);
      }

      if (recovery?.code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(recovery.code);
        if (exchangeError) throw exchangeError;
        setSessionReady(true);
        return;
      }

      if (recovery?.accessToken && recovery.refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: recovery.accessToken,
          refresh_token: recovery.refreshToken,
        });
        if (sessionError) throw sessionError;
        setSessionReady(true);
        return;
      }

      const {
        data: { session: existingSession },
      } = await supabase.auth.getSession();

      if (existingSession) {
        setSessionReady(true);
        return;
      }

      if (!url) {
        throw new Error(
          "Abre esta pantalla desde el enlace que recibiste por correo."
        );
      }

      throw new Error("El enlace es inválido o ya expiró.");
    } catch (sessionError: any) {
      setSessionReady(false);
      setError(sessionError.message || "No pudimos validar el enlace.");
    } finally {
      setIsPreparing(false);
    }
  }, []);

  useEffect(() => {
    prepareSession();
    const subscription = Linking.addEventListener("url", ({ url }) => {
      setIsPreparing(true);
      prepareSession(url);
    });

    return () => subscription.remove();
  }, [prepareSession]);

  const handleUpdatePassword = async () => {
    setError(null);
    const nextErrors: {
      password?: string;
      confirmPassword?: string;
    } = {};

    if (password.length < 8) {
      nextErrors.password = "Usa al menos 8 caracteres.";
    }

    if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Las contraseñas no coinciden.";
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      setIsComplete(true);
    } catch (updateError: any) {
      setError(
        updateError.message || "No pudimos actualizar tu contraseña."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.logoWrapper}>
              <FinbalanceLogo variant="dark" linkToDashboard={false} />
            </View>

            <View style={styles.card}>
              {isPreparing ? (
                <View style={styles.centerBlock}>
                  <ActivityIndicator color="#0b9387" size="large" />
                  <Text style={styles.preparingText}>
                    Validando enlace seguro...
                  </Text>
                </View>
              ) : isComplete ? (
                <View style={styles.centerBlock}>
                  <View style={styles.successIcon}>
                    <Feather name="check" size={26} color="#86EFAC" />
                  </View>
                  <Text style={styles.title}>Contraseña actualizada</Text>
                  <Text style={styles.centerSubtitle}>
                    Ya puedes seguir usando Finbalance con tu nueva contraseña.
                  </Text>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => router.replace("/dashboard/dashboard")}
                  >
                    <Text style={styles.primaryButtonText}>Ir al dashboard</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.title}>Crea una contraseña nueva</Text>
                  <Text style={styles.subtitle}>
                    Usa al menos 8 caracteres y evita reutilizar una contraseña
                    anterior.
                  </Text>

                  {error && (
                    <View style={styles.errorAlert}>
                      <Feather
                        name="alert-triangle"
                        size={18}
                        color="#FCA5A5"
                      />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  {sessionReady && (
                    <>
                      <Text style={styles.label}>Nueva contraseña</Text>
                      <View
                        style={[
                          styles.inputWrapper,
                          fieldErrors.password && styles.inputWrapperError,
                        ]}
                      >
                        <Feather name="lock" size={19} color="#94A3B8" />
                        <TextInput
                          style={styles.input}
                          value={password}
                          onChangeText={(value) => {
                            setPassword(value);
                            setFieldErrors((current) => ({
                              ...current,
                              password: undefined,
                            }));
                          }}
                          placeholder="••••••••"
                          placeholderTextColor="#64748B"
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          editable={!isSaving}
                        />
                        <TouchableOpacity
                          onPress={() => setShowPassword((current) => !current)}
                        >
                          <Feather
                            name={showPassword ? "eye-off" : "eye"}
                            size={19}
                            color="#94A3B8"
                          />
                        </TouchableOpacity>
                      </View>
                      <FieldError message={fieldErrors.password} />

                      <Text style={[styles.label, styles.secondLabel]}>
                        Confirmar contraseña
                      </Text>
                      <View
                        style={[
                          styles.inputWrapper,
                          fieldErrors.confirmPassword &&
                            styles.inputWrapperError,
                        ]}
                      >
                        <Feather name="lock" size={19} color="#94A3B8" />
                        <TextInput
                          style={styles.input}
                          value={confirmPassword}
                          onChangeText={(value) => {
                            setConfirmPassword(value);
                            setFieldErrors((current) => ({
                              ...current,
                              confirmPassword: undefined,
                            }));
                          }}
                          placeholder="••••••••"
                          placeholderTextColor="#64748B"
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          editable={!isSaving}
                          onSubmitEditing={handleUpdatePassword}
                        />
                      </View>
                      <FieldError message={fieldErrors.confirmPassword} />

                      <TouchableOpacity
                        style={[
                          styles.primaryButton,
                          isSaving && styles.primaryButtonDisabled,
                        ]}
                        onPress={handleUpdatePassword}
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.primaryButtonText}>
                            Guardar contraseña
                          </Text>
                        )}
                      </TouchableOpacity>
                    </>
                  )}

                  {!sessionReady && (
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => router.replace("/auth/forgot-password")}
                    >
                      <Text style={styles.primaryButtonText}>
                        Solicitar otro enlace
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  content: { width: "100%", maxWidth: 560, alignSelf: "center" },
  logoWrapper: { alignSelf: "center", marginBottom: 24 },
  card: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 24,
    padding: 22,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 24,
  },
  label: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  secondLabel: { marginTop: 18 },
  inputWrapper: {
    height: 56,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  inputWrapperError: {
    borderColor: "#EF4444",
    borderWidth: 1.5,
  },
  input: { flex: 1, color: "#FFFFFF", fontSize: 16, height: "100%" },
  primaryButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: "#0b9387",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
    paddingHorizontal: 18,
    alignSelf: "stretch",
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    backgroundColor: "rgba(239,68,68,0.1)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  errorText: { color: "#FCA5A5", fontSize: 13, flex: 1, lineHeight: 19 },
  centerBlock: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  preparingText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 14,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,197,94,0.14)",
    marginBottom: 16,
  },
  centerSubtitle: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
});
