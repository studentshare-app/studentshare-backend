import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { usePendingSyncCount } from '../hooks/useLocalQueries';

const C = {
  textSub:    '#6E7A96', // Matching materials screen
  textMute:   '#353D52',
  emerald:    '#3DC99A',
  gold:       '#DFA83C',
  sapphire:   '#4B8CF5',
};

export function SyncIndicator() {
  const pendingCount = usePendingSyncCount();
  const [isConnected, setIsConnected] = useState(true);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (pendingCount > 0 && isConnected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [pendingCount, isConnected]);

  if (!isConnected) {
    return (
      <View style={s.container}>
        <Ionicons name="cloud-offline-outline" size={14} color={C.gold} />
        <Text allowFontScaling={false} style={[s.text, { color: C.gold }]}>Offline</Text>
      </View>
    );
  }

  if (pendingCount > 0) {
    return (
      <View style={s.container}>
        <Animated.View style={[s.dot, { backgroundColor: C.sapphire, opacity: pulseAnim }]} />
        <Text allowFontScaling={false} style={s.text}>Syncing {pendingCount}...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Ionicons name="cloud-done-outline" size={14} color={C.emerald} />
      <Text allowFontScaling={false} style={[s.text, { color: C.emerald }]}>Synced</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSub,
    letterSpacing: 0.2,
  },
});
