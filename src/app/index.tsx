import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
    ArrowRight,
    Camera,
    CheckCircle,
    Clock,
    Layers,
    TrendingDown,
    TrendingUp,
} from "lucide-react-native";
import React from "react";
import {
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { FinbalanceLogo } from "../components/FinbalanceLogo";

const chartBars = [42, 38, 51, 47, 63, 58, 72];

export default function LandingScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.scrollContentDesktop,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.glowTwo} />

        <Header />

        <View
          style={[styles.bookLayout, isDesktop && styles.bookLayoutDesktop]}
        >
          <View style={[styles.bookColumn, isDesktop && styles.bookColumnLeft]}>
            <View style={styles.hero}>
              <Text style={styles.title}>
                Claridad para tu <Text style={styles.titleAccent}>dinero.</Text>
              </Text>

              <Text style={styles.subtitle}>
                Conoce cuánto gana realmente tu negocio con un simple Check-In.
                Sin hojas de cálculo complejas.
              </Text>

              <View style={styles.actions}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => router.push("/auth/register")}
                >
                  <Text style={styles.primaryButtonText}>
                    Toma el control, empieza el balance
                  </Text>
                  <ArrowRight size={18} color="#0b9387" />
                </Pressable>

                <Pressable onPress={() => router.push("/auth/login")}>
                  <Text style={styles.loginLink}>Ya tengo una cuenta</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View
            style={[styles.bookColumn, isDesktop && styles.bookColumnRight]}
          >
            <DashboardMockup />
          </View>
        </View>

        <View style={[styles.features, isDesktop && styles.featuresDesktop]}>
          <FeatureCard
            icon={<Camera size={22} color="#0EAF87" />}
            title="Snapshots de saldo"
            description="Actualiza saldos reales, no sumas transacciones."
            highlighted
            desktop={isDesktop}
          />

          <FeatureCard
            icon={<Layers size={22} color="#0EAF87" />}
            title="Multi-Workspace"
            description="Separa tus finanzas personales de las de tu negocio."
            desktop={isDesktop}
          />

          <FeatureCard
            icon={<Clock size={22} color="#0EAF87" />}
            title="Check-In rápido"
            description="Abres la app, actualizas saldos y ves tu balance."
            desktop={isDesktop}
          />
        </View>

        <View style={styles.finalCta}>
          <Text style={styles.finalTitle}>
            Tu negocio merece{"\n"}
            <Text style={styles.titleAccent}>claridad financiera.</Text>
          </Text>

          <Text style={styles.finalSubtitle}>
            Empieza gratis. Sin tarjeta de crédito.
          </Text>

          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push("/auth/register")}
          >
            <Text style={styles.primaryButtonText}>Empezar gratis</Text>
            <ArrowRight size={18} color="#0b9387" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <FinbalanceLogo variant="light" style={styles.logo} linkToDashboard={false} />
    </View>
  );
}

function DashboardMockup() {
  return (
    <View style={styles.mockupWrapper}>
      <LinearGradient
        colors={["#112033", "#0A1825"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.mockupCard}
      >
        <View style={styles.mockupHeader}>
          <View>
            <Text style={styles.mockupLabel}>Balance total de la Semana</Text>
            <Text style={styles.mockupAmount}>$71,600</Text>

            <View style={styles.positiveRow}>
              <TrendingUp size={14} color="#0EAF87" />
              <Text style={styles.positiveText}>+18.4% esta semana</Text>
            </View>
          </View>

          <View style={styles.checkBadge}>
            <Text style={styles.checkBadgeText}>Check-In de hoy</Text>
          </View>
        </View>

        <View style={styles.chart}>
          {chartBars.map((value, index) => (
            <View key={index} style={styles.chartColumn}>
              <LinearGradient
                colors={["#0EAF87", "rgb(255, 255, 255)"]}
                style={[styles.chartBar, { height: value }]}
              />
            </View>
          ))}
        </View>

        <View style={styles.transactions}>
          <Text style={styles.sectionLabel}>Movimientos recientes</Text>

          <TransactionRow
            title="Efectivo en caja"
            time="Hoy, 2:30pm"
            amount="+$12,400"
            type="income"
          />

          <TransactionRow
            title="Proveedor de insumos"
            time="Hoy, 11:00am"
            amount="−$3,200"
            type="expense"
          />

          <TransactionRow
            title="Transferencia SPEI"
            time="Ayer"
            amount="+$8,500"
            type="income"
          />
        </View>
      </LinearGradient>

      <View style={styles.floatingBadge}>
        <View>
          <Text style={styles.floatingTitle}>Completar Check-In</Text>
        </View>
      </View>
    </View>
  );
}

function TransactionRow({
  title,
  time,
  amount,
  type,
}: {
  title: string;
  time: string;
  amount: string;
  type: "income" | "expense";
}) {
  const isIncome = type === "income";

  return (
    <View style={styles.transactionRow}>
      <View style={styles.transactionLeft}>
        <View
          style={[
            styles.transactionIcon,
            isIncome ? styles.incomeBg : styles.expenseBg,
          ]}
        >
          {isIncome ? (
            <TrendingUp size={13} color="#0EAF87" />
          ) : (
            <TrendingDown size={13} color="#E05C6A" />
          )}
        </View>

        <View>
          <Text style={styles.transactionTitle}>{title}</Text>
          <Text style={styles.transactionTime}>{time}</Text>
        </View>
      </View>

      <Text style={isIncome ? styles.incomeText : styles.expenseText}>
        {amount}
      </Text>
    </View>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  highlighted,
  desktop,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  highlighted?: boolean;
  desktop?: boolean;
}) {
  return (
    <View
      style={[
        styles.featureCard,
        highlighted && styles.featureHighlighted,
        desktop && styles.featureCardDesktop,
      ]}
    >
      <View style={styles.featureIcon}>{icon}</View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDescription}>{description}</Text>
    </View>
  );
}

