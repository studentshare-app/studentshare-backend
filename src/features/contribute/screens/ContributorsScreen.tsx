import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C } from '@/lib/colors'
import { supabase } from '@/lib/supabase'
import { MATERIAL_CATEGORIES } from '@/constants/contentTypes'

type Contribution = {
  id: string
  title: string
  type: string
  file_url: string
  created_at: string
  download_count?: number
  profile_id?: string
  profiles?: {
    id: string
    full_name: string
    avatar_url?: string | null
  } | null
  courses?: {
    name?: string | null
  } | null
}

// Type for the raw Supabase response
type SupabaseMaterial = {
  id: string
  title: string
  type: string
  file_url: string
  created_at: string
  download_count?: number
  profile_id?: string
  profiles: {
    id: string
    full_name: string
    avatar_url?: string | null
  } | null
  courses: {
    name?: string | null
  } | null
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function deriveRating(downloads?: number): number {
  if (!downloads || downloads <= 0) return 4.0
  const computed = 4.0 + Math.min(1.0, Math.log10(downloads + 1) * 0.18)
  return Math.min(5, Math.max(3.5, computed))
}

export default function ContributorsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest')
  const [refreshing, setRefreshing] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Contribution | null>(null)

  const { data = [], isLoading, isError, refetch } = useQuery<Contribution[]>({
    queryKey: ['contributors-materials'],
    queryFn: async () => {
      const { data: materials, error } = await supabase
        .from('materials')
        .select('id, title, type, file_url, created_at, download_count, profile_id, profiles(id, full_name, avatar_url), courses(name)')
        .eq('is_public', true)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50) as { data: SupabaseMaterial[] | null; error: any }

      if (error) {
        throw new Error(error.message)
      }

      // Type the materials response and map to Contribution
      const typedMaterials = materials || []
      return typedMaterials.map(item => ({
        id: item.id,
        title: item.title,
        type: item.type,
        file_url: item.file_url,
        created_at: item.created_at,
        download_count: item.download_count,
        profile_id: item.profile_id,
        profiles: item.profiles,
        courses: item.courses,
      }))
    },
  })

  const filtered = useMemo(() => {
    return data.filter(item => {
      const searched = item.title.toLowerCase().includes(search.toLowerCase())
        || item.profiles?.full_name.toLowerCase().includes(search.toLowerCase())
        || item.courses?.name?.toLowerCase().includes(search.toLowerCase())

      const categoryMatch = selectedCategory === 'all' || item.type === selectedCategory

      return searched && categoryMatch
    })
  }, [data, search, selectedCategory])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === 'popular') {
        return (b.download_count ?? 0) - (a.download_count ?? 0)
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [filtered, sortBy])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } catch (err) {
      Alert.alert('Refresh failed', (err as Error).message || 'Unable to refresh contributions')
    } finally {
      setRefreshing(false)
    }
  }

  function renderItem({ item }: { item: Contribution }) {
    const author = item.profiles?.full_name || 'Community Member'
    const avatar = item.profiles?.avatar_url
    const courseName = item.courses?.name || 'Unknown course'
    const downloads = item.download_count ?? 0
    const rating = deriveRating(downloads)

    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => setSelectedItem(item)}>
        <View style={styles.cardHeader}>
          <View style={styles.authorRow}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={16} color="#FFFFFF" />
              </View>
            )}
            <View>
              <Text style={styles.authorLabel}>Shared by</Text>
              <Text style={styles.authorName}>{author}</Text>
            </View>
          </View>
          <Text style={styles.typePill}>{item.type === 'past_question_answer' ? 'Practice Qs' : item.type.charAt(0).toUpperCase() + item.type.slice(1)}</Text>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Ionicons name="calendar" size={14} color={C.textSub} />
            <Text style={styles.detailText}>{formatDate(item.created_at)}</Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="document-text" size={14} color={C.textSub} />
            <Text style={styles.detailText}>{courseName}</Text>
          </View>
        </View>

        <View style={styles.footerRow}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="download" size={14} color={C.orange} />
              <Text style={styles.statText}>{downloads}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="star" size={14} color={C.orange} />
              <Text style={styles.statText}>{rating.toFixed(1)}</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => Alert.alert('Saved', 'Resource saved to your library')} activeOpacity={0.8}>
              <Text style={styles.secondaryBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push(`/viewer?file_url=${encodeURIComponent(item.file_url)}&title=${encodeURIComponent(item.title)}&material_id=${item.id}`)}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>View</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const renderHeader = () => (
    <View>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Community Contributions</Text>
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.75}>
          <Ionicons name="notifications" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={C.textSub} style={{ marginLeft: 12 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search peer-uploaded documents..."
          placeholderTextColor={C.textSub}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ paddingHorizontal: 8 }}>
        {MATERIAL_CATEGORIES.map(filter => {
          const active = filter.id === selectedCategory
          return (
            <TouchableOpacity
              key={filter.id}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
              onPress={() => setSelectedCategory(filter.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : undefined]}>{filter.label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <TouchableOpacity
          style={[styles.sortButton, sortBy === 'newest' && styles.sortButtonActive]}
          onPress={() => setSortBy('newest')}
          activeOpacity={0.8}
        >
          <Text style={[styles.sortButtonText, sortBy === 'newest' && styles.sortButtonTextActive]}>Newest</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortButton, sortBy === 'popular' && styles.sortButtonActive]}
          onPress={() => setSortBy('popular')}
          activeOpacity={0.8}
        >
          <Text style={[styles.sortButtonText, sortBy === 'popular' && styles.sortButtonTextActive]}>Popular</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />
    </View>
  )

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.orange} />
        </View>
      ) : isError ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.errorMsg}>Failed to load contributions. Pull to retry.</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 12 }}
          ListEmptyComponent={<Text style={[styles.emptyMsg, { marginTop: 24 }]}>No contributions found.</Text>}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={selectedItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{selectedItem?.title}</Text>
            <Text style={styles.modalMeta}>Shared by {selectedItem?.profiles?.full_name || 'Community Member'}</Text>
            <Text style={styles.modalMeta}>Course: {selectedItem?.courses?.name || 'Unknown'}</Text>
            <Text style={styles.modalMeta}>{formatDate(selectedItem?.created_at ?? '')}</Text>
            <Text style={styles.modalDescription}>This resource is filed under {selectedItem?.type?.replace(/_/g, ' ') || 'N/A'} and has {selectedItem?.download_count ?? 0} downloads.</Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSelectedItem(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.raised,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.text,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: C.text,
    marginLeft: 4,
    paddingRight: 8,
  },
  chips: {
    marginBottom: 10,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginRight: 8,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: C.accentOrange,
    borderColor: C.accentOrange,
  },
  chipInactive: {
    backgroundColor: C.raised,
    borderColor: C.border,
  },
  chipText: {
    fontWeight: '600',
    fontSize: 12,
    color: C.textSub,
  },
  chipTextActive: {
    color: C.void,
  },
  card: {
    backgroundColor: C.raised,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: C.border,
  },
  avatarPlaceholder: {
    backgroundColor: C.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorLabel: {
    fontSize: 11,
    color: C.textSub,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  authorName: {
    fontSize: 13,
    color: C.text,
    fontWeight: '700',
  },
  typePill: {
    color: C.accentOrange,
    backgroundColor: C.accentOrange + '20',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 15,
    color: C.text,
    fontWeight: '800',
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: C.textSub,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: C.textSub,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 10,
    gap: 10,
  },
  sortLabel: {
    color: C.textSub,
    fontSize: 12,
    fontWeight: '700',
  },
  sortButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.raised,
  },
  sortButtonActive: {
    backgroundColor: C.accentOrange,
    borderColor: C.accentOrange,
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSub,
  },
  sortButtonTextActive: {
    color: C.void,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 8,
    marginVertical: 10,
    opacity: 0.45,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.raised,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
    marginBottom: 6,
  },
  modalMeta: {
    fontSize: 12,
    color: C.textSub,
    marginBottom: 4,
  },
  modalDescription: {
    fontSize: 13,
    color: C.text,
    marginVertical: 12,
  },
  modalCloseBtn: {
    backgroundColor: C.accentOrange,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: C.raised,
    borderColor: C.border,
    borderWidth: 1,
  },
  secondaryBtnText: {
    color: C.textSub,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: C.accentOrange,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyMsg: {
    textAlign: 'center',
    marginTop: 34,
    color: C.textSub,
    fontSize: 14,
  },
  errorMsg: {
    color: C.coral,
    fontSize: 14,
    fontWeight: '600',
  },
})
