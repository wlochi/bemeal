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
} from 'react-native';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { useMutation } from 'convex/react';
import { api } from './convex/_generated/api';
import Config from 'react-native-config';
import { launchCamera, type ImagePickerResponse } from 'react-native-image-picker';
import type { Id } from './convex/_generated/dataModel';

const convex = new ConvexReactClient(Config.CONVEX_URL || 'https://content-bat-180.convex.cloud');

function SignInScreen() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const upsertUser = useMutation(api.users.upsertUser);
  const savePhoto = useMutation(api.photos.savePhoto);

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
      <View style={styles.container}>
        <Text style={styles.welcomeText}>Welcome to BeMeal!</Text>
        <Text style={styles.subtitle}>Share your meals with friends</Text>

        <TouchableOpacity style={styles.button} onPress={handleTakePhoto}>
          <Text style={styles.buttonText}>Take Photo</Text>
        </TouchableOpacity>
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
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 10,
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
