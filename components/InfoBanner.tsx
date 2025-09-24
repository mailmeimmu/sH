import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Info } from 'lucide-react-native';
import theme from '../theme';

export default function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.container}>
      <Info size={16} color={theme.colors.brandPrimary} />
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  text: { color: theme.colors.textSecondary, fontSize: 13, flex: 1 },
});

