// features/home/hooks/useAvatarUpload.ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import { type QueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Linking } from 'react-native'
import { supabase } from '@/core/api/supabase'
import {
  AVATAR_LOCK_KEY,
  AVATAR_LOCK_TTL_MS,
  AVATAR_QUEUE_KEY,
  DASHBOARD_CACHE_KEY,
  MAX_AVATAR_BYTES,
} from '@/features/home/constants'
import { base64ToBytes, retryPendingAvatarUpload } from '@/features/home/api/home'
import type { PendingAvatarUpload } from '@/features/home/types'
import { lockAvatarRefetch } from '@/core/utils/avatarLock'

async function updateCachedAvatar(userId: string, avatarUrl: string) {
  const cached = await AsyncStorage.getItem(DASHBOARD_CACHE_KEY)
    .then(raw => (raw ? JSON.parse(raw) : null))
    .catch(() => null)

  if (!cached) return

  await AsyncStorage.setItem(
    DASHBOARD_CACHE_KEY,
    JSON.stringify({ ...cached, profile: { ...cached.profile, avatar_url: avatarUrl } })
  ).catch(() => {})
}

export function useAvatarUpload({
  userId,
  isOnline,
  queryClient,
}: {
  userId: string | null
  isOnline: boolean
  queryClient: QueryClient
}) {
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarRetryRanRef = useRef(false)

  useEffect(() => {
    if (userId && isOnline && !avatarRetryRanRef.current) {
      avatarRetryRanRef.current = true
      retryPendingAvatarUpload(queryClient).catch(() => {})
    }
    if (!isOnline) avatarRetryRanRef.current = false
  }, [userId, isOnline, queryClient])

  const pickAndUploadAvatar = useCallback(async () => {
    if (!userId) return

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(
        'Photo access required',
        'Please allow photo library access in Settings to change your profile picture.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      )
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    })
    if (result.canceled) return

    const asset = result.assets[0]

    // ✅ S3: fileSize can be undefined on some Android versions.
    // Fall back to estimating from base64 length when unavailable.
    const fileSizeBytes: number = (() => {
      if (typeof asset.fileSize === 'number' && asset.fileSize > 0) {
        return asset.fileSize
      }
      // base64 encodes 3 bytes per 4 chars; subtract padding
      if (asset.base64) {
        const padding = (asset.base64.endsWith('==') ? 2 : asset.base64.endsWith('=') ? 1 : 0)
        return Math.floor((asset.base64.length * 3) / 4) - padding
      }
      return 0
    })()

    if (fileSizeBytes > MAX_AVATAR_BYTES) {
      Alert.alert(
        'Image too large',
        `Please choose an image under ${MAX_AVATAR_BYTES / (1024 * 1024)} MB. (Yours is ~${(fileSizeBytes / 1_048_576).toFixed(1)} MB)`
      )
      return
    }

    const rawExt = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg'
    const fileExt = ['heic', 'heif'].includes(rawExt) ? 'jpg' : rawExt
    const timestamp = Date.now()
    const fileName = `${userId}.${fileExt}`

    setUploadingAvatar(true)
    try {
      if (!isOnline) {
        const pending: PendingAvatarUpload = {
          localUri: asset.uri,
          base64: asset.base64 ?? undefined,
          fileExt,
          userId,
          queuedAt: timestamp,
          retryCount: 0,
        }
        await AsyncStorage.setItem(AVATAR_QUEUE_KEY, JSON.stringify(pending)).catch(() => {})
        const localUrl = `${asset.uri}?local=${timestamp}`
        queryClient.setQueryData(['dashboard', userId], (old: any) =>
          old ? { ...old, profile: { ...old.profile, avatar_url: localUrl } } : old
        )
        await updateCachedAvatar(userId, localUrl)
        Alert.alert('Saved offline', "You're offline. Your photo will upload when you reconnect.")
        return
      }

      const b64 = asset.base64
      if (!b64) throw new Error('Picker did not return image data.')

      const byteArray = base64ToBytes(b64)
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, byteArray, { contentType: `image/${fileExt}`, upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const newUrl = `${urlData.publicUrl}?t=${timestamp}`

      await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() })
        .eq('id', userId)

      lockAvatarRefetch()
      await AsyncStorage.setItem(AVATAR_LOCK_KEY, String(timestamp)).catch(() => {})
      queryClient.setQueryData(['dashboard', userId], (old: any) =>
        old
          ? {
              ...old,
              profile: { ...old.profile, avatar_url: newUrl },
              materials: old.materials ?? [],
              stats: old.stats ?? {},
            }
          : old
      )
      await updateCachedAvatar(userId, newUrl)

      setTimeout(async () => {
        const lockTime = await AsyncStorage.getItem(AVATAR_LOCK_KEY)
          .then(v => (v ? Number(v) : 0))
          .catch(() => 0)
        if (Date.now() - lockTime < AVATAR_LOCK_TTL_MS) return
        queryClient.invalidateQueries({ queryKey: ['dashboard', userId] })
      }, AVATAR_LOCK_TTL_MS)

      Alert.alert('Done', 'Profile picture updated!')
    } catch (err: any) {
      Alert.alert(
        'Upload failed',
        err?.message || err?.error_description || JSON.stringify(err) || 'Could not upload profile picture.'
      )
    } finally {
      setUploadingAvatar(false)
    }
  }, [isOnline, queryClient, userId])

  return {
    uploadingAvatar,
    pickAndUploadAvatar,
  }
}