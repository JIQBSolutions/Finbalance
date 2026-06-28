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

type GoalType = "savings_goal" | "debt";

type FinancialGoal = {
  id: string;
  workspace_id: string;
  name: string;
  goal_type: GoalType;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  description: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
};

const GOAL_TYPES: {
  value: GoalType;
  label: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  {
    value: "savings_goal",
    label: "Meta de ahorro",
    description: "Para juntar dinero para algo específico.",
    icon: "target",
  },
  {
    value: "debt",
    label: "Pagar deuda",
    description: "Para medir avance pagando una deuda.",
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

function formatDate(dateString?: string | null) {
  if (!dateString) return "Sin fecha objetivo";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isValidDateInput(value: string) {
  if (!value.trim()) return true;

  const regex = /^\d{4}-\d{2}-\d{2}$/;

  if (!regex.test(value.trim())) return false;

  const date = new Date(`${value.trim()}T00:00:00`);

  return !Number.isNaN(date.getTime());
}

function getGoalTypeLabel(type: GoalType) {
  return type === "savings_goal" ? "Ahorro" : "Deuda";
}

function getGoalIcon(type: GoalType): keyof typeof Feather.glyphMap {
  return type === "savings_goal" ? "target" : "alert-circle";
}

function getGoalAccent(type: GoalType) {
  return type === "savings_goal" ? "#0b9387" : "#EF4444";
}

export default function GoalsScreen() {
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [goalName, setGoalName] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("savings_goal");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [description, setDescription] = useState("");

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState("");

  const currency = workspace?.currency || "MXN";

  const activeGoals = goals.filter((goal) => !goal.is_completed);
  const completedGoals = goals.filter((goal) => goal.is_completed);

  const totals = useMemo(() => {
    return goals.reduce(
      (acc, goal) => {
        acc.target += Number(goal.target_amount || 0);
        acc.current += Number(goal.current_amount || 0);

        if (goal.is_completed) {
          acc.completed += 1;
        }

        return acc;
      },
      {
        target: 0,
        current: 0,
        completed: 0,
      }
    );
  }, [goals]);

  const overallProgress =
    totals.target > 0 ? Math.min((totals.current / totals.target) * 100, 100) : 0;

  const loadGoals = useCallback(async () => {
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

      const { data, error } = await supabase
        .from("financial_goals")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("is_completed", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      setGoals((data || []) as FinancialGoal[]);
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos cargar tus metas.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadGoals();
  };

  const resetForm = () => {
    setGoalName("");
    setGoalType("savings_goal");
    setTargetAmount("");
    setCurrentAmount("");
    setTargetDate("");
    setDescription("");
    setShowCreateForm(false);
    setGlobalError(null);
  };

  const validateGoal = () => {
    if (!workspace) {
      setGlobalError("No encontramos un workspace activo.");
      return false;
    }

    if (!goalName.trim()) {
      setGlobalError("Ingresa el nombre de la meta.");
      return false;
    }

    if (goalName.trim().length > 60) {
      setGlobalError("El nombre de la meta no puede exceder 60 caracteres.");
      return false;
    }

    const parsedTarget = parseMoney(targetAmount);

    if (parsedTarget === null || parsedTarget <= 0) {
      setGlobalError("El monto objetivo debe ser mayor a 0.");
      return false;
    }

    const parsedCurrent = parseMoney(currentAmount || "0");

    if (parsedCurrent === null || parsedCurrent < 0) {
      setGlobalError("El avance actual debe ser un número válido.");
      return false;
    }

    if (parsedCurrent > parsedTarget) {
      setGlobalError("El avance actual no puede ser mayor al monto objetivo.");
      return false;
    }

    if (!isValidDateInput(targetDate)) {
      setGlobalError("La fecha objetivo debe tener formato YYYY-MM-DD.");
      return false;
    }

    if (description.trim().length > 180) {
      setGlobalError("La descripción no puede exceder 180 caracteres.");
      return false;
    }

    return true;
  };

  const handleCreateGoal = async () => {
    setGlobalError(null);

    if (!validateGoal()) return;

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

      const parsedTarget = parseMoney(targetAmount) || 0;
      const parsedCurrent = parseMoney(currentAmount || "0") || 0;

      const { error } = await supabase.from("financial_goals").insert({
        workspace_id: workspace.id,
        name: goalName.trim(),
        goal_type: goalType,
        target_amount: parsedTarget,
        current_amount: parsedCurrent,
        target_date: targetDate.trim() ? targetDate.trim() : null,
        description: description.trim() ? description.trim() : null,
        is_completed: parsedCurrent >= parsedTarget,
      });

      if (error) {
        throw new Error(error.message);
      }

      resetForm();
      await loadGoals();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos crear la meta.");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditingProgress = (goal: FinancialGoal) => {
    setEditingGoalId(goal.id);
    setEditingAmount(String(Number(goal.current_amount || 0)));
    setGlobalError(null);
  };

  const cancelEditingProgress = () => {
    setEditingGoalId(null);
    setEditingAmount("");
    setGlobalError(null);
  };

  const handleUpdateProgress = async (goal: FinancialGoal) => {
    setGlobalError(null);

    const parsedAmount = parseMoney(editingAmount);

    if (parsedAmount === null || parsedAmount < 0) {
      setGlobalError("El avance debe ser un número válido.");
      return;
    }

    if (parsedAmount > goal.target_amount) {
      setGlobalError("El avance no puede ser mayor al monto objetivo.");
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("financial_goals")
        .update({
          current_amount: parsedAmount,
          is_completed: parsedAmount >= goal.target_amount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", goal.id);

      if (error) {
        throw new Error(error.message);
      }

      cancelEditingProgress();
      await loadGoals();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos actualizar la meta.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteGoal = async (goal: FinancialGoal) => {
    setGlobalError(null);
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("financial_goals")
        .update({
          current_amount: goal.target_amount,
          is_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", goal.id);

      if (error) {
        throw new Error(error.message);
      }

      await loadGoals();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos completar la meta.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReopenGoal = async (goal: FinancialGoal) => {
    setGlobalError(null);
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("financial_goals")
        .update({
          is_completed: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", goal.id);

      if (error) {
        throw new Error(error.message);
      }

      await loadGoals();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos reabrir la meta.");
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
          <Text style={styles.loadingText}>Cargando tus metas...</Text>
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
              activeOpacity={0.85}
            >
              <Feather name="x" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <View style={styles.titleBlock}>
            <Text style={styles.kicker}>Metas financieras</Text>
            <Text style={styles.title}>Construye tu siguiente objetivo</Text>
            <Text style={styles.subtitle}>
              Registra metas de ahorro o de pago de deuda para medir tu avance.
            </Text>
          </View>

          {globalError && (
            <View style={styles.errorAlert}>
              <Feather name="alert-triangle" size={18} color="#FCA5A5" />
              <Text style={styles.errorAlertText}>{globalError}</Text>
            </View>
          )}

          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View>
                <Text style={styles.summaryLabel}>Avance total en metas</Text>
                <Text style={styles.summaryAmount}>
                  {formatMoney(totals.current, currency)}
                </Text>
              </View>

              <View style={styles.summaryBadge}>
                <Text style={styles.summaryBadgeText}>
                  {overallProgress.toFixed(0)}%
                </Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${overallProgress}%` },
                ]}
              />
            </View>

            <Text style={styles.summaryDescription}>
              Objetivo total: {formatMoney(totals.target, currency)} ·{" "}
              {totals.completed} completada{totals.completed === 1 ? "" : "s"}
            </Text>
          </View>

          {!showCreateForm ? (
            <TouchableOpacity
              style={styles.addGoalButton}
              onPress={() => {
                setGlobalError(null);
                setShowCreateForm(true);
              }}
              activeOpacity={0.85}
            >
              <Feather name="plus-circle" size={20} color="#FFFFFF" />
              <Text style={styles.addGoalButtonText}>Nueva meta</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.formCard}>
              <View style={styles.formHeader}>
                <View>
                  <Text style={styles.formTitle}>Nueva meta</Text>
                  <Text style={styles.formSubtitle}>
                    Define objetivo, avance y fecha.
                  </Text>
                </View>

                <TouchableOpacity onPress={resetForm} disabled={isSaving}>
                  <Feather name="x" size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Tipo de meta</Text>

                <View style={styles.goalTypeGrid}>
                  {GOAL_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.goalTypeButton,
                        goalType === type.value && styles.goalTypeButtonActive,
                      ]}
                      onPress={() => setGoalType(type.value)}
                      disabled={isSaving}
                      activeOpacity={0.85}
                    >
                      <Feather
                        name={type.icon}
                        size={18}
                        color={goalType === type.value ? "#FFFFFF" : "#9CA3AF"}
                      />

                      <Text
                        style={[
                          styles.goalTypeText,
                          goalType === type.value && styles.goalTypeTextActive,
                        ]}
                      >
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.typeDescription}>
                  {GOAL_TYPES.find((type) => type.value === goalType)?.description}
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Nombre de la meta</Text>

                <View style={styles.inputWrapper}>
                  <Feather
                    name="edit-2"
                    size={20}
                    color="#9CA3AF"
                    style={styles.inputIcon}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder={
                      goalType === "savings_goal"
                        ? "Ej. Fondo de emergencia"
                        : "Ej. Liquidar tarjeta"
                    }
                    placeholderTextColor="#64748B"
                    value={goalName}
                    onChangeText={setGoalName}
                    autoCapitalize="words"
                    editable={!isSaving}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Monto objetivo</Text>

                <View style={styles.inputWrapper}>
                  <Text style={styles.currencyPrefix}>$</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor="#64748B"
                    value={targetAmount}
                    onChangeText={setTargetAmount}
                    keyboardType="decimal-pad"
                    editable={!isSaving}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {goalType === "savings_goal"
                    ? "Ahorro actual"
                    : "Monto ya pagado"}
                </Text>

                <View style={styles.inputWrapper}>
                  <Text style={styles.currencyPrefix}>$</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor="#64748B"
                    value={currentAmount}
                    onChangeText={setCurrentAmount}
                    keyboardType="decimal-pad"
                    editable={!isSaving}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Fecha objetivo opcional</Text>

                <View style={styles.inputWrapper}>
                  <Feather
                    name="calendar"
                    size={20}
                    color="#9CA3AF"
                    style={styles.inputIcon}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#64748B"
                    value={targetDate}
                    onChangeText={setTargetDate}
                    autoCapitalize="none"
                    editable={!isSaving}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Descripción opcional</Text>

                <View style={styles.textAreaWrapper}>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Ej. Meta para separar dinero cada semana."
                    placeholderTextColor="#64748B"
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    editable={!isSaving}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  isSaving && styles.primaryButtonDisabled,
                ]}
                onPress={handleCreateGoal}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Guardar meta</Text>
                    <Feather name="check" size={20} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Metas activas</Text>
              <Text style={styles.sectionHint}>
                Objetivos que todavía estás construyendo.
              </Text>
            </View>

            {activeGoals.length > 0 ? (
              activeGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  currency={currency}
                  isEditing={editingGoalId === goal.id}
                  editingAmount={editingAmount}
                  setEditingAmount={setEditingAmount}
                  isSaving={isSaving}
                  onStartEdit={() => startEditingProgress(goal)}
                  onCancelEdit={cancelEditingProgress}
                  onSaveEdit={() => handleUpdateProgress(goal)}
                  onComplete={() => handleCompleteGoal(goal)}
                  onReopen={() => handleReopenGoal(goal)}
                />
              ))
            ) : (
              <EmptyState text="Aún no tienes metas activas." />
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Metas completadas</Text>
              <Text style={styles.sectionHint}>
                Objetivos que ya alcanzaste.
              </Text>
            </View>

            {completedGoals.length > 0 ? (
              completedGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  currency={currency}
                  isEditing={editingGoalId === goal.id}
                  editingAmount={editingAmount}
                  setEditingAmount={setEditingAmount}
                  isSaving={isSaving}
                  onStartEdit={() => startEditingProgress(goal)}
                  onCancelEdit={cancelEditingProgress}
                  onSaveEdit={() => handleUpdateProgress(goal)}
                  onComplete={() => handleCompleteGoal(goal)}
                  onReopen={() => handleReopenGoal(goal)}
                />
              ))
            ) : (
              <EmptyState text="Todavía no has completado metas." />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function GoalCard({
  goal,
  currency,
  isEditing,
  editingAmount,
  setEditingAmount,
  isSaving,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onComplete,
  onReopen,
}: {
  goal: FinancialGoal;
  currency: string;
  isEditing: boolean;
  editingAmount: string;
  setEditingAmount: (value: string) => void;
  isSaving: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onComplete: () => void;
  onReopen: () => void;
}) {
  const progress =
    goal.target_amount > 0
      ? Math.min((goal.current_amount / goal.target_amount) * 100, 100)
      : 0;

  const remaining = Math.max(goal.target_amount - goal.current_amount, 0);
  const accentColor = getGoalAccent(goal.goal_type);

  return (
    <View style={[styles.goalCard, { borderLeftColor: accentColor }]}>
      <View style={styles.goalHeader}>
        <View style={styles.goalLeft}>
          <View style={styles.goalIcon}>
            <Feather
              name={getGoalIcon(goal.goal_type)}
              size={18}
              color={accentColor}
            />
          </View>

          <View style={styles.goalInfo}>
            <Text style={styles.goalName}>{goal.name}</Text>
            <Text style={styles.goalMeta}>
              {getGoalTypeLabel(goal.goal_type)} · {formatDate(goal.target_date)}
            </Text>
          </View>
        </View>

        {goal.is_completed && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>Completada</Text>
          </View>
        )}
      </View>

      {goal.description && (
        <Text style={styles.goalDescription}>{goal.description}</Text>
      )}

      <View style={styles.goalAmountsRow}>
        <View>
          <Text style={styles.goalAmountLabel}>Avance</Text>
          <Text style={styles.goalAmount}>
            {formatMoney(goal.current_amount, currency)}
          </Text>
        </View>

        <View style={styles.goalAmountRight}>
          <Text style={styles.goalAmountLabel}>Objetivo</Text>
          <Text style={styles.goalAmount}>
            {formatMoney(goal.target_amount, currency)}
          </Text>
        </View>
      </View>

      <View style={styles.goalProgressTrack}>
        <View
          style={[
            styles.goalProgressFill,
            {
              width: `${progress}%`,
              backgroundColor: accentColor,
            },
          ]}
        />
      </View>

      <View style={styles.goalFooterInfo}>
        <Text style={styles.goalProgressText}>{progress.toFixed(0)}% logrado</Text>
        <Text style={styles.goalRemainingText}>
          Faltan {formatMoney(remaining, currency)}
        </Text>
      </View>

      {isEditing ? (
        <View style={styles.editProgressBox}>
          <Text style={styles.label}>Nuevo avance</Text>

          <View style={styles.inputWrapper}>
            <Text style={styles.currencyPrefix}>$</Text>

            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#64748B"
              value={editingAmount}
              onChangeText={setEditingAmount}
              keyboardType="decimal-pad"
              editable={!isSaving}
            />
          </View>

          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onCancelEdit}
              disabled={isSaving}
            >
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.smallPrimaryButton, isSaving && styles.primaryButtonDisabled]}
              onPress={onSaveEdit}
              disabled={isSaving}
            >
              <Text style={styles.smallPrimaryButtonText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.goalActions}>
          <TouchableOpacity
            style={styles.goalActionButton}
            onPress={onStartEdit}
            disabled={isSaving}
          >
            <Feather name="edit-3" size={16} color="#0b9387" />
            <Text style={styles.goalActionText}>Actualizar</Text>
          </TouchableOpacity>

          {goal.is_completed ? (
            <TouchableOpacity
              style={styles.goalActionButton}
              onPress={onReopen}
              disabled={isSaving}
            >
              <Feather name="rotate-ccw" size={16} color="#0b9387" />
              <Text style={styles.goalActionText}>Reabrir</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.goalActionButton}
              onPress={onComplete}
              disabled={isSaving}
            >
              <Feather name="check-circle" size={16} color="#0b9387" />
              <Text style={styles.goalActionText}>Completar</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
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
    marginBottom: 18,
  },

  summaryTopRow: {
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
    fontSize: 34,
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

  progressTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.25)",
    marginTop: 18,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },

  summaryDescription: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    fontWeight: "600",
  },

  addGoalButton: {
    backgroundColor: "#0b9387",
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 28,
  },

  addGoalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
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
    fontWeight: "800",
    marginBottom: 10,
  },

  goalTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  goalTypeButton: {
    width: "47%",
    minHeight: 56,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  goalTypeButtonActive: {
    borderColor: "#0b9387",
    backgroundColor: "rgba(11,147,135,0.16)",
  },

  goalTypeText: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "800",
  },

  goalTypeTextActive: {
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

  textAreaWrapper: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 92,
  },

  textArea: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    minHeight: 68,
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
    fontWeight: "900",
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

  goalCard: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: "#334155",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },

  goalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },

  goalLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  goalIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },

  goalInfo: {
    flex: 1,
  },

  goalName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  goalMeta: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 3,
    fontWeight: "600",
  },

  completedBadge: {
    backgroundColor: "rgba(34,197,94,0.14)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  completedBadgeText: {
    color: "#86EFAC",
    fontSize: 11,
    fontWeight: "900",
  },

  goalDescription: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },

  goalAmountsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },

  goalAmountRight: {
    alignItems: "flex-end",
  },

  goalAmountLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
  },

  goalAmount: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  goalProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#0F172A",
    overflow: "hidden",
    marginBottom: 10,
  },

  goalProgressFill: {
    height: "100%",
    borderRadius: 999,
  },

  goalFooterInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },

  goalProgressText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
  },

  goalRemainingText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
  },

  goalActions: {
    flexDirection: "row",
    gap: 10,
  },

  goalActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#0b9387",
    backgroundColor: "rgba(11,147,135,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },

  goalActionText: {
    color: "#0b9387",
    fontSize: 13,
    fontWeight: "900",
  },

  editProgressBox: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    padding: 14,
    marginTop: 2,
  },

  editActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },

  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "900",
  },

  smallPrimaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#0b9387",
    alignItems: "center",
    justifyContent: "center",
  },

  smallPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
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