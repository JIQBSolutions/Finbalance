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

type Workspace = {
  id: string;
  name: string;
  workspace_type: "personal" | "business";
  currency: string;
};

type AccountType = "bank" | "cash" | "credit" | "investment";

type AccountBalance = {
  workspace_id?: string;
  account_id: string;
  account_name?: string;
  name?: string;
  account_type: AccountType;
  balance: number;
  currency?: string;
  created_at?: string;
  check_in_date?: string;
};

const ACCOUNT_TYPES: {
  value: AccountType;
  label: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  {
    value: "bank",
    label: "Banco",
    description: "Cuentas bancarias del negocio o personales.",
    icon: "credit-card",
  },
  {
    value: "cash",
    label: "Efectivo",
    description: "Caja, dinero físico o efectivo disponible.",
    icon: "dollar-sign",
  },
  {
    value: "investment",
    label: "Inversión",
    description: "Ahorros, CETES, fondos o inversiones.",
    icon: "trending-up",
  },
  {
    value: "credit",
    label: "Deuda",
    description: "Tarjetas, préstamos o saldos por pagar.",
    icon: "alert-circle",
  },
];

function formatMoney(amount: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(amount);
}

function parseMoney(value: string) {
  const cleanValue = value.trim().replace(/\s/g, "");

  if (!cleanValue) return null;

  const hasComma = cleanValue.includes(",");
  const hasDot = cleanValue.includes(".");

  let normalizedValue = cleanValue;

  if (hasComma && hasDot) {
    normalizedValue = cleanValue.replace(/,/g, "");
  } else if (hasComma) {
    normalizedValue = cleanValue.replace(",", ".");
  }

  const numberValue = Number(normalizedValue);

  if (!Number.isFinite(numberValue)) return null;

  return numberValue;
}

function getAccountTypeLabel(type: AccountType) {
  const labels = {
    bank: "Banco",
    cash: "Efectivo",
    credit: "Deuda",
    investment: "Inversión",
  };

  return labels[type];
}

function getAccountIcon(type: AccountType): keyof typeof Feather.glyphMap {
  const icons = {
    bank: "credit-card",
    cash: "dollar-sign",
    credit: "alert-circle",
    investment: "trending-up",
  } as const;

  return icons[type];
}

