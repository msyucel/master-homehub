import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import TasksScreen from './src/screens/TasksScreen';

const TOKEN_KEY = '@homehub_token';
const USER_KEY = '@homehub_user';

const App = () => {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    checkStoredAuth();
  }, []);

  const checkStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      const storedUser = await AsyncStorage.getItem(USER_KEY);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Error checking stored auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (newToken, userData) => {
    try {
      await AsyncStorage.setItem(TOKEN_KEY, newToken);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
      setToken(newToken);
      setUser(userData);
      setShowSignup(false);
    } catch (error) {
      console.error('Error storing auth:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(USER_KEY);
      setToken(null);
      setUser(null);
      setShowSignup(false);
    } catch (error) {
      console.error('Error removing auth:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!token) {
    if (showSignup) {
      return (
        <SignupScreen
          onSignup={handleLogin}
          onBackToLogin={() => setShowSignup(false)}
        />
      );
    }
    return (
      <LoginScreen
        onLogin={handleLogin}
        onSignup={() => setShowSignup(true)}
      />
    );
  }

  return <TasksScreen token={token} user={user} onLogout={handleLogout} />;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
});

export default App;
