import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  BusinessTransaction,
  BusinessTransactionType,
  listBusinessTransactions,
} from "../../lib/business-transactions";
import { getCurrentWorkspace, Workspace } from "../../lib/workspaces";

type TransactionFilter = "all" | BusinessTransactionType | "voided";

const FILTERS: { value: TransactionFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "income", label: "Ingresos" },
  { value: "expense", label: "Gastos" },
  { value: "voided", label: "Cancelados" },
];

function formatMoney(amount: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getCurrentMonthPrefix() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

export default function BusinessTransactionsScreen() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [selectedFilter, setSelectedFilter] =
    useState<TransactionFilter>("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const currency = workspace?.currency || "MXN";

  const loadTransactions = useCallback(async () => {
    setGlobalError(null);
    try {
      const currentWorkspace = await getCurrentWorkspace();
      if (!currentWorkspace) {
        router.replace("/dashboard/onboarding");
        return;
      }

      setWorkspace(currentWorkspace);
      if (currentWorkspace.workspace_type !== "business") {
        setTransactions([]);
        return;
      }

      const data = await listBusinessTransactions(currentWorkspace.id);
      setTransactions(data);
    } catch (error: any) {
      setGlobalError(
        error.message || "No pudimos cargar los movimientos del negocio."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const monthlySummary = useMemo(() => {
    const monthPrefix = getCurrentMonthPrefix();
    return transactions.reduce(
      (summary, transaction) => {
        if (
          transaction.is_voided ||
          !transaction.transaction_date.startsWith(monthPrefix)
        ) {
          return summary;
        }

        if (transaction.transaction_type === "income") {
          summary.income += transaction.amount;
        } else {
          summary.expense += transaction.amount;
        }
        return summary;
      },
      { income: 0, expense: 0 }
    );
  }, [transactions]);

  const visibleTransactions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");

    return transactions.filter((transaction) => {
      const matchesFilter =
        selectedFilter === "all"
          ? !transaction.is_voided
          : selectedFilter === "voided"
          ? transaction.is_voided
          : !transaction.is_voided &&
            transaction.transaction_type === selectedFilter;

      if (!matchesFilter) return false;
      if (!normalizedSearch) return true;

      return [
        transaction.description,
        transaction.category,
        transaction.counterparty,
        transaction.reference,
        transaction.account_name,
      ].some((value) =>
        value?.toLocaleLowerCase("es").includes(normalizedSearch)
      );
    });
  }, [search, selectedFilter, transactions]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#0b9387" size="large" />
          <Text style={styles.loadingText}>Cargando movimientos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (workspace?.workspace_type !== "business") {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.restrictedContainer}>
          <View style={styles.restrictedIcon}>
            <Feather name="briefcase" size={24} color="#0b9387" />
          </View>
          <Text style={styles.restrictedTitle}>Movimientos de empresa</Text>
          <Text style={styles.restrictedText}>
            El registro manual detallado de ingresos y gastos solo se muestra en
            workspaces de empresa.
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace("/dashboard/dashboard")}
          >
            <Text style={styles.secondaryButtonText}>Volver al dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              loadTransactions();
            }}
            tintColor="#0b9387"
          />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Feather name="arrow-left" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>CONTROL OPERATIVO</Text>
            <Text style={styles.title}>Ingresos y gastos</Text>
            <Text style={styles.subtitle}>{workspace.name}</Text>
          </View>
        </View>

        {globalError && (
          <View style={styles.errorAlert}>
            <Feather name="alert-triangle" size={18} color="#FCA5A5" />
            <Text style={styles.errorAlertText}>{globalError}</Text>
          </View>
        )}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryKicker}>MES ACTUAL</Text>
          <View style={styles.summaryGrid}>
            <SummaryMetric
              label="Ingresos"
              value={formatMoney(monthlySummary.income, currency)}
              icon="arrow-down-left"
              color="#86EFAC"
            />
            <SummaryMetric
              label="Gastos"
              value={formatMoney(monthlySummary.expense, currency)}
              icon="arrow-up-right"
              color="#FCA5A5"
            />
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>Flujo neto registrado</Text>
            <Text
              style={[
                styles.netValue,
                monthlySummary.income - monthlySummary.expense >= 0
                  ? styles.positiveText
                  : styles.negativeText,
              ]}
            >
              {formatMoney(
                monthlySummary.income - monthlySummary.expense,
                currency
              )}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.incomeButton]}
            onPress={() =>
              router.push("/finances/transaction/new?type=income" as any)
            }
            activeOpacity={0.85}
          >
            <Feather name="plus" size={18} color="#052E16" />
            <Text style={styles.incomeButtonText}>Registrar ingreso</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.expenseButton]}
            onPress={() =>
              router.push("/finances/transaction/new?type=expense" as any)
            }
            activeOpacity={0.85}
          >
            <Feather name="minus" size={18} color="#450A0A" />
            <Text style={styles.expenseButtonText}>Registrar gasto</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <Feather name="search" size={17} color="#64748B" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar concepto, categoría, cuenta..."
            placeholderTextColor="#64748B"
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={17} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
        >
          <View style={styles.filterRow}>
            {FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter.value}
                style={[
                  styles.filterChip,
                  selectedFilter === filter.value && styles.filterChipActive,
                ]}
                onPress={() => setSelectedFilter(filter.value)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedFilter === filter.value &&
                      styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Movimientos</Text>
          <Text style={styles.listCount}>
            {visibleTransactions.length} resultado
            {visibleTransactions.length === 1 ? "" : "s"}
          </Text>
        </View>

        {visibleTransactions.length > 0 ? (
          <View style={styles.transactionList}>
            {visibleTransactions.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                currency={currency}
                onPress={() =>
                  router.push(
                    `/finances/transaction/${transaction.id}` as any
                  )
                }
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="file-text" size={22} color="#0b9387" />
            </View>
            <Text style={styles.emptyTitle}>Sin movimientos en esta vista</Text>
            <Text style={styles.emptyText}>
              Registra un ingreso o gasto, o cambia los filtros de búsqueda.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryMetric({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.summaryMetric}>
      <View style={styles.summaryMetricTop}>
        <Feather name={icon} size={15} color={color} />
        <Text style={styles.summaryMetricLabel}>{label}</Text>
      </View>
      <Text style={[styles.summaryMetricValue, { color }]}>{value}</Text>
    </View>
  );
}

function TransactionCard({
  transaction,
  currency,
  onPress,
}: {
  transaction: BusinessTransaction;
  currency: string;
  onPress: () => void;
}) {
  const isIncome = transaction.transaction_type === "income";
  const accent = isIncome ? "#86EFAC" : "#FCA5A5";

  return (
    <TouchableOpacity
      style={[
        styles.transactionCard,
        transaction.is_voided && styles.transactionCardVoided,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.transactionIcon,
          {
            backgroundColor: isIncome
              ? "rgba(34,197,94,0.12)"
              : "rgba(248,113,113,0.12)",
          },
        ]}
      >
        <Feather
          name={isIncome ? "arrow-down-left" : "arrow-up-right"}
          size={18}
          color={accent}
        />
      </View>
      <View style={styles.transactionInfo}>
        <View style={styles.transactionTitleRow}>
          <Text
            style={[
              styles.transactionTitle,
              transaction.is_voided && styles.textVoided,
            ]}
            numberOfLines={1}
          >
            {transaction.description}
          </Text>
          {transaction.is_voided && (
            <View style={styles.voidBadge}>
              <Text style={styles.voidBadgeText}>Cancelado</Text>
            </View>
          )}
        </View>
        <Text style={styles.transactionMeta} numberOfLines={1}>
          {formatDate(transaction.transaction_date)} · {transaction.category}
        </Text>
        <Text style={styles.transactionAccount} numberOfLines={1}>
          {transaction.account_name}
          {transaction.counterparty ? ` · ${transaction.counterparty}` : ""}
        </Text>
      </View>
      <View style={styles.transactionAmountBlock}>
        <Text
          style={[
            styles.transactionAmount,
            { color: accent },
            transaction.is_voided && styles.textVoided,
          ]}
        >
          {isIncome ? "+" : "−"}
          {formatMoney(transaction.amount, currency)}
        </Text>
        <Feather name="chevron-right" size={17} color="#64748B" />
      </View>
    </TouchableOpacity>
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
  restrictedContainer: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  restrictedIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  restrictedTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 10,
  },
  restrictedText: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 24,
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
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  subtitle: { color: "#94A3B8", fontSize: 13, marginTop: 4 },
  errorAlert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    borderRadius: 16,
    padding: 15,
    marginBottom: 18,
  },
  errorAlertText: {
    color: "#FCA5A5",
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  summaryCard: {
    backgroundColor: "#0b9387",
    borderRadius: 24,
    padding: 19,
    marginBottom: 14,
  },
  summaryKicker: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 13,
  },
  summaryGrid: { flexDirection: "row", gap: 10 },
  summaryMetric: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.22)",
    borderRadius: 16,
    padding: 13,
  },
  summaryMetricTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  summaryMetricLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontWeight: "800",
  },
  summaryMetricValue: { fontSize: 17, fontWeight: "900" },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginVertical: 15,
  },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  netLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  netValue: { fontSize: 18, fontWeight: "900" },
  positiveText: { color: "#D1FAE5" },
  negativeText: { color: "#FECACA" },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  actionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
  },
  incomeButton: { backgroundColor: "#86EFAC" },
  expenseButton: { backgroundColor: "#FCA5A5" },
  incomeButtonText: { color: "#052E16", fontSize: 12, fontWeight: "900" },
  expenseButtonText: { color: "#450A0A", fontSize: 12, fontWeight: "900" },
  searchContainer: {
    minHeight: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    marginBottom: 13,
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14 },
  filterScroll: { marginBottom: 23 },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  filterChipActive: {
    borderColor: "#0b9387",
    backgroundColor: "rgba(11,147,135,0.16)",
  },
  filterChipText: { color: "#94A3B8", fontSize: 12, fontWeight: "800" },
  filterChipTextActive: { color: "#FFFFFF" },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  listTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "900" },
  listCount: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  transactionList: { gap: 10 },
  transactionCard: {
    minHeight: 88,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  transactionCardVoided: { opacity: 0.58 },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  transactionInfo: { flex: 1, minWidth: 0 },
  transactionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  transactionTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 1,
  },
  transactionMeta: { color: "#94A3B8", fontSize: 11, marginTop: 4 },
  transactionAccount: { color: "#64748B", fontSize: 10, marginTop: 3 },
  transactionAmountBlock: { alignItems: "flex-end", gap: 7 },
  transactionAmount: { fontSize: 13, fontWeight: "900" },
  textVoided: { textDecorationLine: "line-through" },
  voidBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.16)",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  voidBadgeText: { color: "#CBD5E1", fontSize: 8, fontWeight: "900" },
  emptyState: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    padding: 24,
    alignItems: "center",
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  emptyText: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },
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
});
