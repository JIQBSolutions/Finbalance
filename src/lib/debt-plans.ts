export type DebtScheduleStatus =
  | "active"
  | "completed"
  | "no_date"
  | "overdue";

export type DebtSchedule = {
  status: DebtScheduleStatus;
  balance: number;
  paidAmount: number;
  progress: number;
  daysRemaining: number | null;
  weeklyPayment: number | null;
  monthlyPayment: number | null;
};

function getLocalDate(dateString?: string | null) {
  if (!dateString) return null;

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  date.setHours(0, 0, 0, 0);
  return date;
}

export function calculateDebtSchedule(
  currentBalance: number,
  originalAmount: number,
  targetDate?: string | null,
  now = new Date(),
): DebtSchedule {
  const balance = Math.max(Number(currentBalance || 0), 0);
  const original = Math.max(Number(originalAmount || 0), balance);
  const paidAmount = Math.max(original - balance, 0);
  const progress =
    original > 0 ? Math.min((paidAmount / original) * 100, 100) : 0;

  if (balance <= 0) {
    return {
      status: "completed",
      balance,
      paidAmount,
      progress: 100,
      daysRemaining: 0,
      weeklyPayment: 0,
      monthlyPayment: 0,
    };
  }

  const deadline = getLocalDate(targetDate);
  if (!deadline) {
    return {
      status: "no_date",
      balance,
      paidAmount,
      progress,
      daysRemaining: null,
      weeklyPayment: null,
      monthlyPayment: null,
    };
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const daysRemaining = Math.ceil(
    (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysRemaining < 0) {
    return {
      status: "overdue",
      balance,
      paidAmount,
      progress,
      daysRemaining,
      weeklyPayment: null,
      monthlyPayment: null,
    };
  }

  const weeklyInstallments = Math.max(Math.ceil(daysRemaining / 7), 1);
  const monthlyInstallments = Math.max(
    Math.ceil(daysRemaining / 30.4375),
    1,
  );

  return {
    status: "active",
    balance,
    paidAmount,
    progress,
    daysRemaining,
    weeklyPayment: balance / weeklyInstallments,
    monthlyPayment: balance / monthlyInstallments,
  };
}
