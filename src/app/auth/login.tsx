import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateForm = () => {
    const errors: { [key: string]: string } = {};

    if (!email.trim()) {
      errors.email = "El correo es obligatorio.";
    } else if (!emailRegex.test(email.trim())) {
      errors.email = "Correo electrónico no válido.";
    }

    if (!password) {
      errors.password = "La contraseña es obligatoria.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const redirectAfterLogin = async () => {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id")
      .eq("is_active", true)
      .limit(1);

    if (error) {
      throw new Error("No pudimos cargar tus espacios de trabajo.");
    }

    if (!data || data.length === 0) {
      router.replace("/dashboard/onboarding");
      return;
    }

    router.replace("/dashboard/dashboard");
  };

  const handleLogin = async () => {
    setGlobalError(null);

    if (!validateForm()) {
      setGlobalError("Por favor, corrige los errores antes de continuar.");
      return;
    }

    setIsLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        const message = error.message.toLowerCase();

        if (message.includes("invalid login credentials")) {
          setGlobalError("Correo o contraseña incorrectos.");
        } else if (message.includes("email not confirmed")) {
          setGlobalError("Confirma tu correo antes de iniciar sesión.");
        } else if (message.includes("network") || message.includes("fetch")) {
          setGlobalError("No pudimos iniciar sesión. Revisa tu conexión.");
        } else {
          setGlobalError("Ocurrió un error al iniciar sesión.");
        }

        setIsLoading(false);
        return;
      }

      await redirectAfterLogin();
    } catch (error: any) {
      setGlobalError(error.message || "Ocurrió un error inesperado.");
      setIsLoading(false);
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
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignSelf: "center", width: "100%", maxWidth: 600, paddingHorizontal: 24 }}>

            <View style={[styles.logoWrapper, {marginBottom: 18, marginTop: 24}]}>
              <FinbalanceLogo variant="dark" linkToDashboard={false} />
            </View>

            <View style={styles.formWrapper}>
              <View style={styles.header}>
                <Text style={styles.title}>Bienvenido de nuevo</Text>
                <Text style={styles.subtitle}>
                  Inicia sesión para continuar
                </Text>
              </View>
            

              {globalError && (
                <View style={styles.errorAlert}>
                  <Feather name="alert-triangle" size={18} color="#FCA5A5" />
                  <Text style={styles.errorAlertText}>{globalError}</Text>
                </View>
              )}

              <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Correo electrónico</Text>

                <View style={[styles.inputWrapper, fieldErrors.email && styles.inputError]}>
                  <Feather
                    name="mail"
                    size={20}
                    color="#9CA3AF"
                    style={styles.inputLeftIcon}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="tu@email.com"
                    placeholderTextColor="#6B7280"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (fieldErrors.email) {
                        setFieldErrors({ ...fieldErrors, email: "" });
                      }
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {fieldErrors.email && (
                  <Text style={styles.errorText}>{fieldErrors.email}</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Contraseña</Text>

                <View
                  style={[styles.inputWrapper, fieldErrors.password && styles.inputError]}
                >
                  <Feather
                    name="lock"
                    size={20}
                    color="#9CA3AF"
                    style={styles.inputLeftIcon}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#6B7280"
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (fieldErrors.password) {
                        setFieldErrors({ ...fieldErrors, password: "" });
                      }
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeIcon}
                  >
                    <Feather
                      name={showPassword ? "eye-off" : "eye"}
                      size={20}
                      color="#9CA3AF"
                    />
                  </TouchableOpacity>
                </View>

                {fieldErrors.password && (
                  <Text style={styles.errorText}>{fieldErrors.password}</Text>
                )}
              </View>

              <TouchableOpacity
                onPress={() => {
                  setGlobalError("La recuperación de contraseña la agregaremos después.");
                }}
                style={styles.forgotPasswordButton}
              >
                <Text style={styles.forgotPasswordText}>
                  ¿Olvidaste tu contraseña?
                </Text>
              </TouchableOpacity>
              </View>

              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
                  onPress={handleLogin}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Iniciar sesión</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.registerPrompt}>
                  <Text style={styles.registerText}>¿No tienes una cuenta? </Text>

                  <TouchableOpacity onPress={() => router.push("/auth/register")}>
                    <Text style={styles.registerLink}>Regístrate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
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
    flexGrow: 2,
    paddingBottom: 40,
    
  },

  logoWrapper: {
    flexDirection: "row",
    //alignItems: "center",
    //marginRight: 48,
    marginBottom: 18,
  },

  formWrapper: {
    ...Platform.select({
      web: {
        marginHorizontal: "auto",
        alignSelf: "flex-start",
        width: "100%",
      },
      default: {
        width: "100%",
      },
    }),
  },

  header: {
    marginBottom: 32,
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    color: "#0b9387",
    lineHeight: 24,
    fontWeight: "500",
  },

  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },

  errorAlertText: {
    color: "#FCA5A5",
    marginLeft: 12,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },

  formContainer: {
    gap: 20,
    marginBottom: 40,
  },

  inputGroup: {
    gap: 8,
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#E2E8F0",
    marginLeft: 4,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
  },

  inputError: {
    borderColor: "#EF4444",
  },

  inputLeftIcon: {
    marginRight: 12,
  },

  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    height: "100%",
  },

  eyeIcon: {
    padding: 4,
  },

  errorText: {
    color: "#FCA5A5",
    fontSize: 13,
    marginLeft: 4,
    marginTop: 2,
  },

  forgotPasswordButton: {
    alignSelf: "flex-end",
  },

  forgotPasswordText: {
    color: "#0b9387",
    fontSize: 14,
    fontWeight: "700",
  },

  footer: {
    marginTop: "auto",
  },

  primaryButton: {
    backgroundColor: "#0b9387",
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },

  primaryButtonDisabled: {
    backgroundColor: "#0b938780",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  registerPrompt: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  registerText: {
    color: "#94A3B8",
    fontSize: 15,
  },

  registerLink: {
    color: "#0b9387",
    fontSize: 15,
    fontWeight: "700",
  },
});