export default function AccountsScreen() {
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("bank");
  const [initialBalance, setInitialBalance] = useState("");

  const currency = workspace?.currency || "MXN";

  const totals = useMemo(() => {
    return accounts.reduce(
      (acc, account) => {
        const balance = Number(account.balance || 0);

        if (account.account_type === "bank" || account.account_type === "cash") {
          acc.available += balance;
        }

        if (account.account_type === "investment") {
          acc.investments += balance;
        }

        if (account.account_type === "credit") {
          acc.debt += balance;
        }

        return acc;
      },
      {
        available: 0,
        investments: 0,
        debt: 0,
      }
    );
  }, [accounts]);

  const groupedAccounts = useMemo(() => {
    return {
      operational: accounts.filter(
        (account) =>
          account.account_type === "bank" || account.account_type === "cash"
      ),
      secondary: accounts.filter(
        (account) =>
          account.account_type === "investment" ||
          account.account_type === "credit"
      ),
    };
  }, [accounts]);

  const loadAccounts = useCallback(async () => {
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

      const { data: workspaces, error: workspaceError } = await supabase
        .from("workspaces")
        .select("id, name, workspace_type, currency")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1);

      if (workspaceError) {
        throw new Error(workspaceError.message);
      }

      if (!workspaces || workspaces.length === 0) {
        router.replace("/dashboard/onboarding");
        return;
      }

      const currentWorkspace = workspaces[0] as Workspace;
      setWorkspace(currentWorkspace);

      const { data: balances, error: balancesError } = await supabase
        .from("latest_account_balances")
        .select("*")
        .eq("workspace_id", currentWorkspace.id);

      if (balancesError) {
        throw new Error(balancesError.message);
      }

      const formattedAccounts = ((balances || []) as AccountBalance[]).sort(
        (a, b) => {
          const order: Record<AccountType, number> = {
            bank: 1,
            cash: 2,
            investment: 3,
            credit: 4,
          };

          return order[a.account_type] - order[b.account_type];
        }
      );

      setAccounts(formattedAccounts);
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos cargar tus cuentas.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadAccounts();
  };

  const resetForm = () => {
    setAccountName("");
    setAccountType("bank");
    setInitialBalance("");
    setShowCreateForm(false);
    setGlobalError(null);
  };

  const validateNewAccount = () => {
    if (!workspace) {
      setGlobalError("No encontramos un workspace activo.");
      return false;
    }

    if (!accountName.trim()) {
      setGlobalError("Ingresa el nombre de la cuenta.");
      return false;
    }

    if (accountName.trim().length > 40) {
      setGlobalError("El nombre de la cuenta no puede exceder 40 caracteres.");
      return false;
    }

    const normalizedNewName = accountName.trim().toLowerCase();

    const duplicatedName = accounts.some((account) => {
      const currentName = account.account_name || account.name || "";
      return currentName.trim().toLowerCase() === normalizedNewName;
    });

    if (duplicatedName) {
      setGlobalError("Ya existe una cuenta con ese nombre.");
      return false;
    }

    const balance = parseMoney(initialBalance || "0");

    if (balance === null) {
      setGlobalError("El saldo inicial debe ser un número válido.");
      return false;
    }

    if (balance < 0) {
      setGlobalError("El saldo inicial no puede ser negativo.");
      return false;
    }

    return true;
  };

    const handleCreateAccount = async () => {
     setGlobalError(null);

     if (!validateNewAccount()) return;

      setIsSaving(true);

      try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

       if (userError || !user) {
        router.replace("/auth/login");
        return;
      }

      if (!workspace) {
        throw new Error("No encontramos un workspace activo.");
       }

       const parsedInitialBalance = parseMoney(initialBalance || "0") || 0;

       const { error: rpcError } = await supabase.rpc(
       "create_account_with_initial_snapshot",
        {
         p_workspace_id: workspace.id,
         p_name: accountName.trim(),
         p_account_type: accountType,
         p_initial_balance: parsedInitialBalance,
         p_currency: currency,
         }
       );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

   resetForm();
     await loadAccounts();
      } catch (error: any) {
     setGlobalError(error.message || "No pudimos crear la cuenta.");
     } finally {
     setIsSaving(false);
     }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#0b9387" size="large" />
          <Text style={styles.loadingText}>Cargando tus cuentas...</Text>
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
            <Text style={styles.kicker}>Cuentas financieras</Text>
            <Text style={styles.title}>Administra tus cuentas</Text>
            <Text style={styles.subtitle}>
              Agrega bancos, efectivo, inversiones o deudas a tu workspace.
            </Text>
          </View>

          {globalError && (
            <View style={styles.errorAlert}>
              <Feather name="alert-triangle" size={18} color="#FCA5A5" />
              <Text style={styles.errorAlertText}>{globalError}</Text>
            </View>
          )}

          <View style={styles.summaryGrid}>
            <SummaryCard
              label="Disponible"
              value={formatMoney(totals.available, currency)}
              icon="dollar-sign"
            />

            <SummaryCard
              label="Inversiones"
              value={formatMoney(totals.investments, currency)}
              icon="trending-up"
            />

            <SummaryCard
              label="Deudas"
              value={formatMoney(totals.debt, currency)}
              icon="alert-circle"
            />
          </View>

          {!showCreateForm ? (
            <TouchableOpacity
              style={styles.addAccountButton}
              onPress={() => {
                setGlobalError(null);
                setShowCreateForm(true);
              }}
              activeOpacity={0.85}
            >
              <Feather name="plus-circle" size={20} color="#FFFFFF" />
              <Text style={styles.addAccountButtonText}>Nueva cuenta</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.formCard}>
              <View style={styles.formHeader}>
                <View>
                  <Text style={styles.formTitle}>Nueva cuenta</Text>
                  <Text style={styles.formSubtitle}>
                    Se creará con un saldo inicial.
                  </Text>
                </View>

                <TouchableOpacity onPress={resetForm} disabled={isSaving}>
                  <Feather name="x" size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Tipo de cuenta</Text>

                <View style={styles.accountTypeGrid}>
                  {ACCOUNT_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.accountTypeButton,
                        accountType === type.value &&
                          styles.accountTypeButtonActive,
                      ]}
                      onPress={() => setAccountType(type.value)}
                      disabled={isSaving}
                      activeOpacity={0.85}
                    >
                      <Feather
                        name={type.icon}
                        size={18}
                        color={
                          accountType === type.value ? "#FFFFFF" : "#9CA3AF"
                        }
                      />

                      <Text
                        style={[
                          styles.accountTypeText,
                          accountType === type.value &&
                            styles.accountTypeTextActive,
                        ]}
                      >
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.typeDescription}>
                  {
                    ACCOUNT_TYPES.find((type) => type.value === accountType)
                      ?.description
                  }
                </Text>
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
                    placeholder="Ej. BBVA, Caja, CETES, Tarjeta"
                    placeholderTextColor="#64748B"
                    value={accountName}
                    onChangeText={setAccountName}
                    autoCapitalize="words"
                    editable={!isSaving}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {accountType === "credit"
                    ? "Deuda inicial"
                    : "Saldo inicial"}
                </Text>

                <View style={styles.inputWrapper}>
                  <Text style={styles.currencyPrefix}>$</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor="#64748B"
                    value={initialBalance}
                    onChangeText={setInitialBalance}
                    keyboardType="decimal-pad"
                    editable={!isSaving}
                  />
                </View>

                {accountType === "credit" && (
                  <Text style={styles.helpText}>
                    Para deudas, registra el monto como positivo. Ej. si debes
                    $8,000, escribe 8000.
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  isSaving && styles.primaryButtonDisabled,
                ]}
                onPress={handleCreateAccount}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Guardar cuenta</Text>
                    <Feather name="check" size={20} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Cuentas operativas</Text>
              <Text style={styles.sectionHint}>Banco + efectivo</Text>
            </View>

            {groupedAccounts.operational.length > 0 ? (
              groupedAccounts.operational.map((account) => (
                <AccountRow
                  key={account.account_id}
                  account={account}
                  currency={currency}
                />
              ))
            ) : (
              <EmptyState text="Aún no tienes cuentas operativas." />
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Otras cuentas</Text>
              <Text style={styles.sectionHint}>Inversiones y deudas</Text>
            </View>

            {groupedAccounts.secondary.length > 0 ? (
              groupedAccounts.secondary.map((account) => (
                <AccountRow
                  key={account.account_id}
                  account={account}
                  currency={currency}
                />
              ))
            ) : (
              <EmptyState text="Aún no tienes inversiones o deudas registradas." />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryIcon}>
        <Feather name={icon} size={17} color="#0b9387" />
      </View>

      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function AccountRow({
  account,
  currency,
}: {
  account: AccountBalance;
  currency: string;
}) {
  const accountName = account.account_name || account.name || "Cuenta";

  return (
    <View style={styles.accountRow}>
      <View style={styles.accountLeft}>
        <View style={styles.accountIcon}>
          <Feather
            name={getAccountIcon(account.account_type)}
            size={18}
            color="#0b9387"
          />
        </View>

        <View style={styles.accountInfo}>
          <Text style={styles.accountName}>{accountName}</Text>
          <Text style={styles.accountType}>
            {getAccountTypeLabel(account.account_type)}
          </Text>
        </View>
      </View>

      <Text style={styles.accountBalance}>
        {formatMoney(Number(account.balance || 0), currency)}
      </Text>
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

  summaryGrid: {
    gap: 12,
    marginBottom: 18,
  },

  summaryCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 16,
  },

  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  summaryLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 5,
  },

  summaryValue: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
  },

  addAccountButton: {
    backgroundColor: "#0b9387",
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 28,
  },

  addAccountButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
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
  },

  formGroup: {
    marginBottom: 20,
  },

  label: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },

  accountTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  accountTypeButton: {
    width: "47%",
    minHeight: 54,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  accountTypeButtonActive: {
    borderColor: "#0b9387",
    backgroundColor: "rgba(11,147,135,0.16)",
  },

  accountTypeText: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "800",
  },

  accountTypeTextActive: {
    color: "#FFFFFF",
  },

  typeDescription: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
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

  currencyPrefix: {
    color: "#94A3B8",
    fontSize: 17,
    fontWeight: "800",
    marginRight: 8,
  },

  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    height: "100%",
  },

  helpText: {
    color: "#94A3B8",
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
    marginTop: 4,
  },

  primaryButtonDisabled: {
    backgroundColor: "#0b938780",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
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
    fontWeight: "800",
  },

  sectionHint: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 4,
  },

  accountRow: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  accountLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  accountIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },

  accountInfo: {
    flex: 1,
  },

  accountName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  accountType: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 3,
  },

  accountBalance: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
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