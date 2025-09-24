import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, StyleSheet, ViewProps } from 'react-native';
import theme from '../theme';

export function Screen({ children, style }: { children: React.ReactNode; style?: any }) {
  return <SafeAreaView style={[styles.screen, style]}>{children}</SafeAreaView>;
}

export function Container({ children, style, ...rest }: { children: React.ReactNode } & ViewProps) {
  return (
    <View {...rest} style={[styles.container, style]}>
      {children}
    </View>
  );
}

export function SectionCard({ children, style, ...rest }: { children: React.ReactNode } & ViewProps) {
  return (
    <View {...rest} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  container: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  card: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 16 },
});

export default { Screen, Container, SectionCard };

