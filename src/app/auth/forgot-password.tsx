import { Feather } from "@expo/vector-icons";
import * as ExpoLinking from "expo-linking";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
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
import { FieldError } from "../../components/FieldError";
import { FinbalanceLogo } from "../../components/FinbalanceLogo";
import { supabase } from "../../lib/supabase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  const handleSendRecovery = async () => {
    const cleanEmail = email.trim().toLowerCase();
    setError(null);
    setEmailError(null);

    if (!EMAIL_REGEX.test(cleanEmail)) {
      setEmailError("Ingresa un correo electrónico válido.");
      return;
    }

    setIsLoading(true);

    try {
      const redirectTo = ExpoLinking.createURL("/auth/update-password");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        cleanEmail,
        { redirectTo }
      );

      if (resetError) {
        throw resetError;
      }

      setIsSent(true);
    } catch (requestError: any) {
      setError(
        requestError.message ||
          "No pudimos enviar el enlace. Inténtalo nuevamente."
      );
    } finally {
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
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.logoWrapper}>
              <FinbalanceLogo variant="dark" linkToDashboard={false} />
            </View>

            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <Feather name="key" size={24} color="#0b9387" />
              </View>
              <Text style={styles.title}>Recupera tu contraseña</Text>
              <Text style={styles.subtitle}>
                Te enviaremos un enlace seguro para crear una contraseña nueva.
              </Text>

              {error && (
                <View style={styles.errorAlert}>
                  <Feather name="alert-triangle" size={18} color="#FCA5A5" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {isSent ? (
                <View style={styles.successBlock}>
                  <Feather name="mail" size={28} color="#86EFAC" />
                  <Text style={styles.successTitle}>Revisa tu correo</Text>
                  <Text style={styles.successText}>
                    Si existe una cuenta para {email.trim().toLowerCase()},
                    recibirás el enlace en unos minutos.
                  </Text>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => router.replace("/auth/login")}
                  >
                    <Text style={styles.primaryButtonText}>
                      Volver a iniciar sesión
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.label}>Correo electrónico</Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      emailError && styles.inputWrapperError,
                    ]}
                  >
                    <Feather name="mail" size={19} color="#94A3B8" />
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={(value) => {
                        setEmail(value);
                        setEmailError(null);
                      }}
                      placeholder="tu@email.com"
                      placeholderTextColor="#64748B"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                      onSubmitEditing={handleSendRecovery}
                    />
                  </View>
                  <FieldError message={emailError} />

                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      isLoading && styles.primaryButtonDisabled,
                    ]}
                    onPress={handleSendRecovery}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Enviar enlace</Text>
                    )}
                  </TouchableOpacity>

                  <Link href="/auth/login" asChild>
                    <TouchableOpacity style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>
                        Volver a iniciar sesión
                      </Text>
                    </TouchableOpacity>
                  </Link>
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
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
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
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    height: "100%",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: "#0b9387",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    paddingHorizontal: 18,
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  secondaryButtonText: { color: "#94A3B8", fontSize: 14, fontWeight: "800" },
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
  successBlock: { alignItems: "center", paddingTop: 8 },
  successTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 12,
  },
  successText: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
});
