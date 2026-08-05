import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { confirmDestructiveAction } from "../../../lib/confirm";
import {
  BusinessTransaction,
  getBusinessTransaction,
  voidBusinessTransaction,
} from "../../../lib/business-transactions";
import { getCurrentWorkspace, Workspace } from "../../../lib/workspaces";

function formatMoney(amount: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatDate(dateString?: string | null, includeTime = false) {
  if (!dateString) return "No registrada";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export default function BusinessTransactionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const transactionId = params.id || "";

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [transaction, setTransaction] =
    useState<BusinessTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoiding, setIsVoiding] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadTransaction = useCallback(async () => {
    setGlobalError(null);
    try {
      const currentWorkspace = await getCurrentWorkspace();
      if (!currentWorkspace) {
        router.replace("/dashboard/onboarding");
        return;
      }
      setWorkspace(currentWorkspace);

      if (currentWorkspace.workspace_type !== "business" || !transactionId) {
        throw new Error("No encontramos este movimiento empresarial.");
      }

      const data = await getBusinessTransaction(
        currentWorkspace.id,
        transactionId
      );
      setTransaction(data);
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos cargar el movimiento.");
    } finally {
      setIsLoading(false);
    }
  }, [router, transactionId]);

  useEffect(() => {
    loadTransaction();
  }, [loadTransaction]);

  const voidTransaction = async () => {
    if (!transaction) return;
    setGlobalError(null);
    setSuccessMessage(null);
    setIsVoiding(true);
    try {
      await voidBusinessTransaction(transaction.id);
      setSuccessMessage(
        "Movimiento cancelado. El saldo fue revertido y el registro se conservó para auditoría."
      );
      await loadTransaction();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos cancelar el movimiento.");
    } finally {
      setIsVoiding(false);
    }
  };

  const handleVoid = () => {
    if (!transaction) return;
    confirmDestructiveAction({
      title: "Cancelar movimiento",
      message:
        transaction.transaction_type === "income"
          ? "El ingreso quedará marcado como cancelado y su monto se restará del saldo actual. Si ese dinero ya no está disponible, la cancelación será rechazada para proteger la consistencia."
          : "El gasto quedará marcado como cancelado y su monto regresará al saldo actual de la cuenta.",
      confirmLabel: "Cancelar movimiento",
      onConfirm: voidTransaction,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#0b9387" size="large" />
          <Text style={styles.loadingText}>Cargando movimiento...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!transaction) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.notFoundContainer}>
          <Feather name="alert-circle" size={28} color="#FCA5A5" />
          <Text style={styles.notFoundTitle}>Movimiento no disponible</Text>
          <Text style={styles.notFoundText}>{globalError}</Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace("/finances/transactions" as any)}
          >
            <Text style={styles.secondaryButtonText}>Volver a movimientos</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isIncome = transaction.transaction_type === "income";
  const accent = isIncome ? "#86EFAC" : "#FCA5A5";
  const currency = workspace?.currency || "MXN";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.replace("/finances/transactions" as any)}
            activeOpacity={0.85}
          >
            <Feather name="arrow-left" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>DETALLE DEL MOVIMIENTO</Text>
            <Text style={styles.title} numberOfLines={2}>
              {transaction.description}
            </Text>
          </View>
          {!transaction.is_voided && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() =>
                router.push(
                  `/finances/transaction/edit?id=${transaction.id}` as any
                )
              }
              activeOpacity={0.85}
            >
              <Feather name="edit-2" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}
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

        <View
          style={[
            styles.heroCard,
            transaction.is_voided && styles.heroCardVoided,
          ]}
        >
          <View style={styles.heroTop}>
            <View
              style={[
                styles.heroIcon,
                {
                  backgroundColor: isIncome
                    ? "rgba(34,197,94,0.14)"
                    : "rgba(248,113,113,0.14)",
                },
              ]}
            >
              <Feather
                name={isIncome ? "arrow-down-left" : "arrow-up-right"}
                size={23}
                color={accent}
              />
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>
                {transaction.is_voided
                  ? "CANCELADO"
                  : isIncome
                  ? "INGRESO"
                  : "GASTO"}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.amount,
              { color: accent },
              transaction.is_voided && styles.textVoided,
            ]}
          >
            {isIncome ? "+" : "−"}
            {formatMoney(transaction.amount, currency)}
          </Text>
          <Text style={styles.heroDate}>
            Fecha del movimiento: {formatDate(transaction.transaction_date)}
          </Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.sectionTitle}>Clasificación</Text>
          <DetailRow
            icon="tag"
            label="Categoría"
            value={transaction.category}
          />
          <DetailRow
            icon={transaction.account_type === "cash" ? "dollar-sign" : "credit-card"}
            label="Cuenta"
            value={transaction.account_name}
          />
          <DetailRow
            icon="briefcase"
            label={isIncome ? "Cliente u origen" : "Proveedor o beneficiario"}
            value={transaction.counterparty || "No registrado"}
          />
          <DetailRow
            icon="hash"
            label="Referencia"
            value={transaction.reference || "No registrada"}
          />
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.sectionTitle}>Registro</Text>
          <DetailRow
            icon="clock"
            label="Creado"
            value={formatDate(transaction.created_at, true)}
          />
          {transaction.updated_at &&
            transaction.updated_at !== transaction.created_at && (
              <DetailRow
                icon="edit-3"
                label="Última corrección"
                value={formatDate(transaction.updated_at, true)}
              />
            )}
          {transaction.is_voided && (
            <DetailRow
              icon="x-circle"
              label="Cancelado"
              value={formatDate(transaction.voided_at, true)}
            />
          )}
        </View>

        {transaction.notes && (
          <View style={styles.notesCard}>
            <Text style={styles.sectionTitle}>Notas</Text>
            <Text style={styles.notesText}>{transaction.notes}</Text>
          </View>
        )}

        {!transaction.is_voided && (
          <View style={styles.actionsCard}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() =>
                router.push(
                  `/finances/transaction/edit?id=${transaction.id}` as any
                )
              }
              activeOpacity={0.85}
            >
              <Feather name="edit-2" size={18} color="#FFFFFF" />
              <Text style={styles.editButtonText}>Editar movimiento</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.voidButton,
                isVoiding && styles.buttonDisabled,
              ]}
              onPress={handleVoid}
              disabled={isVoiding}
              activeOpacity={0.85}
            >
              {isVoiding ? (
                <ActivityIndicator color="#FCA5A5" />
              ) : (
                <>
                  <Feather name="x-circle" size={18} color="#FCA5A5" />
                  <Text style={styles.voidButtonText}>Cancelar movimiento</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Feather name={icon} size={16} color="#0b9387" />
      </View>
      <View style={styles.detailInfo}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  loadingText: { color: "#94A3B8", fontSize: 15, fontWeight: "600" },
  notFoundContainer: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  notFoundTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 14,
  },
  notFoundText: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 13,
    marginBottom: 23,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  kicker: {
    color: "#0b9387",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
  },
  errorAlertText: { color: "#FCA5A5", fontSize: 13, lineHeight: 19, flex: 1 },
  successAlert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(34,197,94,0.09)",
    borderWidth: 1,
    borderColor: "rgba(134,239,172,0.24)",
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
  },
  successAlertText: { color: "#BBF7D0", fontSize: 13, lineHeight: 19, flex: 1 },
  heroCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 24,
    padding: 19,
    marginBottom: 15,
  },
  heroCardVoided: { opacity: 0.68 },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadge: {
    backgroundColor: "#0F172A",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroBadgeText: { color: "#CBD5E1", fontSize: 10, fontWeight: "900" },
  amount: { fontSize: 35, fontWeight: "900", letterSpacing: -1 },
  heroDate: { color: "#94A3B8", fontSize: 12, marginTop: 7 },
  textVoided: { textDecorationLine: "line-through" },
  detailCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 20,
    padding: 16,
    marginBottom: 13,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 9,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(51,65,85,0.7)",
  },
  detailIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(11,147,135,0.13)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailInfo: { flex: 1 },
  detailLabel: { color: "#64748B", fontSize: 10, fontWeight: "800" },
  detailValue: { color: "#E2E8F0", fontSize: 13, fontWeight: "800", marginTop: 3 },
  notesCard: {
    backgroundColor: "rgba(11,147,135,0.08)",
    borderWidth: 1,
    borderColor: "rgba(11,147,135,0.22)",
    borderRadius: 20,
    padding: 16,
    marginBottom: 13,
  },
  notesText: { color: "#CBD5E1", fontSize: 13, lineHeight: 20 },
  actionsCard: { gap: 10, marginTop: 5 },
  editButton: {
    minHeight: 53,
    borderRadius: 16,
    backgroundColor: "#0b9387",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  editButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  voidButton: {
    minHeight: 53,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.36)",
    backgroundColor: "rgba(239,68,68,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  voidButtonText: { color: "#FCA5A5", fontSize: 14, fontWeight: "900" },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  buttonDisabled: { opacity: 0.5 },
});
