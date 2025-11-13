import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View, StyleSheet, AppState } from 'react-native';
import HomeScreen from './screens/HomeScreen';
import MapScreen from './screens/MapScreen';
import LoginScreen from './screens/LoginScreen';
import AuthService from './services/authService';

const Stack = createStackNavigator();

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const checkIntervalRef = useRef(null);

  useEffect(() => {
    // Initial auth check
    checkAuth();
    
    // Listen for app state changes (foreground/background)
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground, check auth
        checkAuth();
      }
      appState.current = nextAppState;
    });

    // Check auth periodically only when authenticated (less frequent)
    // This helps detect logout without being too aggressive
    checkIntervalRef.current = setInterval(() => {
      if (isAuthenticated) {
        // Only check if we think we're authenticated
        // Use a lighter check - just check if token exists
        checkAuthLight();
      }
    }, 10000); // Check every 10 seconds instead of 2
    
    return () => {
      subscription?.remove();
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [isAuthenticated]);

  const checkAuthLight = async () => {
    try {
      // Light check - just verify token exists, don't call API
      const authenticated = await AuthService.isAuthenticated();
      if (!authenticated) {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Auth light check error:', error);
      setIsAuthenticated(false);
    }
  };

  const checkAuth = async () => {
    try {
      const authenticated = await AuthService.isAuthenticated();
      if (authenticated) {
        // Only verify token on initial check or when app comes to foreground
        // Don't verify on every interval check
        const isValid = await AuthService.verifyToken();
        setIsAuthenticated(isValid);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a1a1a" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaProvider>
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#1a1a1a',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          <Stack.Screen 
            name="Home" 
            component={HomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Map" 
            component={MapScreen}
            options={{ 
              title: 'Find Thrift Shops',
              headerBackTitleVisible: false
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});