function TrustItem({ label }: { label: string }) {
  return (
    <View style={styles.trustItem}>
      <CheckCircle size={14} color="#0EAF87" />
      <Text style={styles.trustText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0b9387",
  },

  container: {
    flex: 1,
    backgroundColor: "#0b9388",
  },

  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 48,
  },

  glowTwo: {
    position: "absolute",
    top: 280,
    right: -110,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },

  header: {
    paddingTop: 16,
    paddingBottom: 42,
  },

  logo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },

  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
  },

  logoBox: {
    width: 70,
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  logoBoxText: {
    fontWeight: "600",
    fontSize: 44,
    letterSpacing: 2,
  },

  logoText: {
    fontSize: 44,
    fontWeight: "600",
    letterSpacing: 2,
  },

  hero: {
    marginBottom: 34,
  },

  bookLayout: {
    gap: 28,
  },

  bookLayoutDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 30,
  },

  bookColumn: {
    width: "100%",
  },

  bookColumnLeft: {
    flex: 1,
    maxWidth: 480,
  },

  bookColumnRight: {
    flex: 1.2,
    minWidth: 480,
  },

  scrollContentDesktop: {
    paddingHorizontal: 48,
  },

  featuresDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  featureCard: {
    borderRadius: 24,
    padding: 22,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    width: "100%",
  },

  featureCardDesktop: {
    flexBasis: "32%",
    maxWidth: "32%",
  },

  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(14,175,135,0.1)",
    borderWidth: 1,
    borderColor: "rgba(14,175,135,0.25)",
    marginBottom: 22,
  },

  badgeText: {
    color: "#0EAF87",
    fontSize: 13,
    fontWeight: "700",
  },

  title: {
    color: "#ffffff",
    fontSize: 48,
    lineHeight: 53,
    fontWeight: "900",
    letterSpacing: -1.2,
  },

  titleAccent: {
    color: "#18db9a",
  },

  subtitle: {
    color: "#e3e7eb",
    fontSize: 17,
    lineHeight: 26,
    marginTop: 18,
  },

  actions: {
    marginTop: 28,
    gap: 18,
  },

  primaryButton: {
    minHeight: 58,
    borderRadius: 999,
    paddingHorizontal: 22,
    backgroundColor: "#ffffff96",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#0EAF87",
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },

  primaryButtonText: {
    color: "#0b9387",
    fontSize: 15,
    fontWeight: "800",
  },

  loginLink: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },

  trustRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 24,
  },

  trustItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  trustText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },

  mockupWrapper: {
    position: "relative",
    marginBottom: 48,
  },

  mockupCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },

  mockupHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  mockupLabel: {
    color: "#6B8A9E",
    fontSize: 12,
    marginBottom: 8,
  },

  mockupAmount: {
    color: "#E6F1EE",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
  },

  positiveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },

  positiveText: {
    color: "#0EAF87",
    fontSize: 13,
    fontWeight: "700",
  },

  checkBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(14,175,135,0.15)",
  },

  checkBadgeText: {
    color: "#0EAF87",
    fontSize: 11,
    fontWeight: "800",
  },

  chart: {
    height: 120,
    paddingHorizontal: 18,
    paddingTop: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  chartColumn: {
    width: 26,
    height: 82,
    justifyContent: "flex-end",
  },

  chartBar: {
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },

  transactions: {
    padding: 20,
    paddingTop: 10,
    gap: 13,
  },

  sectionLabel: {
    color: "#6B8A9E",
    fontSize: 12,
    marginBottom: 4,
  },

  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  transactionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  incomeBg: {
    backgroundColor: "rgba(14,175,135,0.15)",
  },

  expenseBg: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },

  transactionTitle: {
    color: "#E6F1EE",
    fontSize: 13,
    fontWeight: "700",
  },

  transactionTime: {
    color: "#6B8A9E",
    fontSize: 11,
    marginTop: 2,
  },

  incomeText: {
    color: "#0EAF87",
    fontSize: 13,
    fontWeight: "800",
  },

  expenseText: {
    color: "#E05C6A",
    fontSize: 13,
    fontWeight: "800",
  },

  floatingBadge: {
    alignSelf: "center",
    marginTop: -32,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "#0b9387",
    borderWidth: 3,
    borderColor: "rgb(45, 52, 75)",
  },

  floatingTitle: {
    color: "#E6F1EE",
    fontSize: 16,
    fontWeight: "800",
  },

  features: {
    gap: 16,
    marginTop: 24,
  },

  featureHighlighted: {
    backgroundColor: "#0D1B2A",
    borderColor: "rgb(41, 30, 90)",
  },

  featureIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "rgba(14,175,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  featureTitle: {
    color: "#E6F1EE",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },

  featureDescription: {
    color: "#6B8A9E",
    fontSize: 14,
    lineHeight: 21,
  },

  finalCta: {
    marginTop: 54,
    alignItems: "center",
    gap: 18,
  },

  finalTitle: {
    color: "#E6F1EE",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -1,
  },

  finalSubtitle: {
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 6,
  },
});
