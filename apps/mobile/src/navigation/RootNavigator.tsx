import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ConsentScreen from '@/screens/Consent/ConsentScreen';
import OtpScreen from '@/screens/Otp/OtpScreen';
import HomeScreen from '@/screens/Home/HomeScreen';
import SmsLogScreen from '@/screens/SmsLog/SmsLogScreen';
import SettingsScreen from '@/screens/Settings/SettingsScreen';
import { AuthProvider, useAuth } from '@/lib/auth';
import { colors, fontSize, spacing } from '@/theme';

export type RootStackParamList = {
  Consent: undefined;
  Otp: { phone?: string } | undefined;
  Home: undefined;
  SmsLog: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigatorInner(): React.ReactElement {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.splashText}>GSTFlow</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
      {session ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'GSTFlow' }} />
          <Stack.Screen name="SmsLog" component={SmsLogScreen} options={{ title: 'SMS Log' }} />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings' }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Consent" component={ConsentScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Otp" component={OtpScreen} options={{ title: 'Verify your phone' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export function RootNavigator(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigatorInner />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  splashText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.primary,
  },
});

export default RootNavigator;
