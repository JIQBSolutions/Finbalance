import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

type WorkspaceType = "personal" | "business";
type AccountType = "bank" | "cash" | "credit" | "investment";
type Currency = "MXN" | "USD";

type InitialAccount = {
  id: string;
  name: string;
  account_type: AccountType;
  initial_balance: string;
};

const CURRENCIES: Currency[] = ["MXN", "USD"];

const ACCOUNT_TYPES: {
  value: AccountType;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { value: "bank", label: "Banco", icon: "credit-card" },
  { value: "cash", label: "Caja", icon: "dollar-sign" },
  { value: "investment", label: "Ahorro", icon: "trending-up" },
  { value: "credit", label: "Deuda", icon: "alert-circle" },
];

function createEmptyAccount(): InitialAccount {
  return {
    id: `${Date.now()}-${Math.random()}`,
    name: "",
    account_type: "bank",
    initial_balance: "",
  };
}

function parseMoney(value: string) {
  const cleanValue = value.replace(",", ".").trim();
  const numberValue = Number(cleanValue);

  if (Number.isNaN(numberValue)) return null;
  return numberValue;
}

export default function OnboardingScreen() {
  const router = useRouter();

  const [userName, setUserName] = useState("Usuario");

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceType, setWorkspaceType] =
    useState<WorkspaceType>("business");
  const [currency, setCurrency] = useState<Currency>("MXN");
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);

  const [accounts, setAccounts] = useState<InitialAccount[]>([
    createEmptyAccount(),
  ]);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const fullName = user.user_metadata?.full_name;
      if (fullName) {
        setUserName(fullName.split(" ")[0]);
      }
    }

    loadUser();
  }, [router]);

  const totalInitialBalance = useMemo(() => {
    return accounts.reduce((total, account) => {
      const value = parseMoney(account.initial_balance);
      return total + (value || 0);
    }, 0);
  }, [accounts]);

  const updateAccount = (
    id: string,
    field: keyof InitialAccount,
    value: string
  ) => {
    setAccounts((prev) =>
      prev.map((account) =>
        account.id === id ? { ...account, [field]: value } : account
      )
    );
  };

  const addAccount = () => {
    setAccounts((prev) => [...prev, createEmptyAccount()]);
  };

  const removeAccount = (id: string) => {
    if (accounts.length === 1) {
      setGlobalError("Debes registrar al menos una cuenta inicial.");
      return;
    }

    setAccounts((prev) => prev.filter((account) => account.id !== id));
  };

  const validateWorkspaceStep = () => {
    if (!workspaceName.trim()) {
      setGlobalError("Ingresa el nombre de tu workspace.");
      return false;
    }

    if (workspaceName.trim().length > 60) {
      setGlobalError("El nombre del workspace no puede exceder 60 caracteres.");
      return false;
    }

    if (!currency.trim()) {
      setGlobalError("Selecciona MXN o USD.");
      return false;
    }

    if (!CURRENCIES.includes(currency as Currency)) {
      setGlobalError("Selecciona MXN o USD.");
      return false;
    }

    return true;
  };

  const validateAccountsStep = () => {
    if (accounts.length === 0) {
      setGlobalError("Agrega al menos una cuenta.");
      return false;
    }

    for (const account of accounts) {
      if (!account.name.trim()) {
        setGlobalError("Todas las cuentas deben tener nombre.");
        return false;
      }

      if (account.name.trim().length > 40) {
        setGlobalError("El nombre de una cuenta es demasiado largo.");
        return false;
      }

      const balance = parseMoney(account.initial_balance || "0");

      if (balance === null || balance < 0) {
        setGlobalError("Todos los saldos deben ser números válidos.");
        return false;
      }
    }

    const normalizedNames = accounts.map((account) =>
      account.name.trim().toLowerCase()
    );

    const hasDuplicateNames =
      new Set(normalizedNames).size !== normalizedNames.length;

    if (hasDuplicateNames) {
      setGlobalError("No repitas nombres de cuentas.");
      return false;
    }

    return true;
  };

  const handleNextStep = () => {
    setGlobalError(null);

    if (!validateWorkspaceStep()) return;

    setStep(2);
  };

  const handleCompleteOnboarding = async () => {
    setGlobalError(null);

    if (!validateAccountsStep()) return;

    setIsLoading(true);

    try {
      const formattedAccounts = accounts.map((account) => ({
        name: account.name.trim(),
        account_type: account.account_type,
        initial_balance: parseMoney(account.initial_balance || "0") || 0,
        currency: currency.trim().toUpperCase(),
      }));

      const { error } = await supabase.rpc(
        "create_workspace_with_initial_accounts",
        {
          p_workspace_name: workspaceName.trim(),
          p_workspace_type: workspaceType,
          p_accounts: formattedAccounts,
          p_currency: currency.trim().toUpperCase(),
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      router.replace("/dashboard/dashboard");
    } catch (error: any) {
      setGlobalError(
        error.message || "No pudimos completar la configuración inicial."
      );
      setIsLoading(false);
    }
  };

  const renderStepOne = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>¡Hola, {userName}!</Text>
      <Text style={styles.subtitle}>
        Vamos a crear tu primer espacio financiero.
      </Text>

      {globalError && <ErrorAlert message={globalError} />}

      <View style={styles.formGroup}>
        <Text style={styles.label}>Tipo de workspace</Text>

        <View style={styles.rowButtons}>
          <OptionButton
            label="Negocio"
            icon="briefcase"
            active={workspaceType === "business"}
            onPress={() => setWorkspaceType("business")}
          />

          <OptionButton
            label="Personal"
            icon="user"
            active={workspaceType === "personal"}
            onPress={() => setWorkspaceType("personal")}
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Nombre del workspace</Text>

        <View style={styles.inputWrapper}>
          <Feather
            name="layout"
            size={20}
            color="#9CA3AF"
            style={styles.inputIcon}
          />

          <TextInput
            style={styles.input}
            placeholder={
              workspaceType === "business"
                ? "Ej. Barbería Central"
                : "Ej. Finanzas personales"
            }
            placeholderTextColor="#6B7280"
            value={workspaceName}
            onChangeText={setWorkspaceName}
            autoCapitalize="words"
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Moneda principal</Text>

        <View style={styles.inputWrapper}>
          <Feather
            name="dollar-sign"
            size={20}
            color="#9CA3AF"
            style={styles.inputIcon}
          />

          <TouchableOpacity
            style={styles.currencySelect}
            onPress={() => setCurrencyDropdownOpen((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Text style={styles.input}>{currency}</Text>
            <Feather
              name={currencyDropdownOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        </View>

        {currencyDropdownOpen && (
          <View style={styles.dropdownMenu}>
            {CURRENCIES.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.dropdownItem}
                onPress={() => {
                  setCurrency(option);
                  setCurrencyDropdownOpen(false);
                  setGlobalError(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.dropdownItemText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleNextStep}>
        <Text style={styles.primaryButtonText}>Continuar</Text>
        <Feather name="arrow-right" size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  const renderStepTwo = () => (
    <View style={styles.stepContainer}>
      <TouchableOpacity
        onPress={() => {
          setGlobalError(null);
          setStep(1);
        }}
        style={styles.backButton}
      >
        <Feather name="arrow-left" size={24} color="#9CA3AF" />
      </TouchableOpacity>

      <Text style={styles.title}>Cuentas iniciales</Text>
      <Text style={styles.subtitle}>
        Registra dónde está el dinero de este workspace.
      </Text>

      {globalError && <ErrorAlert message={globalError} />}

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Saldo inicial total</Text>
        <Text style={styles.summaryAmount}>
          ${totalInitialBalance.toLocaleString("es-MX")}
        </Text>
      </View>

      <View style={styles.accountsList}>
        {accounts.map((account, index) => (
          <View key={account.id} style={styles.accountCard}>
            <View style={styles.accountHeader}>
              <Text style={styles.accountTitle}>Cuenta {index + 1}</Text>

              {accounts.length > 1 && (
                <TouchableOpacity onPress={() => removeAccount(account.id)}>
                  <Feather name="trash-2" size={18} color="#FCA5A5" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Tipo de cuenta</Text>

              <View style={styles.accountTypeGrid}>
                {ACCOUNT_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.accountTypeButton,
                      account.account_type === type.value &&
                        styles.accountTypeButtonActive,
                    ]}
                    onPress={() =>
                      updateAccount(account.id, "account_type", type.value)
                    }
                  >
                    <Feather
                      name={type.icon}
                      size={18}
                      color={
                        account.account_type === type.value
                          ? "#FFFFFF"
                          : "#9CA3AF"
                      }
                    />

                    <Text
                      style={[
                        styles.accountTypeText,
                        account.account_type === type.value &&
                          styles.accountTypeTextActive,
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Nombre de la cuenta</Text>

              <View style={styles.inputWrapper}>
                <Feather
                  name="edit-2"
                  size={20}
                  color="#9CA3AF"
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Ej. BBVA, Caja, CETES"
                  placeholderTextColor="#6B7280"
                  value={account.name}
                  onChangeText={(text) =>
                    updateAccount(account.id, "name", text)
                  }
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Saldo inicial</Text>

              <View style={styles.inputWrapper}>
                <Text style={styles.currencyPrefix}>$</Text>

                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  value={account.initial_balance}
                  onChangeText={(text) =>
                    updateAccount(account.id, "initial_balance", text)
                  }
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.addAccountButton} onPress={addAccount}>
        <Feather name="plus" size={18} color="#0b9387" />
        <Text style={styles.addAccountText}>Agregar otra cuenta</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
        onPress={handleCompleteOnboarding}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <Text style={styles.primaryButtonText}>Finalizar configuración</Text>
            <Feather name="check" size={20} color="#FFFFFF" />
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {step === 1 ? renderStepOne() : renderStepTwo()}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <View style={styles.errorAlert}>
      <Feather name="alert-triangle" size={18} color="#FCA5A5" />
      <Text style={styles.errorAlertText}>{message}</Text>
    </View>
  );
}

function OptionButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.typeButton, active && styles.typeButtonActive]}
      onPress={onPress}
    >
      <Feather
        name={icon}
        size={24}
        color={active ? "#FFFFFF" : "#9CA3AF"}
      />

      <Text style={[styles.typeButtonText, active && styles.typeButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
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
    paddingHorizontal: 28,
    paddingTop: 70,
    paddingBottom: 40,
  },

  stepContainer: {
    flex: 1,
  },

  backButton: {
    marginBottom: 24,
    alignSelf: "flex-start",
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 12,
  },

  subtitle: {
    fontSize: 16,
    color: "#0b9387",
    lineHeight: 24,
    fontWeight: "500",
    marginBottom: 34,
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

  formGroup: {
    marginBottom: 22,
  },

  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#E2E8F0",
    marginBottom: 12,
  },

  rowButtons: {
    flexDirection: "row",
    gap: 12,
  },

  typeButton: {
    flex: 1,
    height: 100,
    backgroundColor: "#1E293B",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  typeButtonActive: {
    borderColor: "#0b9387",
    backgroundColor: "rgba(11, 147, 135, 0.15)",
  },

  typeButtonText: {
    color: "#9CA3AF",
    fontSize: 15,
    fontWeight: "600",
  },

  typeButtonTextActive: {
    color: "#FFFFFF",
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

  inputIcon: {
    marginRight: 12,
  },

  currencyPrefix: {
    fontSize: 18,
    color: "#9CA3AF",
    marginRight: 8,
    fontWeight: "600",
  },

  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    height: "100%",
  },

  currencySelect: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: "100%",
  },

  dropdownMenu: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    marginTop: 8,
    overflow: "hidden",
  },

  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },

  dropdownItemText: {
    color: "#FFFFFF",
    fontSize: 16,
  },

  primaryButton: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#0b9387",
    minHeight: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    paddingHorizontal: 18,
  },

  primaryButtonDisabled: {
    backgroundColor: "#0b938780",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  summaryCard: {
    backgroundColor: "rgba(11, 147, 135, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(11, 147, 135, 0.35)",
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
  },

  summaryLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },

  summaryAmount: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
  },

  accountsList: {
    gap: 18,
  },

  accountCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 18,
  },

  accountHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  accountTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },

  accountTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  accountTypeButton: {
    width: "47%",
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  accountTypeButtonActive: {
    borderColor: "#0b9387",
    backgroundColor: "rgba(11, 147, 135, 0.15)",
  },

  accountTypeText: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "700",
  },

  accountTypeTextActive: {
    color: "#FFFFFF",
  },

  addAccountButton: {
    marginTop: 18,
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0b9387",
    backgroundColor: "rgba(11, 147, 135, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  addAccountText: {
    color: "#0b9387",
    fontSize: 15,
    fontWeight: "800",
  },
});