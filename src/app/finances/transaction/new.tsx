import { useLocalSearchParams } from "expo-router";
import { BusinessTransactionForm } from "../../../components/BusinessTransactionForm";
import { BusinessTransactionType } from "../../../lib/business-transactions";

export default function NewBusinessTransactionScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const initialType: BusinessTransactionType =
    params.type === "income" ? "income" : "expense";

  return <BusinessTransactionForm initialType={initialType} />;
}
