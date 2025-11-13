import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AuthService from '../services/authService';

export default function LoginScreen({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (isLogin) {
      // Login
      if (!usernameOrEmail || !password) {
        Alert.alert('Error', 'Please enter username/email and password');
        return;
      }

      try {
        setLoading(true);
        await AuthService.login(usernameOrEmail, password);
        onLoginSuccess();
      } catch (error) {
        Alert.alert('Login Failed', error.message || 'Invalid credentials');
      } finally {
        setLoading(false);
      }
    } else {
      // Register
      if (!username || !email || !password) {
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }

      // Basic email validation (trim whitespace first)
      const trimmedEmail = (email || '').trim();
      
      console.log('Validating email:', trimmedEmail, 'Length:', trimmedEmail.length);
      
      if (!trimmedEmail || trimmedEmail.length === 0) {
        Alert.alert('Error', 'Please enter an email address');
        return;
      }
      
      // Simple email validation: must have @ and at least one dot after @
      const atIndex = trimmedEmail.indexOf('@');
      if (atIndex === -1 || atIndex === 0 || atIndex === trimmedEmail.length - 1) {
        Alert.alert('Error', 'Please enter a valid email address');
        console.log('Email validation failed: @ symbol issue');
        return;
      }
      
      // Check if there's at least one dot after the @
      const domainPart = trimmedEmail.substring(atIndex + 1);
      if (!domainPart || !domainPart.includes('.')) {
        Alert.alert('Error', 'Please enter a valid email address');
        console.log('Email validation failed: no dot in domain');
        return;
      }
      
      // Use trimmed email
      const finalEmail = trimmedEmail;
      console.log('Email validation passed:', finalEmail);

      // Password length validation
      if (password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters');
        return;
      }

      try {
        setLoading(true);
        await AuthService.register(username.trim(), finalEmail, password, (name || '').trim() || null);
        onLoginSuccess();
      } catch (error) {
        Alert.alert('Registration Failed', error.message || 'Could not create account');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <Text style={styles.title}>JunkTrunk</Text>
          <Text style={styles.subtitle}>
            {isLogin ? 'Sign in to continue' : 'Create your account'}
          </Text>

          {isLogin ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Username or Email"
                placeholderTextColor="#999"
                value={usernameOrEmail}
                onChangeText={setUsernameOrEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#999"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={(text) => setEmail(text)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <TextInput
                style={styles.input}
                placeholder="Name (Optional)"
                placeholderTextColor="#999"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isLogin ? 'Sign In' : 'Sign Up'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => {
              setIsLogin(!isLogin);
              // Clear form when switching
              setUsernameOrEmail('');
              setPassword('');
              setEmail('');
              setUsername('');
              setName('');
            }}
          >
            <Text style={styles.switchText}>
              {isLogin
                ? "Don't have an account? Sign Up"
                : 'Already have an account? Sign In'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 30,
  },
  title: {
    fontSize: 42,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#1a1a1a',
  },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  switchButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '600',
  },
});

