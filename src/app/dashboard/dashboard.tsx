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

type AccountBalance = {
  account_id: string;
  account_name?: string;
  name?: string;
  account_type: AccountType;
  balance: number;
  currency?: string;
  created_at?: string;
  check_in_date?: string;
};

type CheckInType = "initial" | "operational" | "manual_update";

type LastCheckIn = {
  id: string;
  check_in_type: CheckInType;
  check_in_date: string;
  created_at: string;
  snapshots_count: number;
};

type DistributionItem = {
  key: string;
  label: string;
  value: number;
  color: string;
  description: string;
};

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
  if (!dateString) return "Sin check-ins todavía";

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

function getCheckInTypeLabel(type?: CheckInType) {
  const labels = {
    initial: "Inicial",
    operational: "Operativo",
    manual_update: "Actualización manual",
  };

  if (!type) return "Sin check-in";

  return labels[type];
}

export default function DashboardScreen() {
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [lastCheckIn, setLastCheckIn] = useState<LastCheckIn | null>(null);

  const [firstName, setFirstName] = useState("Usuario");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

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

  const netWorth = totals.available + totals.investments - totals.debt;

  const registeredTotal = totals.available + totals.investments + totals.debt;

  const operationalAccounts = accounts.filter(
    (account) => account.account_type === "bank" || account.account_type === "cash"
  );

  const secondaryAccounts = accounts.filter(
    (account) =>
      account.account_type === "investment" || account.account_type === "credit"
  );

  const distributionItems: DistributionItem[] = useMemo(
    () => [
      {
        key: "available",
        label: "Disponible",
        value: totals.available,
        color: "#0b9387",
        description: "Banco + efectivo",
      },
      {
        key: "investments",
        label: "Inversiones",
        value: totals.investments,
        color: "#22C55E",
        description: "Ahorros e inversiones",
      },
      {
        key: "debt",
        label: "Deudas",
        value: totals.debt,
        color: "#EF4444",
        description: "Compromisos pendientes",
      },
    ],
    [totals.available, totals.investments, totals.debt]
  );

  const loadDashboard = useCallback(async () => {
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

      const fullName = user.user_metadata?.full_name as string | undefined;

      setFirstName(
        fullName?.trim()
          ? fullName.trim().split(" ")[0]
          : user.email?.split("@")[0] || "Usuario"
      );

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

      setAccounts((balances || []) as AccountBalance[]);

      const { data: checkIns, error: checkInsError } = await supabase
        .from("check_ins")
        .select("id, check_in_type, check_in_date, created_at")
        .eq("workspace_id", currentWorkspace.id)
        .order("check_in_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (checkInsError) {
        throw new Error(checkInsError.message);
      }

      const latestCheckIn = checkIns?.[0];

      if (!latestCheckIn) {
        setLastCheckIn(null);
        return;
      }

      const { count, error: snapshotsCountError } = await supabase
        .from("account_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("check_in_id", latestCheckIn.id);

      if (snapshotsCountError) {
        throw new Error(snapshotsCountError.message);
      }

      setLastCheckIn({
        id: latestCheckIn.id,
        check_in_type: latestCheckIn.check_in_type as CheckInType,
        check_in_date: latestCheckIn.check_in_date,
        created_at: latestCheckIn.created_at,
        snapshots_count: count || 0,
      });
    } catch (error: any) {
      setGlobalError(
        error.message || "No pudimos cargar la información del dashboard."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDashboard();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#0b9387" size="large" />
          <Text style={styles.loadingText}>Cargando Finbalance...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.scrollView}
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

          <View style={styles.userMenuContainer}>
            <TouchableOpacity
              style={styles.userMenuButton}
              onPress={() => setIsUserMenuOpen((prev) => !prev)}
              activeOpacity={0.85}
            >
              <Feather name="settings" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {isUserMenuOpen && (
              <View style={styles.userMenuDropdown}>
                <TouchableOpacity
                  style={styles.userMenuItem}
                  onPress={() => {
                    setIsUserMenuOpen(false);
                    router.push("/user_config/settings");
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.userMenuItemText}>Configuración</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.userMenuItem}
                  onPress={() => {
                    setIsUserMenuOpen(false);
                    router.push("/user_config/profile");
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.userMenuItemText}>Perfil</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.userMenuItem}
                  onPress={() => {
                    setIsUserMenuOpen(false);
                    handleLogout();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.userMenuItemDanger}>Cerrar sesión</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={styles.welcomeBlock}>
          <Text style={styles.greeting}>Bienvenido de nuevo, {firstName}</Text>

          <View style={styles.workspaceRow}>
            <Text style={styles.workspaceName}>
              {workspace?.name || "Mi workspace"}
            </Text>

            <View style={styles.workspaceBadge}>
              <Text style={styles.workspaceBadgeText}>
                {workspace?.workspace_type === "business" ? "Negocio" : "Personal"}
              </Text>
            </View>
          </View>
        </View>

        {globalError && (
          <View style={styles.errorAlert}>
            <Feather name="alert-triangle" size={18} color="#FCA5A5" />
            <Text style={styles.errorAlertText}>{globalError}</Text>
          </View>
        )}

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroLabel}>Dinero disponible</Text>
              <Text style={styles.heroAmount}>
                {formatMoney(totals.available, currency)}
              </Text>
            </View>
          </View>

          <Text style={styles.heroDescription}>
            Es el dinero operativo que tienes en banco y efectivo. No incluye
            inversiones ni deudas.
          </Text>

          <TouchableOpacity
            style={styles.checkInButton}
            onPress={() => router.push("/finances/check_in")}
            activeOpacity={0.85}
          >
            <Feather name="edit-3" size={18} color="#FFFFFF" />
            <Text style={styles.checkInButtonText}>Hacer Check-In</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.diagnosticGrid}>
          <DiagnosticCard
            label="Balance neto estimado"
            value={formatMoney(netWorth, currency)}
            description="Disponible + inversiones - deudas"
            icon="activity"
            accentColor={netWorth >= 0 ? "#22C55E" : "#EF4444"}
          />

          <DiagnosticCard
            label="Último Check-In"
            value={getRelativeDateLabel(lastCheckIn?.check_in_date)}
            description={
              lastCheckIn
                ? `${getCheckInTypeLabel(lastCheckIn.check_in_type)} · ${
                    lastCheckIn.snapshots_count
                  } cuenta${lastCheckIn.snapshots_count === 1 ? "" : "s"}`
                : "Aún no hay registros"
            }
            icon="clock"
            accentColor="#0b9387"
          />

          <DiagnosticCard
            label="Cuentas registradas"
            value={`${accounts.length}`}
            description={`${operationalAccounts.length} operativas · ${secondaryAccounts.length} secundarias`}
            icon="bar-chart-2"
            accentColor="#38BDF8"
          />
        </View>

        <View style={styles.metricsGrid}>
          <MetricCard
            label="Ahorros e inversiones"
            value={formatMoney(totals.investments, currency)}
            description="Capital separado del dinero operativo"
            icon="trending-up"
          />

          <MetricCard
            label="Deuda registrada"
            value={formatMoney(totals.debt, currency)}
            description="Monto pendiente por pagar"
            icon="alert-circle"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Distribución financiera</Text>
            <Text style={styles.sectionHint}>
              Cómo se reparte tu dinero registrado.
            </Text>
          </View>

          <View style={styles.distributionCard}>
            {registeredTotal > 0 ? (
              <>
                <DistributionBar
                  items={distributionItems}
                  total={registeredTotal}
                />

                <View style={styles.distributionLegend}>
                  {distributionItems.map((item) => (
                    <DistributionLegendRow
                      key={item.key}
                      item={item}
                      total={registeredTotal}
                      currency={currency}
                    />
                  ))}
                </View>
              </>
            ) : (
              <EmptyState text="Aún no hay saldos para mostrar una distribución." />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Acciones rápidas</Text>
            <Text style={styles.sectionHint}>Continúa actualizando tu balance.</Text>
          </View>

          <View style={styles.quickActionsGrid}>
            <QuickAction
              label="Check-In"
              icon="edit-3"
              primary
              onPress={() => router.push("/finances/check_in")}
            />

            <QuickAction
              label="Nueva cuenta"
              icon="plus-circle"
              onPress={() => router.push("/finances/accounts")}
            />

            <QuickAction
              label="Metas"
              icon="target"
              onPress={() => router.push("/finances/goals")}
            />

            <QuickAction
             label="Historial"
              icon="calendar"
              onPress={() => router.push("/finances/history")}
              />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Cuentas operativas</Text>
            <Text style={styles.sectionHint}>Banco + efectivo</Text>
          </View>

          {operationalAccounts.length > 0 ? (
            operationalAccounts.map((account) => (
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

          {secondaryAccounts.length > 0 ? (
            secondaryAccounts.map((account) => (
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

        {lastCheckIn && (
          <View style={styles.lastUpdateCard}>
            <Feather name="refresh-cw" size={18} color="#0b9387" />
            <View style={styles.lastUpdateTextBlock}>
              <Text style={styles.lastUpdateTitle}>
                Última actualización: {formatDate(lastCheckIn.check_in_date)}
              </Text>
              <Text style={styles.lastUpdateDescription}>
                Tu dashboard usa los saldos más recientes registrados en
                snapshots.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DiagnosticCard({
  label,
  value,
  description,
  icon,
  accentColor,
}: {
  label: string;
  value: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
  accentColor: string;
}) {
  return (
    <View style={[styles.diagnosticCard, { borderLeftColor: accentColor }]}>
      <View style={styles.diagnosticHeader}>
        <View style={styles.diagnosticIcon}>
          <Feather name={icon} size={17} color={accentColor} />
        </View>
      </View>

      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={styles.diagnosticValue}>{value}</Text>
      <Text style={styles.diagnosticDescription}>{description}</Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>
        <Feather name={icon} size={18} color="#0b9387" />
      </View>

      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDescription}>{description}</Text>
    </View>
  );
}

function DistributionBar({
  items,
  total,
}: {
  items: DistributionItem[];
  total: number;
}) {
  const visibleItems = items.filter((item) => item.value > 0);

  return (
    <View style={styles.distributionTrack}>
      {visibleItems.map((item) => (
        <View
          key={item.key}
          style={[
            styles.distributionSegment,
            {
              flex: item.value / total,
              backgroundColor: item.color,
            },
          ]}
        />
      ))}
    </View>
  );
}

function DistributionLegendRow({
  item,
  total,
  currency,
}: {
  item: DistributionItem;
  total: number;
  currency: string;
}) {
  if (item.value <= 0) return null;

  const percentage = total > 0 ? (item.value / total) * 100 : 0;

  return (
    <View style={styles.legendRow}>
      <View style={styles.legendLeft}>
        <View style={[styles.legendDot, { backgroundColor: item.color }]} />

        <View>
          <Text style={styles.legendLabel}>{item.label}</Text>
          <Text style={styles.legendDescription}>{item.description}</Text>
        </View>
      </View>

      <View style={styles.legendRight}>
        <Text style={styles.legendValue}>{formatMoney(item.value, currency)}</Text>
        <Text style={styles.legendPercentage}>{percentage.toFixed(0)}%</Text>
      </View>
    </View>
  );
}

function QuickAction({
  label,
  icon,
  onPress,
  primary = false,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.quickActionButton, primary && styles.quickActionPrimary]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Feather name={icon} size={19} color={primary ? "#FFFFFF" : "#0b9387"} />
      <Text
        style={[
          styles.quickActionText,
          primary && styles.quickActionTextPrimary,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
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

  scrollView: {
    flex: 1,
    overflow: "visible",
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
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
    overflow: "visible",
    position: "relative",
    zIndex: 20,
    elevation: 20,
  },

  userMenuContainer: {
    position: "relative",
    zIndex: 20,
    elevation: 20,
    overflow: "visible",
  },

  userMenuButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    marginRight: 8,
  },

  userMenuDropdown: {
    position: "absolute",
    top: 52,
    right: 0,
    width: 190,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 18,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 22,
    zIndex: 22,
  },

  userMenuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },

  userMenuItemText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  userMenuItemDanger: {
    color: "#FCA5A5",
    fontSize: 14,
    fontWeight: "700",
  },

  welcomeBlock: {
    marginBottom: 22,
  },

  greeting: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },

  workspaceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },

  workspaceName: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },

  workspaceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(11,147,135,0.14)",
    borderWidth: 1,
    borderColor: "rgba(11,147,135,0.35)",
  },

  workspaceBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
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

  heroCard: {
    backgroundColor: "#0b9387",
    borderRadius: 30,
    padding: 24,
    marginBottom: 18,
    shadowColor: "#0b9387",
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },

  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  heroLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
  },

  heroAmount: {
    color: "#FFFFFF",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1.3,
  },

  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: "rgba(15,23,42,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  heroDescription: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 22,
  },

  checkInButton: {
    backgroundColor: "rgba(15,23,42,0.22)",
    minHeight: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  checkInButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  diagnosticGrid: {
    gap: 12,
    marginBottom: 18,
  },

  diagnosticCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderLeftWidth: 4,
    borderRadius: 20,
    padding: 16,
  },

  diagnosticHeader: {
    marginBottom: 10,
  },

  diagnosticIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },

  diagnosticLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 5,
  },

  diagnosticValue: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 5,
  },

  diagnosticDescription: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },

  metricsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },

  metricCard: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 20,
    padding: 16,
  },

  metricIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  metricLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },

  metricValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6,
  },

  metricDescription: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
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

  distributionCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 22,
    padding: 16,
  },

  distributionTrack: {
    height: 18,
    borderRadius: 999,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    overflow: "hidden",
    marginBottom: 18,
  },

  distributionSegment: {
    height: "100%",
  },

  distributionLegend: {
    gap: 14,
  },

  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  legendLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  legendLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  legendDescription: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2,
  },

  legendRight: {
    alignItems: "flex-end",
  },

  legendValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  legendPercentage: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
    fontWeight: "700",
  },

  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    width: "100%",
    justifyContent: "space-between",
  },

  quickActionButton: {
    width: "47%",
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#0b9387",
    backgroundColor: "rgba(11,147,135,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  quickActionPrimary: {
    backgroundColor: "#0b9387",
    borderColor: "#0b9387",
  },

  quickActionText: {
    color: "#0b9387",
    fontSize: 14,
    fontWeight: "900",
  },

  quickActionTextPrimary: {
    color: "#FFFFFF",
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

  lastUpdateCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "rgba(11,147,135,0.08)",
    borderWidth: 1,
    borderColor: "rgba(11,147,135,0.22)",
    borderRadius: 18,
    padding: 16,
  },

  lastUpdateTextBlock: {
    flex: 1,
  },

  lastUpdateTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
  },

  lastUpdateDescription: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
  },
});