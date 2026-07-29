import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  TouchableWithoutFeedback,
  DeviceEventEmitter,
} from 'react-native';
import { ThemedText } from './themed-text';
import { Colors } from '@/constants/theme';
import { useThemeContext } from '@/hooks/ThemeProvider';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertData {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: { cancelable?: boolean };
}

export const CustomAlert = {
  alert: (title: string, message?: string, buttons?: AlertButton[], options?: { cancelable?: boolean }) => {
    DeviceEventEmitter.emit('goster_ozel_alert', { title, message, buttons, options });
  }
};

export function OzelAlertRoot() {
  const { activeTheme } = useThemeContext();
  const [alertData, setAlertData] = useState<AlertData | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('goster_ozel_alert', (data: AlertData) => {
      setAlertData(data);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        })
      ]).start();
    });

    return () => {
      subscription.remove();
    };
  }, [opacity, scale]);

  const closeAlert = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.95,
        duration: 150,
        useNativeDriver: true,
      })
    ]).start(() => {
      setAlertData(null);
    });
  };

  const handleButtonPress = (button: AlertButton) => {
    closeAlert();
    if (button.onPress) {
      setTimeout(() => button.onPress!(), 200);
    }
  };

  if (!alertData) return null;

  const buttons = alertData.buttons && alertData.buttons.length > 0
    ? alertData.buttons
    : [{ text: 'Tamam', style: 'default' as const }];

  const theme = activeTheme === 'dark' ? 'dark' : 'light';
  const backgroundColor = Colors[theme].surface;
  const textColor = Colors[theme].text;
  const overlayColor = 'rgba(0,0,0,0.5)';
  const primaryColor = Colors[theme].tint;
  const dangerColor = Colors[theme].danger;
  const borderColor = Colors[theme].border;

  return (
    <Modal transparent visible={!!alertData} animationType="none" onRequestClose={() => {
      if (alertData.options?.cancelable !== false) closeAlert();
    }}>
      <TouchableWithoutFeedback onPress={() => {
        if (alertData.options?.cancelable !== false) closeAlert();
      }}>
        <View style={[styles.overlay, { backgroundColor: overlayColor }]}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.alertBox, { backgroundColor, opacity, transform: [{ scale }] }]}>
              <ThemedText type="subtitle" style={[styles.title, { color: textColor }]}>{alertData.title}</ThemedText>
              {alertData.message ? (
                <ThemedText style={[styles.message, { color: textColor }]}>{alertData.message}</ThemedText>
              ) : null}
              
              <View style={[
                styles.buttonContainer, 
                buttons.length > 2 ? styles.buttonContainerVertical : styles.buttonContainerHorizontal
              ]}>
                {buttons.map((btn, index) => {
                  const isCancel = btn.style === 'cancel';
                  const isDestructive = btn.style === 'destructive';
                  
                  let btnBgColor = 'transparent';
                  let btnTextColor = primaryColor;
                  let customBorderWidth = 0;
                  
                  if (isDestructive) {
                    btnTextColor = dangerColor;
                  } else if (isCancel) {
                     // For cancel
                     btnBgColor = 'transparent';
                     btnTextColor = textColor;
                     customBorderWidth = 1;
                  } else if (buttons.length <= 2) {
                    // For primary button in 1-2 button layouts
                    btnBgColor = primaryColor;
                    btnTextColor = '#FFFFFF';
                  }

                  return (
                    <TouchableOpacity
                      key={index}
                      activeOpacity={0.7}
                      style={[
                        styles.button,
                        buttons.length > 2 ? styles.buttonVertical : styles.buttonHorizontal,
                        { 
                          backgroundColor: btnBgColor, 
                          borderColor: borderColor,
                          borderWidth: buttons.length > 2 ? 1 : customBorderWidth
                        }
                      ]}
                      onPress={() => handleButtonPress(btn)}
                    >
                      <ThemedText style={[
                        styles.buttonText, 
                        { color: btnTextColor }, 
                        !isCancel && !isDestructive ? { fontWeight: '600' } : null
                      ]}>
                        {btn.text || 'Tamam'}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24, // Yumuşak köşeler
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
    opacity: 0.8,
  },
  buttonContainer: {
    width: '100%',
  },
  buttonContainerHorizontal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  buttonContainerVertical: {
    flexDirection: 'column',
    gap: 10,
  },
  button: {
    borderRadius: 14, // Yumuşak butonlar
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  buttonHorizontal: {
    flex: 1,
  },
  buttonVertical: {
    width: '100%',
  },
  buttonText: {
    fontSize: 16,
  }
});
