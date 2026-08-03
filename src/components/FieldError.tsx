import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <View style={styles.container} accessibilityRole="alert">
      <Feather name="alert-circle" size={14} color="#FCA5A5" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 7,
  },
  text: {
    color: "#FCA5A5",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    flex: 1,
  },
});
