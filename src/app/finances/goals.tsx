import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { FieldError } from "../../components/FieldError";
import { FinbalanceLogo } from "../../components/FinbalanceLogo";
import { confirmDestructiveAction } from "../../lib/confirm";
import { calculateDebtSchedule } from "../../lib/debt-plans";
import {
  formatDateInput,
  formatIsoDateForInput,
  formatMoneyInput,
  parseDateInputToIso,
  parseMoneyInput,
} from "../../lib/form-formats";
import { supabase } from "../../lib/supabase";
import { getCurrentWorkspace } from "../../lib/workspaces";

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

type DebtPaymentRecord = {
  id: string;
  account_id: string;
  amount: number;
  notes: string | null;
  paid_at: string;
};

type DebtAccount = {
  account_id: string;
  workspace_id: string;
  name: string;
  balance: number;
  original_amount: number;
  target_date: string | null;
  description: string | null;
  currency: string;
  last_payment: DebtPaymentRecord | null;
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

function formatTimestamp(dateString?: string | null) {
  if (!dateString) return "Fecha no disponible";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
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

function getTodayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getTargetDate(dateString?: string | null) {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function getDaysRemaining(dateString?: string | null) {
  const targetDate = getTargetDate(dateString);
  if (!targetDate) return null;
  const today = getTodayStart();
  return Math.ceil(
    (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function getGoalActionVerb(type: GoalType) {
  return type === "debt" ? "pagar" : "ahorrar";
}

function getGoalInsight(goal: FinancialGoal) {
  const targetAmount = Number(goal.target_amount || 0);
  const currentAmount = Number(goal.current_amount || 0);
  const remaining = Math.max(targetAmount - currentAmount, 0);
  const progress =
    targetAmount > 0 ? Math.min((currentAmount / targetAmount) * 100, 100) : 0;
  const daysRemaining = getDaysRemaining(goal.target_date);
  const actionVerb = getGoalActionVerb(goal.goal_type);

  if (goal.is_completed || remaining <= 0) {
    return {
      remaining,
      progress,
      daysRemaining,
      requiredWeekly: 0,
      requiredMonthly: 0,
      actionVerb,
      status: "completed" as const,
      message: "Objetivo completado.",
    };
  }

  if (daysRemaining === null) {
    return {
      remaining,
      progress,
      daysRemaining,
      requiredWeekly: null,
      requiredMonthly: null,
      actionVerb,
      status: "no_date" as const,
      message:
        "Agrega una fecha objetivo para calcular cuánto necesitas por semana y por mes.",
    };
  }

  if (daysRemaining < 0) {
    return {
      remaining,
      progress,
      daysRemaining,
      requiredWeekly: null,
      requiredMonthly: null,
      actionVerb,
      status: "overdue" as const,
      message: `La fecha objetivo ya pasó. Aún faltan ${remaining.toFixed(2)}.`,
    };
  }

  const safeDays = Math.max(daysRemaining, 1);
  const weeksRemaining = Math.max(safeDays / 7, 1);
  const monthsRemaining = Math.max(safeDays / 30, 1);

  return {
    remaining,
    progress,
    daysRemaining,
    requiredWeekly: remaining / weeksRemaining,
    requiredMonthly: remaining / monthsRemaining,
    actionVerb,
    status: "active" as const,
    message: `Necesitas ${actionVerb} aproximadamente por semana para llegar a tiempo.`,
  };
}

function getDeadlineLabel(daysRemaining: number | null) {
  if (daysRemaining === null) return "Sin fecha objetivo";
  if (daysRemaining < 0) return `Vencida hace ${Math.abs(daysRemaining)} días`;
  if (daysRemaining === 0) return "Vence hoy";
  if (daysRemaining === 1) return "Vence mañana";
  return `Faltan ${daysRemaining} días`;
}

export default function GoalsScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [debts, setDebts] = useState<DebtAccount[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingGoalDetailsId, setEditingGoalDetailsId] = useState<string | null>(
    null
  );

  const [goalName, setGoalName] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("savings_goal");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    targetAmount?: string;
    currentAmount?: string;
    targetDate?: string;
    description?: string;
  }>({});

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState("");
  const [editingAmountError, setEditingAmountError] = useState<string | null>(
    null
  );

  const [editingDebtPaymentId, setEditingDebtPaymentId] = useState<
    string | null
  >(null);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState("");
  const [debtPaymentNote, setDebtPaymentNote] = useState("");
  const [debtPaymentErrors, setDebtPaymentErrors] = useState<{
    amount?: string;
    note?: string;
  }>({});

  const [editingDebtPlanId, setEditingDebtPlanId] = useState<string | null>(
    null
  );
  const [debtOriginalAmount, setDebtOriginalAmount] = useState("");
  const [debtTargetDate, setDebtTargetDate] = useState("");
  const [debtDescription, setDebtDescription] = useState("");
  const [debtPlanErrors, setDebtPlanErrors] = useState<{
    originalAmount?: string;
    targetDate?: string;
    description?: string;
  }>({});

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

  const debtTotals = useMemo(() => {
    return debts.reduce(
      (acc, debt) => {
        const schedule = calculateDebtSchedule(
          debt.balance,
          debt.original_amount,
          debt.target_date
        );

        acc.pending += schedule.balance;
        acc.paid += schedule.paidAmount;

        if (schedule.monthlyPayment !== null) {
          acc.monthlyPayment += schedule.monthlyPayment;
        }

        if (schedule.status === "active") {
          acc.scheduledDebts += 1;
        }

        return acc;
      },
      {
        pending: 0,
        paid: 0,
        monthlyPayment: 0,
        scheduledDebts: 0,
      }
    );
  }, [debts]);

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

      const currentWorkspace = await getCurrentWorkspace();
      if (!currentWorkspace) {
        router.replace("/dashboard/onboarding");
        return;
      }
      setWorkspace(currentWorkspace);

      const [goalsResult, debtAccountsResult] = await Promise.all([
        supabase
          .from("financial_goals")
          .select("*")
          .eq("workspace_id", currentWorkspace.id)
          .order("is_completed", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase
          .from("latest_account_balances")
          .select(
            "account_id, workspace_id, account_name, balance, account_type"
          )
          .eq("workspace_id", currentWorkspace.id)
          .eq("account_type", "credit"),
      ]);

      if (goalsResult.error) {
        throw new Error(goalsResult.error.message);
      }

      if (debtAccountsResult.error) {
        throw new Error(debtAccountsResult.error.message);
      }

      const debtAccounts = (debtAccountsResult.data || []) as {
        account_id: string;
        workspace_id: string;
        account_name: string | null;
        balance: number;
      }[];
      const debtAccountIds = debtAccounts.map((account) => account.account_id);

      let planRows: {
        account_id: string;
        workspace_id: string;
        original_amount: number;
        target_date: string | null;
        description: string | null;
      }[] = [];
      let paymentRows: DebtPaymentRecord[] = [];

      if (debtAccountIds.length > 0) {
        const [plansResult, paymentsResult] = await Promise.all([
          supabase
            .from("debt_plans")
            .select(
              "account_id, workspace_id, original_amount, target_date, description"
            )
            .in("account_id", debtAccountIds),
          supabase
            .from("debt_payments")
            .select("id, account_id, amount, notes, paid_at")
            .in("account_id", debtAccountIds)
            .order("paid_at", { ascending: false }),
        ]);

        if (plansResult.error) {
          throw new Error(plansResult.error.message);
        }

        if (paymentsResult.error) {
          throw new Error(paymentsResult.error.message);
        }

        planRows = plansResult.data || [];
        paymentRows = (paymentsResult.data || []) as DebtPaymentRecord[];
      }

      const plansByAccount = new Map(
        planRows.map((plan) => [plan.account_id, plan])
      );
      const lastPaymentsByAccount = new Map<string, DebtPaymentRecord>();

      paymentRows.forEach((payment) => {
        if (!lastPaymentsByAccount.has(payment.account_id)) {
          lastPaymentsByAccount.set(payment.account_id, payment);
        }
      });

      const formattedDebts = debtAccounts
        .map((account) => {
          const plan = plansByAccount.get(account.account_id);
          const balance = Number(account.balance || 0);

          return {
            account_id: account.account_id,
            workspace_id: account.workspace_id,
            name: account.account_name || "Deuda",
            balance,
            original_amount: Math.max(
              Number(plan?.original_amount || balance),
              balance
            ),
            target_date: plan?.target_date || null,
            description: plan?.description || null,
            currency: currentWorkspace.currency,
            last_payment:
              lastPaymentsByAccount.get(account.account_id) || null,
          } satisfies DebtAccount;
        })
        .sort((a, b) => {
          if ((a.balance <= 0) !== (b.balance <= 0)) {
            return a.balance <= 0 ? 1 : -1;
          }

          return a.name.localeCompare(b.name, "es");
        });

      setGoals((goalsResult.data || []) as FinancialGoal[]);
      setDebts(formattedDebts);
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
    setEditingGoalDetailsId(null);
    setGlobalError(null);
    setFieldErrors({});
  };

  const openGoalForm = (goal?: FinancialGoal) => {
    setGlobalError(null);
    setSuccessMessage(null);
    setEditingGoalId(null);
    setEditingAmount("");
    setEditingAmountError(null);
    setEditingDebtPaymentId(null);
    setEditingDebtPlanId(null);
    setFieldErrors({});

    if (goal) {
      setEditingGoalDetailsId(goal.id);
      setGoalName(goal.name);
      setGoalType(goal.goal_type);
      setTargetAmount(
        formatMoneyInput(String(Number(goal.target_amount || 0)))
      );
      setCurrentAmount(
        formatMoneyInput(String(Number(goal.current_amount || 0)))
      );
      setTargetDate(formatIsoDateForInput(goal.target_date));
      setDescription(goal.description || "");
    } else {
      setEditingGoalDetailsId(null);
      setGoalName("");
      setGoalType("savings_goal");
      setTargetAmount("");
      setCurrentAmount("");
      setTargetDate("");
      setDescription("");
    }

    setShowCreateForm(true);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 360, animated: true });
    });
  };

  const validateGoal = () => {
    const nextErrors: {
      name?: string;
      targetAmount?: string;
      currentAmount?: string;
      targetDate?: string;
      description?: string;
    } = {};

    if (!workspace) {
      setGlobalError("No encontramos un workspace activo.");
      return false;
    }

    if (!goalName.trim()) {
      nextErrors.name = "Ingresa el nombre de la meta.";
    } else if (goalName.trim().length > 60) {
      nextErrors.name = "El nombre no puede exceder 60 caracteres.";
    }

    const parsedTarget = parseMoneyInput(targetAmount);

    if (parsedTarget === null || parsedTarget <= 0) {
      nextErrors.targetAmount = "El monto objetivo debe ser mayor a 0.";
    }

    const parsedCurrent = parseMoneyInput(currentAmount || "0");

    if (parsedCurrent === null) {
      nextErrors.currentAmount = "Ingresa un avance válido.";
    } else if (parsedTarget !== null && parsedCurrent > parsedTarget) {
      nextErrors.currentAmount =
        "El avance no puede ser mayor al monto objetivo.";
    }

    if (targetDate.trim() && !parseDateInputToIso(targetDate)) {
      nextErrors.targetDate = "Ingresa una fecha válida en formato DD/MM/AAAA.";
    }

    if (description.trim().length > 180) {
      nextErrors.description =
        "La descripción no puede exceder 180 caracteres.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSaveGoal = async () => {
    setGlobalError(null);
    setSuccessMessage(null);

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

      const parsedTarget = parseMoneyInput(targetAmount) || 0;
      const parsedCurrent = parseMoneyInput(currentAmount || "0") || 0;

      const goalValues = {
        name: goalName.trim(),
        goal_type: goalType,
        target_amount: parsedTarget,
        current_amount: parsedCurrent,
        target_date: targetDate.trim()
          ? parseDateInputToIso(targetDate)
          : null,
        description: description.trim() ? description.trim() : null,
        is_completed: parsedCurrent >= parsedTarget,
        updated_at: new Date().toISOString(),
      };

      const { error } = editingGoalDetailsId
        ? await supabase
            .from("financial_goals")
            .update(goalValues)
            .eq("id", editingGoalDetailsId)
            .eq("workspace_id", workspace.id)
        : await supabase.from("financial_goals").insert({
            workspace_id: workspace.id,
            ...goalValues,
          });

      if (error) {
        throw new Error(error.message);
      }

      const successText = editingGoalDetailsId
        ? "Meta actualizada."
        : "Meta creada.";
      resetForm();
      setSuccessMessage(successText);
      await loadGoals();
    } catch (error: any) {
      setGlobalError(
        error.message ||
          (editingGoalDetailsId
            ? "No pudimos actualizar la meta."
            : "No pudimos crear la meta.")
      );
    } finally {
      setIsSaving(false);
    }
  };

  const startEditingProgress = (goal: FinancialGoal) => {
    setEditingGoalId(goal.id);
    setEditingAmount(
      formatMoneyInput(String(Number(goal.current_amount || 0)))
    );
    setEditingAmountError(null);
    setGlobalError(null);
  };

  const cancelEditingProgress = () => {
    setEditingGoalId(null);
    setEditingAmount("");
    setEditingAmountError(null);
    setGlobalError(null);
  };

  const handleUpdateProgress = async (goal: FinancialGoal) => {
    setGlobalError(null);

    const parsedAmount = parseMoneyInput(editingAmount);

    if (parsedAmount === null) {
      setEditingAmountError("Ingresa un avance válido.");
      return;
    }

    if (parsedAmount > goal.target_amount) {
      setEditingAmountError(
        "El avance no puede ser mayor al monto objetivo."
      );
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
        .eq("id", goal.id)
        .eq("workspace_id", goal.workspace_id);

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
        .eq("id", goal.id)
        .eq("workspace_id", goal.workspace_id);

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

  const deleteGoal = async (goal: FinancialGoal) => {
    setGlobalError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      if (!workspace) {
        throw new Error("No encontramos un workspace activo.");
      }

      const { error } = await supabase
        .from("financial_goals")
        .delete()
        .eq("id", goal.id)
        .eq("workspace_id", workspace.id);

      if (error) {
        throw new Error(error.message);
      }

      if (editingGoalDetailsId === goal.id) {
        resetForm();
      }
      if (editingGoalId === goal.id) {
        cancelEditingProgress();
      }
      setSuccessMessage("Meta eliminada.");
      await loadGoals();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos eliminar la meta.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGoal = (goal: FinancialGoal) => {
    confirmDestructiveAction({
      title: "Eliminar meta",
      message: `Vas a eliminar "${goal.name}" de forma permanente.`,
      onConfirm: () => deleteGoal(goal),
    });
  };

  const cancelDebtPayment = () => {
    setEditingDebtPaymentId(null);
    setDebtPaymentAmount("");
    setDebtPaymentNote("");
    setDebtPaymentErrors({});
  };

  const startDebtPayment = (debt: DebtAccount) => {
    setGlobalError(null);
    setSuccessMessage(null);
    setShowCreateForm(false);
    setEditingDebtPlanId(null);
    setDebtPlanErrors({});
    setEditingDebtPaymentId(debt.account_id);
    setDebtPaymentAmount("");
    setDebtPaymentNote("");
    setDebtPaymentErrors({});
  };

  const handleRecordDebtPayment = async (debt: DebtAccount) => {
    setGlobalError(null);
    setSuccessMessage(null);

    const nextErrors: { amount?: string; note?: string } = {};
    const parsedAmount = parseMoneyInput(debtPaymentAmount);

    if (parsedAmount === null || parsedAmount <= 0) {
      nextErrors.amount = "El abono debe ser mayor a cero.";
    } else if (parsedAmount > debt.balance) {
      nextErrors.amount = "El abono no puede superar el saldo pendiente.";
    }

    if (debtPaymentNote.trim().length > 120) {
      nextErrors.note = "La nota no puede exceder 120 caracteres.";
    }

    setDebtPaymentErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || parsedAmount === null) return;

    setIsSaving(true);

    try {
      const { error } = await supabase.rpc("record_debt_payment", {
        p_account_id: debt.account_id,
        p_amount: parsedAmount,
        p_notes: debtPaymentNote.trim() || null,
      });

      if (error) {
        throw new Error(error.message);
      }

      cancelDebtPayment();
      setSuccessMessage(
        parsedAmount >= debt.balance
          ? `${debt.name} quedó liquidada.`
          : `Abono de ${formatMoney(parsedAmount, debt.currency)} registrado en ${debt.name}.`
      );
      await loadGoals();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos registrar el abono.");
    } finally {
      setIsSaving(false);
    }
  };

  const cancelDebtPlanEdit = () => {
    setEditingDebtPlanId(null);
    setDebtOriginalAmount("");
    setDebtTargetDate("");
    setDebtDescription("");
    setDebtPlanErrors({});
  };

  const startDebtPlanEdit = (debt: DebtAccount) => {
    setGlobalError(null);
    setSuccessMessage(null);
    setShowCreateForm(false);
    setEditingDebtPaymentId(null);
    setDebtPaymentErrors({});
    setEditingDebtPlanId(debt.account_id);
    setDebtOriginalAmount(
      formatMoneyInput(String(Number(debt.original_amount || debt.balance)))
    );
    setDebtTargetDate(formatIsoDateForInput(debt.target_date));
    setDebtDescription(debt.description || "");
    setDebtPlanErrors({});
  };

  const handleUpdateDebtPlan = async (debt: DebtAccount) => {
    setGlobalError(null);
    setSuccessMessage(null);

    const nextErrors: {
      originalAmount?: string;
      targetDate?: string;
      description?: string;
    } = {};
    const parsedOriginalAmount = parseMoneyInput(debtOriginalAmount);
    const parsedTargetDate = debtTargetDate.trim()
      ? parseDateInputToIso(debtTargetDate)
      : null;

    if (parsedOriginalAmount === null || parsedOriginalAmount <= 0) {
      nextErrors.originalAmount = "La deuda inicial debe ser mayor a cero.";
    } else if (parsedOriginalAmount < debt.balance) {
      nextErrors.originalAmount =
        "La deuda inicial no puede ser menor al saldo pendiente.";
    }

    if (debtTargetDate.trim() && !parsedTargetDate) {
      nextErrors.targetDate =
        "Ingresa una fecha válida en formato DD/MM/AAAA.";
    }

    if (debtDescription.trim().length > 180) {
      nextErrors.description = "La nota no puede exceder 180 caracteres.";
    }

    setDebtPlanErrors(nextErrors);
    if (
      Object.keys(nextErrors).length > 0 ||
      parsedOriginalAmount === null
    ) {
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase.rpc("update_debt_plan", {
        p_account_id: debt.account_id,
        p_original_amount: parsedOriginalAmount,
        p_target_date: parsedTargetDate,
        p_description: debtDescription.trim() || null,
      });

      if (error) {
        throw new Error(error.message);
      }

      cancelDebtPlanEdit();
      setSuccessMessage(`Plan de pago de ${debt.name} actualizado.`);
      await loadGoals();
    } catch (error: any) {
      setGlobalError(error.message || "No pudimos actualizar el plan de deuda.");
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
          ref={scrollViewRef}
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
            <Text style={styles.kicker}>Metas y deudas</Text>
            <Text style={styles.title}>Convierte tus planes en progreso</Text>
            <Text style={styles.subtitle}>
              Ahorra para tus objetivos y registra abonos reales a cada deuda
              desde un solo lugar.
            </Text>
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

          {debts.length > 0 && (
            <View style={styles.debtSummaryCard}>
              <View style={styles.debtSummaryHeader}>
                <View>
                  <Text style={styles.debtSummaryKicker}>Plan de deudas</Text>
                  <Text style={styles.debtSummaryTitle}>
                    {formatMoney(debtTotals.pending, currency)} pendientes
                  </Text>
                </View>

                <View style={styles.debtSummaryIcon}>
                  <Feather name="trending-down" size={20} color="#FCA5A5" />
                </View>
              </View>

              <View style={styles.debtSummaryMetrics}>
                <View style={styles.debtSummaryMetric}>
                  <Text style={styles.debtSummaryMetricLabel}>Ya abonado</Text>
                  <Text style={styles.debtSummaryMetricValue}>
                    {formatMoney(debtTotals.paid, currency)}
                  </Text>
                </View>

                <View style={styles.debtSummaryMetric}>
                  <Text style={styles.debtSummaryMetricLabel}>
                    Sugerido al mes
                  </Text>
                  <Text style={styles.debtSummaryMetricValue}>
                    {debtTotals.pending > 0 &&
                    debtTotals.scheduledDebts === 0
                      ? "Define plazos"
                      : formatMoney(debtTotals.monthlyPayment, currency)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {!showCreateForm ? (
            <TouchableOpacity
              style={styles.addGoalButton}
              onPress={() => openGoalForm()}
              activeOpacity={0.85}
            >
              <Feather name="plus-circle" size={20} color="#FFFFFF" />
              <Text style={styles.addGoalButtonText}>Nueva meta</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.formCard}>
              <View style={styles.formHeader}>
                <View>
                  <Text style={styles.formTitle}>
                    {editingGoalDetailsId ? "Editar meta" : "Nueva meta"}
                  </Text>
                  <Text style={styles.formSubtitle}>
                    {editingGoalDetailsId
                      ? "Modifica cualquiera de los datos de la meta."
                      : "Define objetivo, avance y fecha."}
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

                <View
                  style={[
                    styles.inputWrapper,
                    fieldErrors.name && styles.inputWrapperError,
                  ]}
                >
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
                    onChangeText={(value) => {
                      setGoalName(value);
                      setFieldErrors((current) => ({
                        ...current,
                        name: undefined,
                      }));
                    }}
                    autoCapitalize="words"
                    editable={!isSaving}
                  />
                </View>
                <FieldError message={fieldErrors.name} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Monto objetivo</Text>

                <View
                  style={[
                    styles.inputWrapper,
                    fieldErrors.targetAmount && styles.inputWrapperError,
                  ]}
                >
                  <Text style={styles.currencyPrefix}>$</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor="#64748B"
                    value={targetAmount}
                    onChangeText={(value) => {
                      setTargetAmount(formatMoneyInput(value));
                      setFieldErrors((current) => ({
                        ...current,
                        targetAmount: undefined,
                      }));
                    }}
                    keyboardType="decimal-pad"
                    editable={!isSaving}
                  />
                </View>
                <FieldError message={fieldErrors.targetAmount} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {goalType === "savings_goal"
                    ? "Ahorro actual"
                    : "Monto ya pagado"}
                </Text>

                <View
                  style={[
                    styles.inputWrapper,
                    fieldErrors.currentAmount && styles.inputWrapperError,
                  ]}
                >
                  <Text style={styles.currencyPrefix}>$</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor="#64748B"
                    value={currentAmount}
                    onChangeText={(value) => {
                      setCurrentAmount(formatMoneyInput(value));
                      setFieldErrors((current) => ({
                        ...current,
                        currentAmount: undefined,
                      }));
                    }}
                    keyboardType="decimal-pad"
                    editable={!isSaving}
                  />
                </View>
                <FieldError message={fieldErrors.currentAmount} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Fecha objetivo opcional</Text>

                <View
                  style={[
                    styles.inputWrapper,
                    fieldErrors.targetDate && styles.inputWrapperError,
                  ]}
                >
                  <Feather
                    name="calendar"
                    size={20}
                    color="#9CA3AF"
                    style={styles.inputIcon}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor="#64748B"
                    value={targetDate}
                    onChangeText={(value) => {
                      setTargetDate(formatDateInput(value));
                      setFieldErrors((current) => ({
                        ...current,
                        targetDate: undefined,
                      }));
                    }}
                    autoCapitalize="none"
                    keyboardType="number-pad"
                    maxLength={10}
                    editable={!isSaving}
                  />
                </View>
                <FieldError message={fieldErrors.targetDate} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Descripción opcional</Text>

                <View
                  style={[
                    styles.textAreaWrapper,
                    fieldErrors.description && styles.inputWrapperError,
                  ]}
                >
                  <TextInput
                    style={styles.textArea}
                    placeholder="Ej. Meta para separar dinero cada semana."
                    placeholderTextColor="#64748B"
                    value={description}
                    onChangeText={(value) => {
                      setDescription(value);
                      setFieldErrors((current) => ({
                        ...current,
                        description: undefined,
                      }));
                    }}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    editable={!isSaving}
                  />
                </View>
                <FieldError message={fieldErrors.description} />
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  isSaving && styles.primaryButtonDisabled,
                ]}
                onPress={handleSaveGoal}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>
                      {editingGoalDetailsId ? "Guardar cambios" : "Guardar meta"}
                    </Text>
                    <Feather name="check" size={20} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tus deudas</Text>
              <Text style={styles.sectionHint}>
                El saldo se actualiza con cada abono y el plan se recalcula
                según la fecha límite.
              </Text>
            </View>

            {debts.length > 0 ? (
              debts.map((debt) => (
                <DebtCard
                  key={debt.account_id}
                  debt={debt}
                  currency={debt.currency || currency}
                  isSaving={isSaving}
                  isEditingPayment={
                    editingDebtPaymentId === debt.account_id
                  }
                  paymentAmount={debtPaymentAmount}
                  paymentNote={debtPaymentNote}
                  paymentErrors={debtPaymentErrors}
                  setPaymentAmount={(value) => {
                    setDebtPaymentAmount(formatMoneyInput(value));
                    setDebtPaymentErrors((current) => ({
                      ...current,
                      amount: undefined,
                    }));
                  }}
                  setPaymentNote={(value) => {
                    setDebtPaymentNote(value);
                    setDebtPaymentErrors((current) => ({
                      ...current,
                      note: undefined,
                    }));
                  }}
                  onStartPayment={() => startDebtPayment(debt)}
                  onCancelPayment={cancelDebtPayment}
                  onSavePayment={() => handleRecordDebtPayment(debt)}
                  isEditingPlan={editingDebtPlanId === debt.account_id}
                  originalAmount={debtOriginalAmount}
                  targetDate={debtTargetDate}
                  description={debtDescription}
                  planErrors={debtPlanErrors}
                  setOriginalAmount={(value) => {
                    setDebtOriginalAmount(formatMoneyInput(value));
                    setDebtPlanErrors((current) => ({
                      ...current,
                      originalAmount: undefined,
                    }));
                  }}
                  setTargetDate={(value) => {
                    setDebtTargetDate(formatDateInput(value));
                    setDebtPlanErrors((current) => ({
                      ...current,
                      targetDate: undefined,
                    }));
                  }}
                  setDescription={(value) => {
                    setDebtDescription(value);
                    setDebtPlanErrors((current) => ({
                      ...current,
                      description: undefined,
                    }));
                  }}
                  onStartPlanEdit={() => startDebtPlanEdit(debt)}
                  onCancelPlanEdit={cancelDebtPlanEdit}
                  onSavePlan={() => handleUpdateDebtPlan(debt)}
                />
              ))
            ) : (
              <EmptyState text="Las cuentas de tipo deuda aparecerán aquí automáticamente." />
            )}
          </View>

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
                  editingAmountError={editingAmountError}
                  setEditingAmount={(value) => {
                    setEditingAmount(formatMoneyInput(value));
                    setEditingAmountError(null);
                  }}
                  isSaving={isSaving}
                  onStartEdit={() => startEditingProgress(goal)}
                  onCancelEdit={cancelEditingProgress}
                  onSaveEdit={() => handleUpdateProgress(goal)}
                  onComplete={() => handleCompleteGoal(goal)}
                  onReopen={() => startEditingProgress(goal)}
                  onEditDetails={() => openGoalForm(goal)}
                  onDelete={() => handleDeleteGoal(goal)}
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
                  editingAmountError={editingAmountError}
                  setEditingAmount={(value) => {
                    setEditingAmount(formatMoneyInput(value));
                    setEditingAmountError(null);
                  }}
                  isSaving={isSaving}
                  onStartEdit={() => startEditingProgress(goal)}
                  onCancelEdit={cancelEditingProgress}
                  onSaveEdit={() => handleUpdateProgress(goal)}
                  onComplete={() => handleCompleteGoal(goal)}
                  onReopen={() => startEditingProgress(goal)}
                  onEditDetails={() => openGoalForm(goal)}
                  onDelete={() => handleDeleteGoal(goal)}
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

function DebtCard({
  debt,
  currency,
  isSaving,
  isEditingPayment,
  paymentAmount,
  paymentNote,
  paymentErrors,
  setPaymentAmount,
  setPaymentNote,
  onStartPayment,
  onCancelPayment,
  onSavePayment,
  isEditingPlan,
  originalAmount,
  targetDate,
  description,
  planErrors,
  setOriginalAmount,
  setTargetDate,
  setDescription,
  onStartPlanEdit,
  onCancelPlanEdit,
  onSavePlan,
}: {
  debt: DebtAccount;
  currency: string;
  isSaving: boolean;
  isEditingPayment: boolean;
  paymentAmount: string;
  paymentNote: string;
  paymentErrors: { amount?: string; note?: string };
  setPaymentAmount: (value: string) => void;
  setPaymentNote: (value: string) => void;
  onStartPayment: () => void;
  onCancelPayment: () => void;
  onSavePayment: () => void;
  isEditingPlan: boolean;
  originalAmount: string;
  targetDate: string;
  description: string;
  planErrors: {
    originalAmount?: string;
    targetDate?: string;
    description?: string;
  };
  setOriginalAmount: (value: string) => void;
  setTargetDate: (value: string) => void;
  setDescription: (value: string) => void;
  onStartPlanEdit: () => void;
  onCancelPlanEdit: () => void;
  onSavePlan: () => void;
}) {
  const accentColor = "#EF4444";
  const schedule = calculateDebtSchedule(
    debt.balance,
    debt.original_amount,
    debt.target_date
  );

  return (
    <View style={[styles.goalCard, { borderLeftColor: accentColor }]}>
      <View style={styles.goalHeader}>
        <View style={styles.goalLeft}>
          <View style={styles.goalIcon}>
            <Feather name="credit-card" size={18} color={accentColor} />
          </View>

          <View style={styles.goalInfo}>
            <Text style={styles.goalName}>{debt.name}</Text>
            <Text style={styles.goalMeta}>
              Deuda vinculada · {formatDate(debt.target_date)}
            </Text>
          </View>
        </View>

        {schedule.status === "completed" ? (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>Liquidada</Text>
          </View>
        ) : (
          <View style={styles.debtAccountBadge}>
            <Text style={styles.debtAccountBadgeText}>Saldo real</Text>
          </View>
        )}
      </View>

      {debt.description && (
        <Text style={styles.goalDescription}>{debt.description}</Text>
      )}

      <View style={styles.goalAmountsRow}>
        <View>
          <Text style={styles.goalAmountLabel}>Ya abonado</Text>
          <Text style={styles.goalAmount}>
            {formatMoney(schedule.paidAmount, currency)}
          </Text>
        </View>

        <View style={styles.goalAmountRight}>
          <Text style={styles.goalAmountLabel}>Saldo pendiente</Text>
          <Text style={styles.goalAmount}>
            {formatMoney(schedule.balance, currency)}
          </Text>
        </View>
      </View>

      <View style={styles.goalProgressTrack}>
        <View
          style={[
            styles.goalProgressFill,
            {
              width: `${schedule.progress}%`,
              backgroundColor: accentColor,
            },
          ]}
        />
      </View>

      <View style={styles.goalFooterInfo}>
        <Text style={styles.goalProgressText}>
          {schedule.progress.toFixed(0)}% pagado
        </Text>
        <Text style={styles.goalRemainingText}>
          Inicial: {formatMoney(debt.original_amount, currency)}
        </Text>
      </View>

      {debt.last_payment && (
        <View style={styles.lastPaymentRow}>
          <Feather name="check-circle" size={15} color="#86EFAC" />
          <Text style={styles.lastPaymentText}>
            Último abono: {formatMoney(debt.last_payment.amount, currency)} ·{" "}
            {formatTimestamp(debt.last_payment.paid_at)}
          </Text>
        </View>
      )}

      <View style={styles.goalInsightBox}>
        <View style={styles.goalInsightHeader}>
          <View style={styles.goalInsightIcon}>
            <Feather name="zap" size={15} color={accentColor} />
          </View>
          <View style={styles.goalInsightHeaderText}>
            <Text style={styles.goalInsightTitle}>Plan inteligente de pago</Text>
            <Text style={styles.goalInsightSubtitle}>
              {getDeadlineLabel(schedule.daysRemaining)}
            </Text>
          </View>
        </View>

        {schedule.status === "active" ? (
          <>
            <View style={styles.goalInsightGrid}>
              <View style={styles.goalInsightStat}>
                <Text style={styles.goalInsightStatLabel}>Abono semanal</Text>
                <Text style={styles.goalInsightStatValue}>
                  {formatMoney(schedule.weeklyPayment || 0, currency)}
                </Text>
              </View>
              <View style={styles.goalInsightStat}>
                <Text style={styles.goalInsightStatLabel}>Abono mensual</Text>
                <Text style={styles.goalInsightStatValue}>
                  {formatMoney(schedule.monthlyPayment || 0, currency)}
                </Text>
              </View>
            </View>
            <Text style={styles.goalInsightMessage}>
              Estos montos se recalculan con el saldo y el plazo restantes.
            </Text>
          </>
        ) : (
          <Text
            style={[
              styles.goalInsightMessage,
              schedule.status === "overdue" && styles.goalInsightWarning,
            ]}
          >
            {schedule.status === "completed"
              ? "Deuda liquidada. Ya no tienes saldo pendiente."
              : schedule.status === "overdue"
                ? `El plazo venció y aún quedan ${formatMoney(
                    schedule.balance,
                    currency
                  )} por pagar.`
                : "Agrega una fecha límite para calcular los abonos recomendados."}
          </Text>
        )}
      </View>

      {isEditingPayment && (
        <View style={styles.editProgressBox}>
          <Text style={styles.inlineFormTitle}>Registrar abono</Text>
          <Text style={styles.inlineFormSubtitle}>
            El abono reducirá el saldo real de la deuda y quedará en el
            historial.
          </Text>

          <View style={styles.inlineField}>
            <Text style={styles.label}>Monto del abono</Text>
            <View
              style={[
                styles.inputWrapper,
                paymentErrors.amount && styles.inputWrapperError,
              ]}
            >
              <Text style={styles.currencyPrefix}>$</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="#64748B"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="decimal-pad"
                editable={!isSaving}
              />
            </View>
            <FieldError message={paymentErrors.amount} />
          </View>

          <View style={styles.inlineField}>
            <Text style={styles.label}>Nota opcional</Text>
            <View
              style={[
                styles.textAreaWrapper,
                paymentErrors.note && styles.inputWrapperError,
              ]}
            >
              <TextInput
                style={styles.textArea}
                placeholder="Ej. Abono de la primera quincena"
                placeholderTextColor="#64748B"
                value={paymentNote}
                onChangeText={setPaymentNote}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                editable={!isSaving}
              />
            </View>
            <FieldError message={paymentErrors.note} />
          </View>

          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onCancelPayment}
              disabled={isSaving}
            >
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.smallPrimaryButton,
                isSaving && styles.primaryButtonDisabled,
              ]}
              onPress={onSavePayment}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.smallPrimaryButtonText}>Guardar abono</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isEditingPlan && (
        <View style={styles.editProgressBox}>
          <Text style={styles.inlineFormTitle}>Editar plan de pago</Text>
          <Text style={styles.inlineFormSubtitle}>
            Ajusta el monto de referencia y la fecha límite de la deuda.
          </Text>

          <View style={styles.inlineField}>
            <Text style={styles.label}>Deuda inicial</Text>
            <View
              style={[
                styles.inputWrapper,
                planErrors.originalAmount && styles.inputWrapperError,
              ]}
            >
              <Text style={styles.currencyPrefix}>$</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="#64748B"
                value={originalAmount}
                onChangeText={setOriginalAmount}
                keyboardType="decimal-pad"
                editable={!isSaving}
              />
            </View>
            <FieldError message={planErrors.originalAmount} />
          </View>

          <View style={styles.inlineField}>
            <Text style={styles.label}>Fecha límite</Text>
            <View
              style={[
                styles.inputWrapper,
                planErrors.targetDate && styles.inputWrapperError,
              ]}
            >
              <Feather
                name="calendar"
                size={20}
                color="#9CA3AF"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="DD/MM/AAAA"
                placeholderTextColor="#64748B"
                value={targetDate}
                onChangeText={setTargetDate}
                keyboardType="number-pad"
                maxLength={10}
                editable={!isSaving}
              />
            </View>
            <FieldError message={planErrors.targetDate} />
          </View>

          <View style={styles.inlineField}>
            <Text style={styles.label}>Nota opcional</Text>
            <View
              style={[
                styles.textAreaWrapper,
                planErrors.description && styles.inputWrapperError,
              ]}
            >
              <TextInput
                style={styles.textArea}
                placeholder="Ej. Crédito automotriz a 24 meses"
                placeholderTextColor="#64748B"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                editable={!isSaving}
              />
            </View>
            <FieldError message={planErrors.description} />
          </View>

          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onCancelPlanEdit}
              disabled={isSaving}
            >
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.smallPrimaryButton,
                isSaving && styles.primaryButtonDisabled,
              ]}
              onPress={onSavePlan}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.smallPrimaryButtonText}>Guardar plan</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!isEditingPayment && !isEditingPlan && (
        <View style={styles.goalActions}>
          <TouchableOpacity
            style={styles.goalActionButton}
            onPress={onStartPlanEdit}
            disabled={isSaving}
          >
            <Feather name="calendar" size={16} color="#0b9387" />
            <Text style={styles.goalActionText}>Editar plan</Text>
          </TouchableOpacity>

          {schedule.balance > 0 && (
            <TouchableOpacity
              style={styles.debtPaymentButton}
              onPress={onStartPayment}
              disabled={isSaving}
            >
              <Feather name="dollar-sign" size={16} color="#FFFFFF" />
              <Text style={styles.debtPaymentButtonText}>Registrar abono</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function GoalCard({
  goal,
  currency,
  isEditing,
  editingAmount,
  editingAmountError,
  setEditingAmount,
  isSaving,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onComplete,
  onReopen,
  onEditDetails,
  onDelete,
}: {
  goal: FinancialGoal;
  currency: string;
  isEditing: boolean;
  editingAmount: string;
  editingAmountError: string | null;
  setEditingAmount: (value: string) => void;
  isSaving: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onEditDetails: () => void;
  onDelete: () => void;
}) {
  const progress =
    goal.target_amount > 0
      ? Math.min((goal.current_amount / goal.target_amount) * 100, 100)
      : 0;

  const remaining = Math.max(goal.target_amount - goal.current_amount, 0);
  const accentColor = getGoalAccent(goal.goal_type);
  const insight = getGoalInsight(goal);

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

      <GoalInsightBox goal={goal} insight={insight} currency={currency} />

      {isEditing ? (
        <View style={styles.editProgressBox}>
          <Text style={styles.label}>Nuevo avance</Text>

          <View
            style={[
              styles.inputWrapper,
              editingAmountError && styles.inputWrapperError,
            ]}
          >
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
          <FieldError message={editingAmountError} />

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
            onPress={onEditDetails}
            disabled={isSaving}
          >
            <Feather name="edit-2" size={16} color="#0b9387" />
            <Text style={styles.goalActionText}>Editar meta</Text>
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
            <>
              <TouchableOpacity
                style={styles.goalActionButton}
                onPress={onStartEdit}
                disabled={isSaving}
              >
                <Feather name="edit-3" size={16} color="#0b9387" />
                <Text style={styles.goalActionText}>Actualizar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.goalActionButton}
                onPress={onComplete}
                disabled={isSaving}
              >
                <Feather name="check-circle" size={16} color="#0b9387" />
                <Text style={styles.goalActionText}>Completar</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.goalDangerButton}
            onPress={onDelete}
            disabled={isSaving}
          >
            <Feather name="trash-2" size={16} color="#FCA5A5" />
            <Text style={styles.goalDangerText}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function GoalInsightBox({
  goal,
  insight,
  currency,
}: {
  goal: FinancialGoal;
  insight: ReturnType<typeof getGoalInsight>;
  currency: string;
}) {
  const accentColor = getGoalAccent(goal.goal_type);
  return (
    <View style={styles.goalInsightBox}>
      <View style={styles.goalInsightHeader}>
        <View style={styles.goalInsightIcon}>
          <Feather name="zap" size={15} color={accentColor} />
        </View>
        <View style={styles.goalInsightHeaderText}>
          <Text style={styles.goalInsightTitle}>Indicador inteligente</Text>
          <Text style={styles.goalInsightSubtitle}>
            {getDeadlineLabel(insight.daysRemaining)}
          </Text>
        </View>
      </View>
      {insight.status === "active" ? (
        <>
          <View style={styles.goalInsightGrid}>
            <View style={styles.goalInsightStat}>
              <Text style={styles.goalInsightStatLabel}>Por semana</Text>
              <Text style={styles.goalInsightStatValue}>
                {formatMoney(insight.requiredWeekly || 0, currency)}
              </Text>
            </View>
            <View style={styles.goalInsightStat}>
              <Text style={styles.goalInsightStatLabel}>Por mes</Text>
              <Text style={styles.goalInsightStatValue}>
                {formatMoney(insight.requiredMonthly || 0, currency)}
              </Text>
            </View>
          </View>
          <Text style={styles.goalInsightMessage}>
            Necesitas {insight.actionVerb}{" "}
            {formatMoney(insight.requiredWeekly || 0, currency)} por semana
            para cumplir esta meta a tiempo.
          </Text>
        </>
      ) : (
        <Text
          style={[
            styles.goalInsightMessage,
            insight.status === "overdue" && styles.goalInsightWarning,
          ]}
        >
          {insight.status === "overdue"
            ? `La fecha objetivo ya pasó. Aún faltan ${formatMoney(
                insight.remaining,
                currency
              )}.`
            : insight.message}
        </Text>
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

  successAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    padding: 16,
    borderRadius: 14,
    marginBottom: 22,
  },

  successAlertText: {
    color: "#86EFAC",
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

  debtSummaryCard: {
    backgroundColor: "rgba(127,29,29,0.22)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
  },

  debtSummaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },

  debtSummaryKicker: {
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  debtSummaryTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 5,
  },

  debtSummaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.13)",
    alignItems: "center",
    justifyContent: "center",
  },

  debtSummaryMetrics: {
    flexDirection: "row",
    gap: 12,
  },

  debtSummaryMetric: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.42)",
    borderRadius: 14,
    padding: 12,
  },

  debtSummaryMetricLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 5,
  },

  debtSummaryMetricValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
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

  inputWrapperError: {
    borderColor: "#EF4444",
    borderWidth: 1.5,
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

  debtAccountBadge: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  debtAccountBadgeText: {
    color: "#FCA5A5",
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

  goalInsightBox: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },

  goalInsightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  goalInsightIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(11,147,135,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  goalInsightHeaderText: {
    flex: 1,
  },

  goalInsightTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  goalInsightSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
  },

  goalInsightGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },

  goalInsightStat: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.75)",
    borderRadius: 14,
    padding: 12,
  },

  goalInsightStatLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
  },

  goalInsightStatValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  goalInsightMessage: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },

  goalInsightWarning: {
    color: "#FCA5A5",
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

  lastPaymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.2)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },

  lastPaymentText: {
    color: "#BBF7D0",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },

  goalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  goalActionButton: {
    flex: 1,
    flexBasis: "46%",
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

  debtPaymentButton: {
    flex: 1,
    flexBasis: "46%",
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#0b9387",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },

  debtPaymentButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  goalDangerButton: {
    flex: 1,
    flexBasis: "46%",
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },

  goalDangerText: {
    color: "#FCA5A5",
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

  inlineFormTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  inlineFormSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 14,
  },

  inlineField: {
    marginBottom: 14,
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
