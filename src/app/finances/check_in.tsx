import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { FinbalanceLogo } from "../../components/FinbalanceLogo";

type Workspace = {
  id: string;
  name: string;
  workspace_type: "personal" | "business";
  currency: string;
};

type OperationalAccountType = "bank" | "cash";

type AccountBalance = {
  account_id: string;
  account_name?: string;
  name?: string;
  account_type: OperationalAccountType;
  balance: number;
  currency?: string;
};

type CheckInAccount = {
  account_id: string;
  account_name: string;
  account_type: OperationalAccountType;
  previous_balance: number;
  new_balance: string;
};

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

function getAccountTypeLabel(type: OperationalAccountType) {
  const labels = {
    bank: "Banco",
    cash: "Efectivo",
  };

  return labels[type];
}

function getAccountIcon(type: OperationalAccountType): keyof typeof Feather.glyphMap {
  const icons = {
    bank: "credit-card",
    cash: "dollar-sign",
  } as const;

  return icons[type];
}

export default function CheckInScreen() {
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [accounts, setAccounts] = useState<CheckInAccount[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [globalError, setGlobalError] = useState<string | null>(null);

  const currency = workspace?.currency || "MXN";

  const previousAvailable = useMemo(() => {
    return accounts.reduce((total, account) => {
      return total + Number(account.previous_balance || 0);
    }, 0);
  }, [accounts]);

  const newAvailable = useMemo(() => {
    return accounts.reduce((total, account) => {
      const parsedValue = parseMoney(account.new_balance);
      return total + (parsedValue || 0);
    }, 0);
  }, [accounts]);

  const difference = newAvailable - previousAvailable;

  const loadCheckInData = useCallback(async () => {
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
        .eq("workspace_id", currentWorkspace.id)
        .in("account_type", ["bank", "cash"]);

      if (balancesError) {
        throw new Error(balancesError.message);
      }

      const formattedAccounts = ((balances || []) as AccountBalance[]).map(
        (account) => {
          const currentBalance = Number(account.balance || 0);

          return {
            account_id: account.account_id,
            account_name: account.account_name || account.name || "Cuenta",
            account_type: account.account_type,
            previous_balance: currentBalance,
            new_balance: String(currentBalance),
          };
        }
      );

      setAccounts(formattedAccounts);
    } catch (error: any) {
      setGlobalError(
        error.message || "No pudimos cargar tus cuentas para el check-in."
      );
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadCheckInData();
  }, [loadCheckInData]);

  const updateAccountBalance = (accountId: string, value: string) => {
    setAccounts((prev) =>
      prev.map((account) =>
        account.account_id === accountId
          ? { ...account, new_balance: value }
          : account
      )
    );
  };

  const validateCheckIn = () => {
    if (!workspace) {
      setGlobalError("No encontramos un workspace activo.");
      return false;
    }

    if (accounts.length === 0) {
      setGlobalError(
        "No tienes cuentas operativas. Agrega una cuenta bancaria o de efectivo."
      );
      return false;
    }

    for (const account of accounts) {
      const balance = parseMoney(account.new_balance);

      if (balance === null) {
        setGlobalError(`El saldo de "${account.account_name}" no es válido.`);
        return false;
      }

      if (balance < 0) {
        setGlobalError(`El saldo de "${account.account_name}" no puede ser negativo.`);
        return false;
      }
    }

    return true;
  };

  const handleSubmitCheckIn = async () => {
    setGlobalError(null);

   if (!validateCheckIn()) return;

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

      const snapshots = accounts.map((account) => ({
       account_id: account.account_id,
       balance: parseMoney(account.new_balance) || 0,
     }));

      const { error: rpcError } = await supabase.rpc(
        "create_operational_check_in",
       {
         p_workspace_id: workspace.id,
         p_snapshots: snapshots,
       }
     );

      if (rpcError) {
        throw new Error(rpcError.message);
     }

     router.replace("/dashboard/dashboard");
   } catch (error: any) {
     setGlobalError(error.message || "No pudimos guardar el check-in.");
     setIsSaving(false);
   }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#0b9387" size="large" />
          <Text style={styles.loadingText}>Preparando tu check-in...</Text>
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
            <Text style={styles.kicker}>Check-In financiero</Text>
            <Text style={styles.title}>Actualiza tus saldos</Text>
            <Text style={styles.subtitle}>
              Registra cuánto tienes hoy en banco y efectivo.
            </Text>
          </View>

          {globalError && (
            <View style={styles.errorAlert}>
              <Feather name="alert-triangle" size={18} color="#FCA5A5" />
              <Text style={styles.errorAlertText}>{globalError}</Text>
            </View>
          )}

          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryLabel}>Dinero disponible actualizado</Text>
              <Text style={styles.summaryAmount}>
                {formatMoney(newAvailable, currency)}
              </Text>
            </View>

            <View
              style={[
                styles.differencePill,
                difference >= 0
                  ? styles.differencePillPositive
                  : styles.differencePillNegative,
              ]}
            >
              <Feather
                name={difference >= 0 ? "arrow-up-right" : "arrow-down-right"}
                size={15}
                color={difference >= 0 ? "#86EFAC" : "#FCA5A5"}
              />
              <Text
                style={[
                  styles.differenceText,
                  difference >= 0
                    ? styles.differenceTextPositive
                    : styles.differenceTextNegative,
                ]}
              >
                {difference >= 0 ? "+" : ""}
                {formatMoney(difference, currency)}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cuentas operativas</Text>
            <Text style={styles.sectionHint}>
              Solo banco y efectivo participan en este check-in.
            </Text>

            {accounts.length > 0 ? (
              accounts.map((account) => (
                <View key={account.account_id} style={styles.accountCard}>
                  <View style={styles.accountHeader}>
                    <View style={styles.accountLeft}>
                      <View style={styles.accountIcon}>
                        <Feather
                          name={getAccountIcon(account.account_type)}
                          size={18}
                          color="#0b9387"
                        />
                      </View>

                      <View style={styles.accountInfo}>
                        <Text style={styles.accountName}>
                          {account.account_name}
                        </Text>
                        <Text style={styles.accountType}>
                          {getAccountTypeLabel(account.account_type)}
                        </Text>
                      </View>
                    </View>

                    <View>
                      <Text style={styles.previousLabel}>Anterior</Text>
                      <Text style={styles.previousBalance}>
                        {formatMoney(account.previous_balance, currency)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Saldo actual</Text>

                    <View style={styles.inputWrapper}>
                      <Text style={styles.currencyPrefix}>$</Text>

                      <TextInput
                        style={styles.input}
                        value={account.new_balance}
                        onChangeText={(text) =>
                          updateAccountBalance(account.account_id, text)
                        }
                        placeholder="0.00"
                        placeholderTextColor="#64748B"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Feather name="info" size={20} color="#94A3B8" />
                <Text style={styles.emptyStateText}>
                  No tienes cuentas de banco o efectivo para actualizar.
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              (isSaving || accounts.length === 0) && styles.primaryButtonDisabled,
            ]}
            onPress={handleSubmitCheckIn}
            disabled={isSaving || accounts.length === 0}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Guardar Check-In</Text>
                <Feather name="check" size={20} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
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

  summaryCard: {
    backgroundColor: "#0b9387",
    borderRadius: 26,
    padding: 22,
    marginBottom: 28,
    gap: 18,
  },

  summaryLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },

  summaryAmount: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
  },

  differencePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },

  differencePillPositive: {
    backgroundColor: "rgba(22, 101, 52, 0.35)",
  },

  differencePillNegative: {
    backgroundColor: "rgba(127, 29, 29, 0.35)",
  },

  differenceText: {
    fontSize: 13,
    fontWeight: "900",
  },

  differenceTextPositive: {
    color: "#86EFAC",
  },

  differenceTextNegative: {
    color: "#FCA5A5",
  },

  section: {
    marginBottom: 28,
  },

  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },

  sectionHint: {
    color: "#64748B",
    fontSize: 13,
    marginBottom: 16,
  },

  accountCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },

  accountHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
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

  previousLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 3,
  },

  previousBalance: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },

  inputGroup: {
    gap: 8,
  },

  label: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "700",
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

  currencyPrefix: {
    color: "#94A3B8",
    fontSize: 17,
    fontWeight: "800",
    marginRight: 8,
  },

  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    height: "100%",
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
    fontWeight: "800",
  },
});