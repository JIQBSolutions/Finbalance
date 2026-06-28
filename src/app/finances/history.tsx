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

type Account = {
  id: string;
  name: string;
  account_type: AccountType;
  include_in_checkin: boolean;
};

type CheckInType = "initial" | "operational" | "manual_update";

type CheckIn = {
  id: string;
  workspace_id: string;
  check_in_type: CheckInType;
  check_in_date: string;
  notes: string | null;
  created_at: string;
};

type AccountSnapshot = {
  id: string;
  check_in_id: string;
  workspace_id: string;
  account_id: string;
  balance: number;
  created_at: string;
};

type SnapshotDetail = {
  id: string;
  account_id: string;
  account_name: string;
  account_type: AccountType;
  balance: number;
};

type HistoryItem = {
  id: string;
  check_in_type: CheckInType;
  check_in_date: string;
  created_at: string;
  notes: string | null;
  available: number;
  investments: number;
  debt: number;
  netWorth: number;
  snapshots_count: number;
  difference: number | null;
  snapshots: SnapshotDetail[];
};

type FilterType = "all" | CheckInType;

const FILTERS: { value: FilterType; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "operational", label: "Operativos" },
  { value: "initial", label: "Inicial" },
  { value: "manual_update", label: "Manuales" },
];

function formatMoney(amount: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatDate(dateString?: string) {
  if (!dateString) return "Sin fecha";

  const normalizedDate =
    dateString.length <= 10 ? `${dateString}T00:00:00` : dateString;

  const date = new Date(normalizedDate);

  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getRelativeDateLabel(dateString?: string) {
  if (!dateString) return "Sin fecha";

  const normalizedDate =
    dateString.length <= 10 ? `${dateString}T00:00:00` : dateString;

  const date = new Date(normalizedDate);

  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  const diffInDays = Math.round(
    (today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffInDays === 0) return "Hoy";
  if (diffInDays === 1) return "Ayer";
  if (diffInDays > 1) return `Hace ${diffInDays} días`;

  return "Fecha futura";
}

function getCheckInTypeLabel(type: CheckInType) {
  const labels = {
    initial: "Inicial",
    operational: "Operativo",
    manual_update: "Actualización manual",
  };

  return labels[type];
}

function getCheckInIcon(type: CheckInType): keyof typeof Feather.glyphMap {
  const icons = {
    initial: "flag",
    operational: "refresh-cw",
    manual_update: "edit-3",
  } as const;

  return icons[type];
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

function getDifferenceLabel(value: number | null, currency: string) {
  if (value === null) return "Primer registro";

  if (value === 0) return "Sin cambio";

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMoney(value, currency)}`;
}

export default function HistoryScreen() {
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const [selectedFilter, setSelectedFilter] = useState<FilterType>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const currency = workspace?.currency || "MXN";

  const filteredHistory = useMemo(() => {
    if (selectedFilter === "all") return historyItems;

    return historyItems.filter(
      (item) => item.check_in_type === selectedFilter
    );
  }, [historyItems, selectedFilter]);

  const summary = useMemo(() => {
    const latest = historyItems[0] || null;
    const oldest = historyItems[historyItems.length - 1] || null;

    const currentAvailable = latest?.available || 0;
    const initialAvailable = oldest?.available || 0;
    const totalChange =
      latest && oldest ? currentAvailable - initialAvailable : 0;

    return {
      totalCheckIns: historyItems.length,
      currentAvailable,
      totalChange,
      lastCheckInDate: latest?.check_in_date,
      latestNetWorth: latest?.netWorth || 0,
    };
  }, [historyItems]);

  const buildHistoryItems = (
    checkIns: CheckIn[],
    snapshots: AccountSnapshot[],
    accounts: Account[]
  ) => {
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    const snapshotsByCheckIn = snapshots.reduce<Record<string, AccountSnapshot[]>>(
      (acc, snapshot) => {
        if (!acc[snapshot.check_in_id]) {
          acc[snapshot.check_in_id] = [];
        }

        acc[snapshot.check_in_id].push(snapshot);
        return acc;
      },
      {}
    );

    const chronological = [...checkIns].sort((a, b) => {
      const dateA = new Date(`${a.check_in_date}T00:00:00`).getTime();
      const dateB = new Date(`${b.check_in_date}T00:00:00`).getTime();

      if (dateA !== dateB) return dateA - dateB;

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    let previousAvailable: number | null = null;

    const withDifferences = chronological.map((checkIn) => {
      const checkInSnapshots = snapshotsByCheckIn[checkIn.id] || [];

      const details: SnapshotDetail[] = checkInSnapshots.map((snapshot) => {
        const account = accountById.get(snapshot.account_id);

        return {
          id: snapshot.id,
          account_id: snapshot.account_id,
          account_name: account?.name || "Cuenta eliminada",
          account_type: account?.account_type || "bank",
          balance: Number(snapshot.balance || 0),
        };
      });

      const totals = details.reduce(
        (acc, snapshot) => {
          if (
            snapshot.account_type === "bank" ||
            snapshot.account_type === "cash"
          ) {
            acc.available += snapshot.balance;
          }

          if (snapshot.account_type === "investment") {
            acc.investments += snapshot.balance;
          }

          if (snapshot.account_type === "credit") {
            acc.debt += snapshot.balance;
          }

          return acc;
        },
        {
          available: 0,
          investments: 0,
          debt: 0,
        }
      );

      const difference =
        previousAvailable === null
          ? null
          : totals.available - previousAvailable;

      previousAvailable = totals.available;

      return {
        id: checkIn.id,
        check_in_type: checkIn.check_in_type,
        check_in_date: checkIn.check_in_date,
        created_at: checkIn.created_at,
        notes: checkIn.notes,
        available: totals.available,
        investments: totals.investments,
        debt: totals.debt,
        netWorth: totals.available + totals.investments - totals.debt,
        snapshots_count: details.length,
        difference,
        snapshots: details.sort((a, b) => {
          const order: Record<AccountType, number> = {
            bank: 1,
            cash: 2,
            investment: 3,
            credit: 4,
          };

          return order[a.account_type] - order[b.account_type];
        }),
      };
    });

    return withDifferences.reverse();
  };

  const loadHistory = useCallback(async () => {
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

      const { data: accountsData, error: accountsError } = await supabase
        .from("accounts")
        .select("id, name, account_type, include_in_checkin")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: true });

      if (accountsError) {
        throw new Error(accountsError.message);
      }

      const { data: checkInsData, error: checkInsError } = await supabase
        .from("check_ins")
        .select("id, workspace_id, check_in_type, check_in_date, notes, created_at")
        .eq("workspace_id", currentWorkspace.id)
        .order("check_in_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (checkInsError) {
        throw new Error(checkInsError.message);
      }

      const checkIns = (checkInsData || []) as CheckIn[];

      if (checkIns.length === 0) {
        setHistoryItems([]);
        return;
      }

      const checkInIds = checkIns.map((checkIn) => checkIn.id);

      const { data: snapshotsData, error: snapshotsError } = await supabase
        .from("account_snapshots")
        .select("id, check_in_id, workspace_id, account_id, balance, created_at")
        .eq("workspace_id", currentWorkspace.id)
        .in("check_in_id", checkInIds);

      if (snapshotsError) {
        throw new Error(snapshotsError.message);
      }

      const builtHistory = buildHistoryItems(
        checkIns,
        (snapshotsData || []) as AccountSnapshot[],
        (accountsData || []) as Account[]
      );

      setHistoryItems(builtHistory);
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos cargar tu historial.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadHistory();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#0b9387" size="large" />
          <Text style={styles.loadingText}>Cargando historial...</Text>
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
            activeOpacity={0.85}
          >
            <Feather name="x" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.kicker}>Historial financiero</Text>
          <Text style={styles.title}>Tu evolución por check-ins</Text>
          <Text style={styles.subtitle}>
            Revisa cómo ha cambiado tu dinero disponible cada vez que
            actualizaste tus saldos.
          </Text>
        </View>

        {globalError && (
          <View style={styles.errorAlert}>
            <Feather name="alert-triangle" size={18} color="#FCA5A5" />
            <Text style={styles.errorAlertText}>{globalError}</Text>
          </View>
        )}

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryLabel}>Disponible actual</Text>
              <Text style={styles.summaryAmount}>
                {formatMoney(summary.currentAvailable, currency)}
              </Text>
            </View>

            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>
                {summary.totalCheckIns} check-in
                {summary.totalCheckIns === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryGrid}>
            <SummaryMiniCard
              label="Cambio desde inicio"
              value={getDifferenceLabel(summary.totalChange, currency)}
              positive={summary.totalChange >= 0}
            />

            <SummaryMiniCard
              label="Balance neto reciente"
              value={formatMoney(summary.latestNetWorth, currency)}
              positive={summary.latestNetWorth >= 0}
            />

            <SummaryMiniCard
              label="Último registro"
              value={getRelativeDateLabel(summary.lastCheckInDate)}
              positive
            />
          </View>
        </View>

        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Registros</Text>
            <Text style={styles.sectionHint}>
              {filteredHistory.length} resultado
              {filteredHistory.length === 1 ? "" : "s"} en este filtro.
            </Text>
          </View>

          {filteredHistory.length > 0 ? (
            filteredHistory.map((item) => (
              <CheckInCard
                key={item.id}
                item={item}
                currency={currency}
                expanded={expandedId === item.id}
                onToggle={() =>
                  setExpandedId((current) =>
                    current === item.id ? null : item.id
                  )
                }
              />
            ))
          ) : (
            <EmptyState text="Aún no hay check-ins para mostrar en este filtro." />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryMiniCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <View style={styles.summaryMiniCard}>
      <Text style={styles.summaryMiniLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryMiniValue,
          positive ? styles.positiveText : styles.negativeText,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function CheckInCard({
  item,
  currency,
  expanded,
  onToggle,
}: {
  item: HistoryItem;
  currency: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isPositive = item.difference === null || item.difference >= 0;

  return (
    <View style={styles.checkInCard}>
      <TouchableOpacity
        style={styles.checkInTop}
        onPress={onToggle}
        activeOpacity={0.85}
      >
        <View style={styles.checkInLeft}>
          <View style={styles.checkInIcon}>
            <Feather
              name={getCheckInIcon(item.check_in_type)}
              size={18}
              color="#0b9387"
            />
          </View>

          <View style={styles.checkInInfo}>
            <Text style={styles.checkInTitle}>
              Check-In {getCheckInTypeLabel(item.check_in_type)}
            </Text>
            <Text style={styles.checkInDate}>
              {formatDate(item.check_in_date)} ·{" "}
              {getRelativeDateLabel(item.check_in_date)}
            </Text>
          </View>
        </View>

        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color="#94A3B8"
        />
      </TouchableOpacity>

      <View style={styles.checkInMetrics}>
        <View>
          <Text style={styles.metricLabel}>Disponible</Text>
          <Text style={styles.metricValue}>
            {formatMoney(item.available, currency)}
          </Text>
        </View>

        <View style={styles.metricRight}>
          <Text style={styles.metricLabel}>Cambio</Text>
          <Text
            style={[
              styles.metricValue,
              isPositive ? styles.positiveText : styles.negativeText,
            ]}
          >
            {getDifferenceLabel(item.difference, currency)}
          </Text>
        </View>
      </View>

      <View style={styles.checkInFooter}>
        <Text style={styles.checkInFooterText}>
          {item.snapshots_count} cuenta
          {item.snapshots_count === 1 ? "" : "s"} actualizada
          {item.snapshots_count === 1 ? "" : "s"}
        </Text>

        <Text style={styles.checkInFooterText}>
          Neto: {formatMoney(item.netWorth, currency)}
        </Text>
      </View>

      {expanded && (
        <View style={styles.expandedContent}>
          <View style={styles.expandedDivider} />

          <View style={styles.expandedSummaryRow}>
            <ExpandedStat
              label="Inversiones"
              value={formatMoney(item.investments, currency)}
            />

            <ExpandedStat
              label="Deudas"
              value={formatMoney(item.debt, currency)}
            />
          </View>

          {item.notes && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Notas</Text>
              <Text style={styles.notesText}>{item.notes}</Text>
            </View>
          )}

          <Text style={styles.snapshotTitle}>Detalle de cuentas</Text>

          {item.snapshots.length > 0 ? (
            item.snapshots.map((snapshot) => (
              <SnapshotRow
                key={snapshot.id}
                snapshot={snapshot}
                currency={currency}
              />
            ))
          ) : (
            <EmptyState text="Este check-in no tiene snapshots registrados." />
          )}
        </View>
      )}
    </View>
  );
}

function ExpandedStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.expandedStat}>
      <Text style={styles.expandedStatLabel}>{label}</Text>
      <Text style={styles.expandedStatValue}>{value}</Text>
    </View>
  );
}

function SnapshotRow({
  snapshot,
  currency,
}: {
  snapshot: SnapshotDetail;
  currency: string;
}) {
  return (
    <View style={styles.snapshotRow}>
      <View style={styles.snapshotLeft}>
        <View style={styles.snapshotIcon}>
          <Feather
            name={getAccountIcon(snapshot.account_type)}
            size={16}
            color="#0b9387"
          />
        </View>

        <View style={styles.snapshotInfo}>
          <Text style={styles.snapshotName}>{snapshot.account_name}</Text>
          <Text style={styles.snapshotType}>
            {getAccountTypeLabel(snapshot.account_type)}
          </Text>
        </View>
      </View>

      <Text style={styles.snapshotBalance}>
        {formatMoney(snapshot.balance, currency)}
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

  summaryCard: {
    backgroundColor: "#0b9387",
    borderRadius: 28,
    padding: 22,
    marginBottom: 20,
  },

  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  summaryLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },

  summaryAmount: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
  },

  summaryBadge: {
    backgroundColor: "rgba(15,23,42,0.2)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  summaryBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginVertical: 18,
  },

  summaryGrid: {
    gap: 10,
  },

  summaryMiniCard: {
    backgroundColor: "rgba(15,23,42,0.18)",
    borderRadius: 16,
    padding: 14,
  },

  summaryMiniLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 5,
  },

  summaryMiniValue: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },

  positiveText: {
    color: "#86EFAC",
  },

  negativeText: {
    color: "#FCA5A5",
  },

  filterSection: {
    marginBottom: 26,
  },

  filterRow: {
    flexDirection: "row",
    gap: 10,
  },

  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },

  filterChipActive: {
    backgroundColor: "rgba(11,147,135,0.16)",
    borderColor: "#0b9387",
  },

  filterChipText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "800",
  },

  filterChipTextActive: {
    color: "#FFFFFF",
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

  checkInCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
  },

  checkInTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },

  checkInLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  checkInIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },

  checkInInfo: {
    flex: 1,
  },

  checkInTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  checkInDate: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 3,
    fontWeight: "600",
  },

  checkInMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },

  metricLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
  },

  metricValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  metricRight: {
    alignItems: "flex-end",
  },

  checkInFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  checkInFooterText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },

  expandedContent: {
    marginTop: 14,
  },

  expandedDivider: {
    height: 1,
    backgroundColor: "#334155",
    marginBottom: 14,
  },

  expandedSummaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },

  expandedStat: {
    flex: 1,
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 12,
  },

  expandedStatLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
  },

  expandedStatValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  notesBox: {
    backgroundColor: "rgba(11,147,135,0.08)",
    borderWidth: 1,
    borderColor: "rgba(11,147,135,0.22)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },

  notesLabel: {
    color: "#0b9387",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 4,
  },

  notesText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
  },

  snapshotTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 10,
  },

  snapshotRow: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  snapshotLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  snapshotIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },

  snapshotInfo: {
    flex: 1,
  },

  snapshotName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  snapshotType: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 3,
  },

  snapshotBalance: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
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