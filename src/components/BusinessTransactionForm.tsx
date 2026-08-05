import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  BusinessTransactionType,
  createBusinessTransaction,
  getBusinessTransaction,
  getCategoriesForType,
  listOperationalAccounts,
  OperationalAccount,
  updateBusinessTransaction,
} from "../lib/business-transactions";
import {
  formatDateInput,
  formatIsoDateForInput,
  formatMoneyInput,
  parseDateInputToIso,
  parseMoneyInput,
} from "../lib/form-formats";
import { getCurrentWorkspace, Workspace } from "../lib/workspaces";
import { FieldError } from "./FieldError";

type TransactionFormErrors = {
  account?: string;
  description?: string;
  amount?: string;
  date?: string;
  category?: string;
  counterparty?: string;
  reference?: string;
  notes?: string;
};

type Props = {
  transactionId?: string;
  initialType?: BusinessTransactionType;
};

function getTodayInput() {
  const today = new Date();
  return [
    String(today.getDate()).padStart(2, "0"),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getFullYear()),
  ].join("/");
}

function getTodayIso() {
  const today = new Date();
  return [
    String(today.getFullYear()),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatMoney(amount: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(amount);
}

export function BusinessTransactionForm({
  transactionId,
  initialType = "expense",
}: Props) {
  const router = useRouter();
  const isEditing = Boolean(transactionId);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [accounts, setAccounts] = useState<OperationalAccount[]>([]);
  const [transactionType, setTransactionType] =
    useState<BusinessTransactionType>(initialType);
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayInput());
  const [category, setCategory] = useState<string>(
    getCategoriesForType(initialType)[0]
  );
  const [counterparty, setCounterparty] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TransactionFormErrors>({});

  const currency = workspace?.currency || "MXN";
  const categories = useMemo(
    () => getCategoriesForType(transactionType),
    [transactionType]
  );
  const selectedAccount = accounts.find(
    (account) => account.account_id === accountId
  );

  const loadForm = useCallback(async () => {
    setGlobalError(null);
    try {
      const currentWorkspace = await getCurrentWorkspace();
      if (!currentWorkspace) {
        router.replace("/dashboard/onboarding");
        return;
      }

      setWorkspace(currentWorkspace);
      if (currentWorkspace.workspace_type !== "business") {
        setGlobalError(
          "El registro manual de ingresos y gastos está disponible únicamente en workspaces de empresa."
        );
        return;
      }

      const operationalAccounts = await listOperationalAccounts(
        currentWorkspace.id
      );
      setAccounts(operationalAccounts);

      if (transactionId) {
        const transaction = await getBusinessTransaction(
          currentWorkspace.id,
          transactionId
        );
        setTransactionType(transaction.transaction_type);
        setAccountId(transaction.account_id);
        setDescription(transaction.description);
        setAmount(formatMoneyInput(String(transaction.amount)));
        setDate(formatIsoDateForInput(transaction.transaction_date));
        setCategory(transaction.category);
        setCounterparty(transaction.counterparty || "");
        setReference(transaction.reference || "");
        setNotes(transaction.notes || "");
      } else if (operationalAccounts.length > 0) {
        setAccountId(operationalAccounts[0].account_id);
      }
    } catch (error: any) {
      setGlobalError(
        error.message || "No pudimos preparar el formulario del movimiento."
      );
    } finally {
      setIsLoading(false);
    }
  }, [router, transactionId]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const changeType = (nextType: BusinessTransactionType) => {
    if (nextType === transactionType) return;
    setTransactionType(nextType);
    setCategory(getCategoriesForType(nextType)[0]);
    setFieldErrors((current) => ({ ...current, category: undefined }));
  };

  const validate = () => {
    const nextErrors: TransactionFormErrors = {};
    const parsedAmount = parseMoneyInput(amount);
    const isoDate = parseDateInputToIso(date);

    if (!accountId) {
      nextErrors.account = "Selecciona la cuenta donde se reflejará el movimiento.";
    }

    if (!description.trim()) {
      nextErrors.description = "Ingresa el concepto del movimiento.";
    } else if (description.trim().length > 100) {
      nextErrors.description = "El concepto no puede exceder 100 caracteres.";
    }

    if (parsedAmount === null || parsedAmount <= 0) {
      nextErrors.amount =
        "Ingresa un monto mayor a cero; usa comas para miles y punto para centavos.";
    } else if (
      !isEditing &&
      transactionType === "expense" &&
      selectedAccount &&
      parsedAmount > selectedAccount.balance
    ) {
      nextErrors.amount = `El gasto supera el saldo disponible (${formatMoney(
        selectedAccount.balance,
        currency
      )}).`;
    }

    if (!isoDate) {
      nextErrors.date = "Ingresa una fecha válida en formato DD/MM/AAAA.";
    } else if (isoDate > getTodayIso()) {
      nextErrors.date = "La fecha del movimiento no puede estar en el futuro.";
    }

    if (!category.trim()) {
      nextErrors.category = "Selecciona una categoría.";
    }

    if (counterparty.trim().length > 80) {
      nextErrors.counterparty =
        "El cliente o proveedor no puede exceder 80 caracteres.";
    }

    if (reference.trim().length > 60) {
      nextErrors.reference = "La referencia no puede exceder 60 caracteres.";
    }

    if (notes.trim().length > 300) {
      nextErrors.notes = "Las notas no pueden exceder 300 caracteres.";
    }

    setFieldErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      parsedAmount,
      isoDate,
    };
  };

  const handleSave = async () => {
    setGlobalError(null);
    const validation = validate();
    if (
      !validation.isValid ||
      validation.parsedAmount === null ||
      !validation.isoDate ||
      !workspace
    ) {
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        workspaceId: workspace.id,
        accountId,
        transactionType,
        amount: validation.parsedAmount,
        description,
        category,
        transactionDate: validation.isoDate,
        counterparty,
        reference,
        notes,
      };

      if (transactionId) {
        await updateBusinessTransaction(transactionId, payload);
        router.replace(`/finances/transaction/${transactionId}` as any);
      } else {
        const newTransactionId = await createBusinessTransaction(payload);
        router.replace(`/finances/transaction/${newTransactionId}` as any);
      }
    } catch (error: any) {
      setGlobalError(
        error.message ||
          (isEditing
            ? "No pudimos actualizar el movimiento."
            : "No pudimos registrar el movimiento.")
      );
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
          <Text style={styles.loadingText}>Preparando movimiento...</Text>
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
          <Text style={styles.restrictedTitle}>Función para empresas</Text>
          <Text style={styles.restrictedText}>{globalError}</Text>
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
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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
              <Text style={styles.kicker}>MOVIMIENTO MANUAL</Text>
              <Text style={styles.title}>
                {isEditing ? "Editar movimiento" : "Nuevo ingreso o gasto"}
              </Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Feather name="activity" size={18} color="#5EEAD4" />
            <Text style={styles.infoText}>
              Al guardar se actualiza el saldo de la cuenta y se genera un
              snapshot para mantener consistente todo tu historial.
            </Text>
          </View>

          {globalError && (
            <View style={styles.errorAlert}>
              <Feather name="alert-triangle" size={18} color="#FCA5A5" />
              <Text style={styles.errorAlertText}>{globalError}</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tipo de movimiento</Text>
            <View style={styles.typeRow}>
              <TypeButton
                type="income"
                selected={transactionType === "income"}
                onPress={() => changeType("income")}
              />
              <TypeButton
                type="expense"
                selected={transactionType === "expense"}
                onPress={() => changeType("expense")}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cuenta operativa</Text>
            <Text style={styles.sectionHint}>
              El saldo se ajustará automáticamente al guardar.
            </Text>
            {accounts.length > 0 ? (
              <View style={styles.accountList}>
                {accounts.map((account) => {
                  const selected = account.account_id === accountId;
                  return (
                    <TouchableOpacity
                      key={account.account_id}
                      style={[
                        styles.accountCard,
                        selected && styles.accountCardSelected,
                        fieldErrors.account && styles.fieldInvalid,
                      ]}
                      onPress={() => {
                        setAccountId(account.account_id);
                        setFieldErrors((current) => ({
                          ...current,
                          account: undefined,
                        }));
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.accountLeft}>
                        <View
                          style={[
                            styles.accountIcon,
                            selected && styles.accountIconSelected,
                          ]}
                        >
                          <Feather
                            name={
                              account.account_type === "bank"
                                ? "credit-card"
                                : "dollar-sign"
                            }
                            size={17}
                            color={selected ? "#FFFFFF" : "#0b9387"}
                          />
                        </View>
                        <View>
                          <Text style={styles.accountName}>
                            {account.account_name}
                          </Text>
                          <Text style={styles.accountType}>
                            {account.account_type === "bank"
                              ? "Banco"
                              : "Efectivo"}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.accountBalance}>
                        {formatMoney(account.balance, currency)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyAccounts}>
                <Text style={styles.emptyAccountsText}>
                  Primero crea una cuenta de banco o efectivo.
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/finances/accounts")}
                >
                  <Text style={styles.inlineLink}>Ir a cuentas</Text>
                </TouchableOpacity>
              </View>
            )}
            <FieldError message={fieldErrors.account} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos principales</Text>
            <FormField label="Concepto" error={fieldErrors.description}>
              <TextInput
                value={description}
                onChangeText={(value) => {
                  setDescription(value);
                  setFieldErrors((current) => ({
                    ...current,
                    description: undefined,
                  }));
                }}
                placeholder={
                  transactionType === "income"
                    ? "Ej. Venta pedido 1042"
                    : "Ej. Compra de inventario"
                }
                placeholderTextColor="#64748B"
                maxLength={100}
                style={[
                  styles.input,
                  fieldErrors.description && styles.inputInvalid,
                ]}
              />
            </FormField>

            <FormField label="Monto" error={fieldErrors.amount}>
              <View
                style={[
                  styles.moneyInputContainer,
                  fieldErrors.amount && styles.inputInvalid,
                ]}
              >
                <Text style={styles.moneyPrefix}>$</Text>
                <TextInput
                  value={amount}
                  onChangeText={(value) => {
                    setAmount(formatMoneyInput(value));
                    setFieldErrors((current) => ({
                      ...current,
                      amount: undefined,
                    }));
                  }}
                  placeholder="0.00"
                  placeholderTextColor="#64748B"
                  keyboardType="decimal-pad"
                  style={styles.moneyInput}
                />
                <Text style={styles.currencySuffix}>{currency}</Text>
              </View>
            </FormField>

            <FormField label="Fecha" error={fieldErrors.date}>
              <View
                style={[
                  styles.dateInputContainer,
                  fieldErrors.date && styles.inputInvalid,
                ]}
              >
                <Feather name="calendar" size={17} color="#64748B" />
                <TextInput
                  value={date}
                  onChangeText={(value) => {
                    setDate(formatDateInput(value));
                    setFieldErrors((current) => ({
                      ...current,
                      date: undefined,
                    }));
                  }}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                  maxLength={10}
                  style={styles.dateInput}
                />
              </View>
            </FormField>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Categoría</Text>
            <View style={styles.chipRow}>
              {categories.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.chip,
                    category === item && styles.chipSelected,
                  ]}
                  onPress={() => {
                    setCategory(item);
                    setFieldErrors((current) => ({
                      ...current,
                      category: undefined,
                    }));
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.chipText,
                      category === item && styles.chipTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <FieldError message={fieldErrors.category} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detalle adicional</Text>
            <Text style={styles.sectionHint}>
              Estos campos son opcionales y facilitan la conciliación.
            </Text>
            <FormField
              label={
                transactionType === "income"
                  ? "Cliente u origen"
                  : "Proveedor o beneficiario"
              }
              error={fieldErrors.counterparty}
            >
              <TextInput
                value={counterparty}
                onChangeText={(value) => {
                  setCounterparty(value);
                  setFieldErrors((current) => ({
                    ...current,
                    counterparty: undefined,
                  }));
                }}
                placeholder="Nombre opcional"
                placeholderTextColor="#64748B"
                maxLength={80}
                style={[
                  styles.input,
                  fieldErrors.counterparty && styles.inputInvalid,
                ]}
              />
            </FormField>

            <FormField label="Referencia" error={fieldErrors.reference}>
              <TextInput
                value={reference}
                onChangeText={(value) => {
                  setReference(value);
                  setFieldErrors((current) => ({
                    ...current,
                    reference: undefined,
                  }));
                }}
                placeholder="Folio, factura o referencia bancaria"
                placeholderTextColor="#64748B"
                maxLength={60}
                style={[
                  styles.input,
                  fieldErrors.reference && styles.inputInvalid,
                ]}
              />
            </FormField>

            <FormField label="Notas" error={fieldErrors.notes}>
              <TextInput
                value={notes}
                onChangeText={(value) => {
                  setNotes(value);
                  setFieldErrors((current) => ({
                    ...current,
                    notes: undefined,
                  }));
                }}
                placeholder="Información útil para recordar este movimiento"
                placeholderTextColor="#64748B"
                maxLength={300}
                multiline
                textAlignVertical="top"
                style={[
                  styles.input,
                  styles.notesInput,
                  fieldErrors.notes && styles.inputInvalid,
                ]}
              />
            </FormField>
          </View>

          <TouchableOpacity
            style={[
              styles.saveButton,
              (isSaving || accounts.length === 0) && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={isSaving || accounts.length === 0}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather name="check" size={19} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>
                  {isEditing ? "Guardar corrección" : "Registrar movimiento"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TypeButton({
  type,
  selected,
  onPress,
}: {
  type: BusinessTransactionType;
  selected: boolean;
  onPress: () => void;
}) {
  const isIncome = type === "income";
  const accent = isIncome ? "#22C55E" : "#F87171";

  return (
    <TouchableOpacity
      style={[
        styles.typeButton,
        selected && {
          borderColor: accent,
          backgroundColor: isIncome
            ? "rgba(34,197,94,0.12)"
            : "rgba(248,113,113,0.12)",
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.typeIcon,
          { backgroundColor: `${accent}22` },
        ]}
      >
        <Feather
          name={isIncome ? "arrow-down-left" : "arrow-up-right"}
          size={18}
          color={accent}
        />
      </View>
      <View>
        <Text style={styles.typeTitle}>
          {isIncome ? "Ingreso" : "Gasto"}
        </Text>
        <Text style={styles.typeDescription}>
          {isIncome ? "Aumenta el saldo" : "Reduce el saldo"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      <FieldError message={error} />
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
    paddingTop: 36,
    paddingBottom: 48,
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
    alignItems: "center",
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
  headerText: {
    flex: 1,
  },
  kicker: {
    color: "#0b9387",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    backgroundColor: "rgba(20,184,166,0.09)",
    borderWidth: 1,
    borderColor: "rgba(94,234,212,0.22)",
    borderRadius: 16,
    padding: 15,
    marginBottom: 18,
  },
  infoText: {
    color: "#CCFBF1",
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
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
    marginBottom: 18,
  },
  errorAlertText: {
    color: "#FCA5A5",
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 22,
    padding: 17,
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  sectionHint: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  typeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  typeButton: {
    flex: 1,
    minHeight: 82,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  typeTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  typeDescription: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 3,
  },
  accountList: {
    gap: 9,
  },
  accountCard: {
    minHeight: 68,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  accountCardSelected: {
    borderColor: "#0b9387",
    backgroundColor: "rgba(11,147,135,0.11)",
  },
  accountLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  accountIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(11,147,135,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  accountIconSelected: {
    backgroundColor: "#0b9387",
  },
  accountName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  accountType: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
  accountBalance: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "900",
  },
  fieldInvalid: {
    borderColor: "#F87171",
  },
  emptyAccounts: {
    borderRadius: 15,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  emptyAccountsText: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
  },
  inlineLink: {
    color: "#5EEAD4",
    fontSize: 13,
    fontWeight: "900",
  },
  field: {
    marginTop: 13,
  },
  label: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
  },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    color: "#FFFFFF",
    paddingHorizontal: 14,
    fontSize: 15,
  },
  inputInvalid: {
    borderColor: "#F87171",
  },
  moneyInputContainer: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  moneyPrefix: {
    color: "#5EEAD4",
    fontSize: 20,
    fontWeight: "900",
    marginRight: 7,
  },
  moneyInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    paddingVertical: 12,
  },
  currencySuffix: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "900",
  },
  dateInputContainer: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
  },
  dateInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 12,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipSelected: {
    backgroundColor: "rgba(11,147,135,0.16)",
    borderColor: "#0b9387",
  },
  chipText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  notesInput: {
    minHeight: 96,
    paddingTop: 13,
    paddingBottom: 13,
  },
  saveButton: {
    minHeight: 56,
    borderRadius: 17,
    backgroundColor: "#0b9387",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 4,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
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
  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
