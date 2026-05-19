import React from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppPreferences } from '@/contexts/app-preferences-context';
import { useTheme } from '@/hooks/use-theme';
import { getInstallationId } from '@/lib/installation';
import { ChatMessage } from '@/types/domain';
import { listRecentMessages, sendMessage, subscribeToMessages } from '@/services/chat-service';
import {
  getNotificationPreference,
  registerForPushNotifications,
  upsertNotificationPreference,
} from '@/services/notifications-service';
import { Spacing } from '@/constants/theme';

export default function ChatScreen() {
  const router = useRouter();
  const { preferences } = useAppPreferences();
  const theme = useTheme();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = React.useState('');
  const [installationId, setInstallationId] = React.useState<string>('');
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      try {
        const id = await getInstallationId();
        const [initialMessages, preference] = await Promise.all([
          listRecentMessages(100),
          getNotificationPreference(id),
        ]);
        if (!isMounted) return;
        setInstallationId(id);
        setMessages(initialMessages);
        setNotificationsEnabled(preference);
      } catch (error) {
        console.warn('Chat bootstrap failed', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void setup();
    const unsubscribe = subscribeToMessages((message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const onSend = async () => {
    if (!installationId || !messageText.trim() || sending) return;
    if (!preferences.alias.trim()) {
      Alert.alert('Alias required', 'Set an alias in Settings before sending messages.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => router.push('/settings') },
      ]);
      return;
    }
    setSending(true);
    try {
      await sendMessage(messageText, installationId, preferences.alias);
      setMessageText('');
    } catch (error) {
      console.warn('Send message failed', error);
    } finally {
      setSending(false);
    }
  };

  const onToggleNotifications = async (next: boolean) => {
    setNotificationsEnabled(next);
    if (!installationId) return;
    try {
      if (next) {
        await registerForPushNotifications({ installationId, enabled: true });
      } else {
        await upsertNotificationPreference({
          installationId,
          notificationsEnabled: false,
          expoPushToken: null,
        });
      }
    } catch (error) {
      console.warn('Notification preference update failed', error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={10}>
        <ThemedView style={styles.header}>
          <ThemedText type="subtitle">Global Chat</ThemedText>
          <View style={styles.preferenceRow}>
            <ThemedText type="small">Pin notifications</ThemedText>
            <Switch value={notificationsEnabled} onValueChange={onToggleNotifications} />
          </View>
        </ThemedView>

        <FlatList
          style={styles.flex}
          contentContainerStyle={styles.listContent}
          data={messages}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary">
              {loading ? 'Loading chat...' : 'No messages yet.'}
            </ThemedText>
          }
          renderItem={({ item }) => {
            const normalizedAlias = preferences.alias.trim().toLowerCase();
            const mineByAlias =
              normalizedAlias.length > 0 && item.alias.trim().toLowerCase() === normalizedAlias;
            const mine = item.installation_id === installationId || mineByAlias;
            const bubbleStyle = mine
              ? { backgroundColor: theme.backgroundSelected }
              : { backgroundColor: theme.backgroundElement };
            return (
              <View style={[styles.messageBubble, mine ? styles.myMessage : styles.otherMessage, bubbleStyle]}>
                <ThemedText>{item.body}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.alias} {'\u2022'} {new Date(item.created_at).toLocaleTimeString()}
                </ThemedText>
              </View>
            );
          }}
        />

        <View style={styles.composer}>
          <TextInput
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Send a message"
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
          <Pressable onPress={onSend} style={styles.sendButton} disabled={sending}>
            <ThemedText type="smallBold">Send</ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listContent: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  messageBubble: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    maxWidth: '85%',
  },
  myMessage: { alignSelf: 'flex-end' },
  otherMessage: {
    alignSelf: 'flex-start',
  },
  composer: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C8C8CC',
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#B8B8BC',
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    minHeight: 42,
  },
  sendButton: {
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
    backgroundColor: '#E9E9ED',
  },
});
