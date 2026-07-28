import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { ThemedText } from './themed-text';
import { Colors } from '@/constants/theme';
import { useThemeContext } from '@/hooks/ThemeProvider';

interface CircularGaugeProps {
  score: number;
  size?: number;
}

export function CircularGauge({ score, size = 120 }: CircularGaugeProps) {
  const { activeTheme } = useThemeContext();
  const theme = Colors[activeTheme];
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: score,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [score]);

  // Determine color based on score
  let scoreColor = theme.scoreGreen;
  if (score < 50) {
    scoreColor = theme.scoreRed;
  } else if (score < 80) {
    scoreColor = theme.scoreYellow;
  }

  const radius = size / 2;
  const strokeWidth = 12;
  const innerRadius = radius - strokeWidth;

  const rotate = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: ['-90deg', '90deg'],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { width: size, height: radius }]}>
      {/* Background Half Circle */}
      <View
        style={[
          styles.halfCircle,
          {
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: strokeWidth,
            borderColor: theme.border,
            borderBottomWidth: 0,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          },
        ]}
      />

      {/* Foreground Half Circle (Animated) */}
      <View
        style={[
          styles.maskContainer,
          { width: size, height: radius },
        ]}
      >
        <Animated.View
          style={[
            styles.animatedCircle,
            {
              width: size,
              height: size,
              borderRadius: radius,
              borderWidth: strokeWidth,
              borderColor: scoreColor,
              borderBottomColor: 'transparent',
              borderLeftColor: 'transparent',
              transform: [{ rotate: '-45deg' }, { rotate }],
            },
          ]}
        />
      </View>

      {/* Inner Content (Score Text) */}
      <View style={styles.scoreContainer}>
        <ThemedText style={{ fontSize: size * 0.25, fontWeight: 'bold', color: scoreColor }}>
          {score}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  halfCircle: {
    position: 'absolute',
    top: 0,
    borderBottomWidth: 0,
  },
  maskContainer: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  animatedCircle: {
    position: 'absolute',
    top: 0,
  },
  scoreContainer: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    paddingBottom: 4,
  },
});
