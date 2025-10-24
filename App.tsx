/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState } from 'react';
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
} from 'react-native';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { useMutation, useQuery } from 'convex/react';
import { api } from './convex/_generated/api';
import Config from 'react-native-config';
import { launchCamera, type ImagePickerResponse } from 'react-native-image-picker';
import type { Id } from './convex/_generated/dataModel';

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

function SignInScreen() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const upsertUser = useMutation(api.users.upsertUser);
  const savePhoto = useMutation(api.photos.savePhoto);
  const photos = useQuery(api.photos.getAllPhotos);

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

        // Save photo to database
        await savePhoto({
          userId: userId,
          imageUri: asset.uri || '',
          fileName: asset.fileName || 'photo.jpg',
          fileSize: asset.fileSize,
          mimeType: asset.type,
        });

        Alert.alert('Success', 'Photo saved successfully!');
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  if (isSignedIn) {
    return (
      <View style={styles.feedContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BeMeal Feed</Text>
          <TouchableOpacity style={styles.cameraButton} onPress={handleTakePhoto}>
            <Text style={styles.cameraButtonText}>📷 Take Photo</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {photos && photos.length > 0 ? (
            photos.map((photo) => {
              console.log('Rendering photo:', photo.imageUri);
              return (
                <View key={photo._id} style={styles.photoCard}>
                  <Image
                    source={{ uri: photo.imageUri }}
                    style={styles.photoImage}
                    resizeMode="cover"
                    onError={(error) => {
                      console.error('Image load error:', error.nativeEvent.error);
                    }}
                    onLoad={() => {
                      console.log('Image loaded successfully:', photo.imageUri);
                    }}
                  />
                  <View style={styles.photoInfo}>
                    <View style={styles.photoHeader}>
                      <Text style={styles.userName}>{photo.userName}</Text>
                      <Text style={styles.timestamp}>
                        {formatTimestamp(photo.createdAt)}
                      </Text>
                    </View>
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
  cameraButton: {
    backgroundColor: '#000',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  cameraButtonText: {
    color: '#fff',
    fontSize: 14,
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
});

export default App;
