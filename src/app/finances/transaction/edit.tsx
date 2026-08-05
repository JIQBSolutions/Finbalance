import { useLocalSearchParams } from "expo-router";
import { BusinessTransactionForm } from "../../../components/BusinessTransactionForm";

export default function EditBusinessTransactionScreen() {
  const params = useLocalSearchParams<{ id?: string }>();

  return <BusinessTransactionForm transactionId={params.id} />;
}
