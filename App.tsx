/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
  Alert,
  ScrollView,
  Image,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from 'react-native';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { useMutation, useQuery } from 'convex/react';
import { api } from './convex/_generated/api';
import Config from 'react-native-config';
import { launchCamera, type ImagePickerResponse } from 'react-native-image-picker';
import type { Id } from './convex/_generated/dataModel';
import notifee, { AndroidImportance, TriggerType, TimestampTrigger, EventType } from '@notifee/react-native';

const { width } = Dimensions.get('window');

const convex = new ConvexReactClient(Config.CONVEX_URL || 'https://content-bat-180.convex.cloud');

// Helper function to format timestamp
const formatTimestamp = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'Just now';
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days < 7) {
    return `${days}d ago`;
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
};

// Request notification permissions
async function requestNotificationPermission() {
  const settings = await notifee.requestPermission();
  console.log('Notification permission:', settings);
  return settings.authorizationStatus >= 1; // 1 = authorized
}

// Create notification channel for Android
async function createNotificationChannel() {
  await notifee.createChannel({
    id: 'meal-reminder',
    name: 'Meal Reminders',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

// Schedule a meal reminder notification
async function scheduleMealNotification() {
  try {
    // Request permission first
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      Alert.alert('Permission Required', 'Please enable notifications to receive meal reminders.');
      return;
    }

    // Create channel for Android
    await createNotificationChannel();

    // Schedule notification for 1 minute from now (for testing)
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: Date.now() + 60 * 1000, // 1 minute from now
    };

    await notifee.createTriggerNotification(
      {
        title: '📸 Time to BeMeal!',
        body: 'Capture your meal and share it with your friends!',
        android: {
          channelId: 'meal-reminder',
          importance: AndroidImportance.HIGH,
          pressAction: {
            id: 'default',
          },
        },
        ios: {
          sound: 'default',
          categoryId: 'meal-reminder',
        },
      },
      trigger
    );

    console.log('Meal notification scheduled for 1 minute from now');
    Alert.alert('Reminder Set!', 'You\'ll receive a notification in 1 minute to take a meal photo.');
  } catch (error) {
    console.error('Error scheduling notification:', error);
    Alert.alert('Error', 'Failed to schedule notification.');
  }
}

function SignInScreen() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [captionModalVisible, setCaptionModalVisible] = useState(false);
  const [caption, setCaption] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<{uri: string, fileName: string, fileSize?: number, mimeType?: string} | null>(null);

  // Notification and grace period state
  const [notificationTime, setNotificationTime] = useState<number | null>(null);
  const [isInGracePeriod, setIsInGracePeriod] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [hasPostedInCurrentWindow, setHasPostedInCurrentWindow] = useState(false);

  // Use ref to track userId so notification handlers always have access to latest value
  const userIdRef = useRef<Id<"users"> | null>(null);

  const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

  const upsertUser = useMutation(api.users.upsertUser);
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const savePhoto = useMutation(api.photos.savePhoto);
  const photos = useQuery(api.photos.getAllPhotos);

  // Update ref whenever userId changes
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Check grace period and update timer
  useEffect(() => {
    // If user has posted, stop the timer
    if (hasPostedInCurrentWindow) {
      setIsInGracePeriod(false);
      setTimeRemaining(0);
      return;
    }

    if (!notificationTime) {
      setIsInGracePeriod(false);
      setTimeRemaining(0);
      return;
    }

    const checkGracePeriod = () => {
      const now = Date.now();
      const elapsed = now - notificationTime;
      const remaining = GRACE_PERIOD_MS - elapsed;

      if (remaining > 0) {
        setIsInGracePeriod(true);
        setTimeRemaining(Math.ceil(remaining / 1000)); // Convert to seconds
      } else {
        setIsInGracePeriod(false);
        setTimeRemaining(0);
        setNotificationTime(null); // Clear notification time when grace period expires
      }
    };

    // Check immediately
    checkGracePeriod();

    // Update every second
    const interval = setInterval(checkGracePeriod, 1000);

    return () => clearInterval(interval);
  }, [notificationTime, GRACE_PERIOD_MS, hasPostedInCurrentWindow]);

  // Set up notification handlers
  useEffect(() => {
    // Handle notification press (when user taps the notification)
    const unsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
      // When notification is delivered, start the grace period
      if (type === EventType.DELIVERED) {
        console.log('Notification delivered, starting grace period');
        setNotificationTime(Date.now());
        setHasPostedInCurrentWindow(false); // Reset posted state for new window
      }

      if (type === EventType.PRESS) {
        console.log('Notification pressed, opening camera');
        console.log('Current userId:', userIdRef.current);

        // Set notification time if not already set (in case user taps before DELIVERED event)
        if (!notificationTime) {
          setNotificationTime(Date.now());
          setHasPostedInCurrentWindow(false); // Reset posted state for new window
        }

        if (!userIdRef.current) {
          console.error('No userId available when notification was pressed');
          Alert.alert('Error', 'Please sign in first');
          return;
        }

        // Open camera
        try {
          const result: ImagePickerResponse = await launchCamera({
            mediaType: 'photo',
            cameraType: 'back',
            saveToPhotos: false,
          });

          if (result.didCancel) {
            console.log('User cancelled camera');
            return;
          }

          if (result.errorCode) {
            Alert.alert('Error', result.errorMessage || 'Failed to take photo');
            return;
          }

          if (result.assets && result.assets.length > 0) {
            const asset = result.assets[0];

            console.log('Photo asset from notification:', {
              uri: asset.uri,
              fileName: asset.fileName,
              fileSize: asset.fileSize,
              type: asset.type,
            });

            // Store photo temporarily and show caption modal
            setPendingPhoto({
              uri: asset.uri || '',
              fileName: asset.fileName || 'photo.jpg',
              fileSize: asset.fileSize,
              mimeType: asset.type,
            });
            setCaptionModalVisible(true);
          }
        } catch (error) {
          console.error('Error taking photo from notification:', error);
          Alert.alert('Error', 'Failed to take photo. Please try again.');
        }
      }
    });

    // Handle background notification press
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      if (type === EventType.PRESS) {
        console.log('Background notification pressed');
        // The app will open and the foreground handler will take over
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Schedule notification when user signs in
  useEffect(() => {
    if (isSignedIn) {
      scheduleMealNotification();
    }
  }, [isSignedIn]);

  const handleSignIn = async () => {
    if (!email.trim() || !name.trim()) {
      Alert.alert('Error', 'Please enter both email and name');
      return;
    }

    try {
      const id = await upsertUser({ email: email.trim(), name: name.trim() });
      setUserId(id);
      setIsSignedIn(true);
      Alert.alert('Success', 'Welcome to BeMeal!');
    } catch (error) {
      Alert.alert('Error', 'Failed to sign in. Please try again.');
    }
  };

  const handleTakePhoto = async () => {
    // Check if user has already posted in this window
    if (hasPostedInCurrentWindow) {
      Alert.alert(
        'Already Posted!',
        'You\'ve already posted during this BeMeal time. Wait for the next notification!',
        [{ text: 'OK' }]
      );
      return;
    }

    // Check if we're in the grace period
    if (!isInGracePeriod) {
      Alert.alert(
        'Not Time Yet!',
        'You can only take photos when you receive a BeMeal notification. Wait for your next reminder!',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      const result: ImagePickerResponse = await launchCamera({
        mediaType: 'photo',
        cameraType: 'back',
        saveToPhotos: false,
      });

      if (result.didCancel) {
        console.log('User cancelled camera');
        return;
      }

      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Failed to take photo');
        return;
      }

      if (result.assets && result.assets.length > 0 && userId) {
        const asset = result.assets[0];

        console.log('Photo asset:', {
          uri: asset.uri,
          fileName: asset.fileName,
          fileSize: asset.fileSize,
          type: asset.type,
        });

        // Store photo temporarily and show caption modal
        setPendingPhoto({
          uri: asset.uri || '',
          fileName: asset.fileName || 'photo.jpg',
          fileSize: asset.fileSize,
          mimeType: asset.type,
        });
        setCaptionModalVisible(true);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleSavePhotoWithCaption = async () => {
    const currentUserId = userIdRef.current || userId;

    if (!pendingPhoto || !currentUserId) {
      console.error('Missing pendingPhoto or userId:', { pendingPhoto, currentUserId });
      Alert.alert('Error', 'Unable to save photo. Please try again.');
      return;
    }

    try {
      console.log('Uploading photo to Convex storage:', {
        userId: currentUserId,
        fileName: pendingPhoto.fileName,
        caption: caption.trim() || '(no caption)',
      });

      // Step 1: Get a short-lived upload URL from Convex
      const uploadUrl = await generateUploadUrl();

      // Step 2: Read the file and upload it to the URL
      const response = await fetch(pendingPhoto.uri);
      const blob = await response.blob();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': pendingPhoto.mimeType || 'image/jpeg',
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image to storage');
      }

      const { storageId } = await uploadResponse.json();

      // Step 3: Save the storage ID to the database
      await savePhoto({
        userId: currentUserId,
        storageId,
        fileName: pendingPhoto.fileName,
        fileSize: pendingPhoto.fileSize,
        mimeType: pendingPhoto.mimeType,
        caption: caption.trim() || undefined,
      });

      // Mark as posted and end the grace period
      setHasPostedInCurrentWindow(true);
      setIsInGracePeriod(false);
      setTimeRemaining(0);
      setNotificationTime(null);

      // Reset state
      setCaptionModalVisible(false);
      setCaption('');
      setPendingPhoto(null);
      Alert.alert('Success', 'Photo saved successfully! See you at the next BeMeal time.');
    } catch (error) {
      console.error('Error saving photo:', error);
      Alert.alert('Error', 'Failed to save photo. Please try again.');
    }
  };

  const handleCancelCaption = () => {
    setCaptionModalVisible(false);
    setCaption('');
    setPendingPhoto(null);
  };

  // Format time remaining as MM:SS
  const formatTimeRemaining = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isSignedIn) {
    return (
      <View style={styles.feedContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BeMeal Feed</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.reminderButton} onPress={scheduleMealNotification}>
              <Text style={styles.reminderButtonText}>🔔</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.cameraButton,
                (!isInGracePeriod || hasPostedInCurrentWindow) && styles.cameraButtonDisabled
              ]}
              onPress={handleTakePhoto}
              disabled={!isInGracePeriod || hasPostedInCurrentWindow}
            >
              <Text style={[
                styles.cameraButtonText,
                (!isInGracePeriod || hasPostedInCurrentWindow) && styles.cameraButtonTextDisabled
              ]}>
                📷 {hasPostedInCurrentWindow ? 'Posted!' : 'Take Photo'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Grace period timer banner - only show if in grace period AND haven't posted yet */}
        {isInGracePeriod && !hasPostedInCurrentWindow && (
          <View style={styles.timerBanner}>
            <Text style={styles.timerText}>
              ⏰ Time to post! {formatTimeRemaining(timeRemaining)} remaining
            </Text>
          </View>
        )}

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {photos && photos.length > 0 ? (
            photos.map((photo) => {
              console.log('Rendering photo:', photo.imageUrl);
              return (
                <View key={photo._id} style={styles.photoCard}>
                  {photo.imageUrl && (
                    <Image
                      source={{ uri: photo.imageUrl }}
                      style={styles.photoImage}
                      resizeMode="cover"
                      onError={(error) => {
                        console.error('Image load error:', error.nativeEvent.error);
                      }}
                      onLoad={() => {
                        console.log('Image loaded successfully:', photo.imageUrl);
                      }}
                    />
                  )}
                  <View style={styles.photoInfo}>
                    <View style={styles.photoHeader}>
                      <Text style={styles.userName}>{photo.userName}</Text>
                      <Text style={styles.timestamp}>
                        {formatTimestamp(photo.createdAt)}
                      </Text>
                    </View>
                    {photo.caption && (
                      <Text style={styles.caption}>{photo.caption}</Text>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No photos yet!</Text>
              <Text style={styles.emptyStateSubtext}>
                Tap the camera button to take your first meal photo
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Caption Modal */}
        <Modal
          visible={captionModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={handleCancelCaption}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add a caption</Text>
              <TextInput
                style={styles.captionInput}
                placeholder="What's on your plate?"
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={200}
                autoFocus
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={handleCancelCaption}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleSavePhotoWithCaption}
                >
                  <Text style={styles.saveButtonText}>Post</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BeMeal</Text>
      <Text style={styles.subtitle}>Share your meals in real time</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Enter your name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      <TouchableOpacity style={styles.button} onPress={handleSignIn}>
        <Text style={styles.buttonText}>Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <ConvexProvider client={convex}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <SignInScreen />
      </SafeAreaView>
    </ConvexProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  feedContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  reminderButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  reminderButtonText: {
    fontSize: 18,
  },
  cameraButton: {
    backgroundColor: '#000',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  cameraButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  cameraButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cameraButtonTextDisabled: {
    color: '#888',
  },
  timerBanner: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 15,
  },
  photoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  photoImage: {
    width: '100%',
    height: width - 30,
    backgroundColor: '#f0f0f0',
  },
  photoInfo: {
    padding: 15,
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  timestamp: {
    fontSize: 14,
    color: '#999',
  },
  caption: {
    fontSize: 15,
    color: '#333',
    marginTop: 10,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  emptyStateSubtext: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#000',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 15,
  },
  captionInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#000',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
