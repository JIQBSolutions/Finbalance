import { Alert, Platform } from "react-native";

type ConfirmDestructiveActionOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

export function confirmDestructiveAction({
  title,
  message,
  confirmLabel = "Eliminar",
  onConfirm,
}: ConfirmDestructiveActionOptions) {
  if (Platform.OS === "web" && typeof globalThis.confirm === "function") {
    if (globalThis.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    {
      text: "Cancelar",
      style: "cancel",
    },
    {
      text: confirmLabel,
      style: "destructive",
      onPress: onConfirm,
    },
  ]);
}
