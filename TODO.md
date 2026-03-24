# Offline Functionality Completion Plan

## Status: 🚀 In Progress

### 1. ✅ Create TODO.md [DONE]

### 2. 🔍 Analyze remaining files
- [ ] app/chat.tsx
- [ ] app/student-forum.tsx  
- [ ] app/viewer.tsx
- [ ] app/(tabs)/downloads.tsx
- [ ] hooks/useOfflineFile.ts

### 3. ✏️ Core Screen Updates
- [ ] app/leaderboard.tsx: Add offline banner + cached data UX
- [ ] app/chat.tsx: Cached messages + "offline" alerts
- [ ] app/student-forum.tsx: Similar to chat
- [ ] app/viewer.tsx: Local file priority

### 4. 🌐 Global Improvements
- [ ] app/(tabs)/_layout.tsx: Enhance offline banner
- [ ] app/_layout.tsx: Pre-cache critical queries
- [ ] lib/queryClient.tsx: Tune offline retry

### 5. 🧪 Testing
- [ ] Expo offline mode (`expo start --offline`)
- [ ] Airplane mode on device
- [ ] All screens: instant load + banners
- [ ] Downloads/viewer work offline

### 6. 📱 Phone Build & Verify
- [ ] `eas build --profile preview --platform android`
- [ ] Install APK → test offline

### 7. ✅ Complete
- [ ] attempt_completion
