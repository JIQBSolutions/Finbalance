import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

export type FinbalanceLogoProps = {
  variant?: 'light' | 'dark';
  style?: ViewStyle;
  width?: number;
  height?: number;
  linkToDashboard?: boolean;
};

export function FinbalanceLogo({
  variant = 'light',
  style,
  width = 250,
  height = 90,
  linkToDashboard = true,
}: FinbalanceLogoProps) {
  const router = useRouter();

  const handlePress = () => {
    if (linkToDashboard) {
      router.push('/dashboard/dashboard');
    }
  };
  const [fontsLoaded] = useFonts({
    ModernRomance: require('../../assets/fonts/Modern Romance.otf'),
  });

  const textColor = variant === 'light' ? '#ffffff' : '#0b9387';
  const darkTextColor = variant === 'dark' ? '#0b9387' : '#ffffff';
  const boxColor = variant === 'light' ? '#ffffff' : '#0b9387';
  const boxTextColor = variant === 'light' ? '#0b9387' : '#0D1B2A';

  if (!fontsLoaded) {
    return <View style={style} />;
  }

  const LogoContent = (
    <Svg width={width} height={height} viewBox="0 0 200 70" fill="none">
      <Rect x="0" y="14" width="64" height="46" rx="12" fill={boxColor} />
      <SvgText
        x="36"
        y="54"
        fontSize="42"
        fontWeight="500"
        fill={boxTextColor}
        fontFamily="ModernRomance"
        textAnchor="middle"
      >
        Fin
      </SvgText>
      <SvgText
        x="66"
        y="54"
        fontSize="42"
        fontWeight="500"
        fill={darkTextColor}
        fontFamily="ModernRomance"
      >
        balance
      </SvgText>
    </Svg>
  );

  if (linkToDashboard) {
    return (
      <Pressable
        onPress={handlePress}
        style={[styles.container, style]}
        accessibilityRole="button"
      >
        {LogoContent}
      </Pressable>
    );
  }

  return <View style={[styles.container, style]}>{LogoContent}</View>;
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
  },
});
