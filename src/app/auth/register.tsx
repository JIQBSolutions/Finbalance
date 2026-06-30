import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
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

export default function RegisterScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});

  const [passwordScore, setPasswordScore] = useState(0);

  const nombreRegex = /^[A-Za-zÁÉÍÓÚáéíóúÑñ]+(?: [A-Za-zÁÉÍÓÚáéíóúÑñ]+)*$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  useEffect(() => {
    let strength = 0;

    if (password.length >= 8) strength += 25;
    if (/(?=.*[a-z])/.test(password)) strength += 25;
    if (/(?=.*[A-Z])/.test(password)) strength += 25;
    if (/(?=.*\d)/.test(password)) strength += 25;

    setPasswordScore(strength);
  }, [password]);

  const getPasswordStrengthColor = () => {
    if (passwordScore <= 25) return "#EF4444";
    if (passwordScore <= 50) return "#EAB308";
    if (passwordScore <= 75) return "#3B82F6";
    return "#10B981";
  };

  const getPasswordStrengthLabel = () => {
    if (passwordScore <= 25) return "Débil";
    if (passwordScore <= 50) return "Regular";
    if (passwordScore <= 75) return "Buena";
    return "Fuerte";
  };

  const clearFieldError = (field: string) => {
    if (!fieldErrors[field]) return;

    setFieldErrors((prev) => ({
      ...prev,
      [field]: "",
    }));
  };

  const validateForm = () => {
    const errors: { [key: string]: string } = {};

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      errors.fullName = "El nombre es obligatorio.";
    } else if (fullName.startsWith(" ")) {
      errors.fullName = "El nombre no puede comenzar con espacios.";
    } else if (fullName.length > 75) {
      errors.fullName = "El nombre no puede exceder los 75 caracteres.";
    } else if (!nombreRegex.test(cleanName) || fullName.endsWith(" ")) {
      errors.fullName =
        "Nombre inválido. Evita usar números, símbolos o espacios al final.";
    }

    if (!cleanEmail) {
      errors.email = "El correo es obligatorio.";
    } else if (!emailRegex.test(cleanEmail)) {
      errors.email = "Correo electrónico no válido.";
    }

    if (!password) {
      errors.password = "La contraseña es obligatoria.";
    } else if (password.length < 8) {
      errors.password = "La contraseña debe tener al menos 8 caracteres.";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Confirma tu contraseña.";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Las contraseñas no coinciden.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    setGlobalError(null);

    if (!validateForm()) {
      setGlobalError("Por favor, corrige los errores antes de continuar.");
      return;
    }

    setIsLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = fullName.trim();

      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
          },
        },
      });

      if (error) {
        const message = error.message.toLowerCase();

        if (
          message.includes("already registered") ||
          message.includes("user already exists")
        ) {
          setGlobalError("Este correo ya está registrado.");
        } else if (message.includes("weak_password")) {
          setGlobalError("La contraseña es demasiado débil.");
        } else if (message.includes("network") || message.includes("fetch")) {
          setGlobalError("No pudimos crear tu cuenta. Revisa tu conexión.");
        } else {
          setGlobalError("Ocurrió un error al crear tu cuenta.");
        }

        setIsLoading(false);
        return;
      }

      router.replace("/dashboard/onboarding");
    } catch {
      setGlobalError("Ocurrió un error inesperado al procesar tu solicitud.");
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
          <View style={styles.contentWrapper}>
            <View style={styles.logoWrapper}>
              <FinbalanceLogo variant="dark" linkToDashboard={false} />
            </View>

          <View style={styles.header}>
            <Text style={styles.title}>Crea tu cuenta</Text>
            <Text style={styles.subtitle}>
              Empieza a tomar el control de tus finanzas.
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
              <Text style={styles.label}>Nombre completo</Text>

              <View
                style={[
                  styles.inputWrapper,
                  fieldErrors.fullName && styles.inputError,
                ]}
              >
                <Feather
                  name="user"
                  size={20}
                  color="#9CA3AF"
                  style={styles.inputLeftIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Tu nombre"
                  placeholderTextColor="#6B7280"
                  value={fullName}
                  maxLength={75}
                  onChangeText={(text) => {
                    setFullName(text);
                    clearFieldError("fullName");
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  testID="fullName-input"
                />
              </View>

              {fieldErrors.fullName && (
                <Text style={styles.errorText}>{fieldErrors.fullName}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Correo electrónico</Text>

              <View
                style={[
                  styles.inputWrapper,
                  fieldErrors.email && styles.inputError,
                ]}
              >
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
                    clearFieldError("email");
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="email-input"
                />
              </View>

              {fieldErrors.email && (
                <Text style={styles.errorText}>{fieldErrors.email}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Contraseña</Text>

              <View
                style={[
                  styles.inputWrapper,
                  fieldErrors.password && styles.inputError,
                ]}
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
                    clearFieldError("password");
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

              {password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBarBackground}>
                    <View
                      style={[
                        styles.strengthBarFill,
                        {
                          width: `${passwordScore}%`,
                          backgroundColor: getPasswordStrengthColor(),
                        },
                      ]}
                    />
                  </View>

                  <Text
                    style={[
                      styles.strengthLabel,
                      { color: getPasswordStrengthColor() },
                    ]}
                  >
                    {getPasswordStrengthLabel()}
                  </Text>
                </View>
              )}

              {fieldErrors.password && (
                <Text style={styles.errorText}>{fieldErrors.password}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirmar contraseña</Text>

              <View
                style={[
                  styles.inputWrapper,
                  fieldErrors.confirmPassword && styles.inputError,
                ]}
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
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    clearFieldError("confirmPassword");
                  }}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeIcon}
                >
                  <Feather
                    name={showConfirmPassword ? "eye-off" : "eye"}
                    size={20}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>

              {fieldErrors.confirmPassword ? (
                <Text style={styles.errorText}>
                  {fieldErrors.confirmPassword}
                </Text>
              ) : confirmPassword.length > 0 && password === confirmPassword ? (
                <Text style={styles.successText}>
                  Las contraseñas coinciden
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                isLoading && styles.primaryButtonDisabled,
              ]}
              onPress={handleRegister}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Crear cuenta</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginPrompt}>
              <Text style={styles.loginText}>¿Ya tienes una cuenta? </Text>

              <TouchableOpacity onPress={() => router.push("/auth/login")}>
                <Text style={styles.loginLink}>Inicia sesión</Text>
              </TouchableOpacity>
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
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },

  contentWrapper: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 600,
  },

  logoWrapper: {
    alignItems: "center",
    marginBottom: 18,
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

  successText: {
    color: "#34D399",
    fontSize: 13,
    marginLeft: 4,
    marginTop: 2,
  },

  strengthContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 12,
  },

  strengthBarBackground: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 4,
    overflow: "hidden",
  },

  strengthBarFill: {
    height: "100%",
    borderRadius: 4,
  },

  strengthLabel: {
    fontSize: 12,
    fontWeight: "600",
    minWidth: 45,
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

  loginPrompt: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  loginText: {
    color: "#94A3B8",
    fontSize: 15,
  },

  loginLink: {
    color: "#0b9387",
    fontSize: 15,
    fontWeight: "700",
  },
});