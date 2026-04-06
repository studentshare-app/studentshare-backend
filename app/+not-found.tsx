import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export default function NotFoundScreen() {
  const router = useRouter()
  
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={s.root}>
        <View style={s.icon}>
          <Ionicons name="chatbubble-ellipses" size={64} color={s.iconColor.color} />
        </View>
        <Text style={s.title}>Screen not found</Text>
        <Text style={s.subtitle}>The page you&#39;re looking for doesn&#39;t exist.</Text>
        <TouchableOpacity 
          onPress={() => router.navigate('/(tabs)')} 
          style={s.btn}
          activeOpacity={0.8}
        >
          <Ionicons name="home" size={20} color="#fff" />
          <Text style={s.btnText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    </>
  )
}

const s = StyleSheet.create({
  root:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F', gap: 20, padding: 40 },
  icon:     { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(232,105,42,0.1)', justifyContent: 'center', alignItems: 'center' },
  iconColor: { color: '#E8692A' },
  title:    { fontSize: 24, fontWeight: '800', color: '#F0F0F8', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#A0A8B8', textAlign: 'center', fontWeight: '500' },
  btn:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 16, backgroundColor: '#E8692A', borderRadius: 20 },
  btnText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
})
