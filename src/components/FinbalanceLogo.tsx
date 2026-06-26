import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { useFonts } from 'expo-font';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

export type FinbalanceLogoProps = {
  variant?: 'light' | 'dark';
  style?: ViewStyle;
  width?: number;
  height?: number;
};

export function FinbalanceLogo({
  variant = 'light',
  style,
  width = 340,
  height = 90,
}: FinbalanceLogoProps) {
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

  return (
    <View style={[styles.container, style]}>
      <Svg width={width} height={height} viewBox="0 0 220 70" fill="none">
        <Rect x="25" y="14" width="64" height="46" rx="12" fill={boxColor} />
        <SvgText
          x="62"
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
          x="92"
          y="54"
          fontSize="42"
          fontWeight="500"
          fill={darkTextColor}
          fontFamily="ModernRomance"
        >
          balance
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
  },
});
