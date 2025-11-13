import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_TOKEN_KEY = '@JunkTrunk:authToken';
const USER_KEY = '@JunkTrunk:user';

// Helper to get base URL (should match api.js)
const getBaseUrl = () => {
  const LOCALTUNNEL_URL = 'https://warm-owls-throw.loca.lt'; // 👈 URL de localtunnel (debe coincidir con api.js)
  if (LOCALTUNNEL_URL && LOCALTUNNEL_URL !== null && LOCALTUNNEL_URL !== '') {
    return `${LOCALTUNNEL_URL}/api`;
  }
  return 'http://localhost:3000/api';
};

class AuthService {
  async login(usernameOrEmail, password) {
    try {
      const response = await fetch(`${getBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usernameOrEmail,
          password,
        }),
      });

      // Get response text first
      const text = await response.text();

      // Check if response is OK before trying to parse JSON
      if (!response.ok) {
        // Try to parse as JSON for structured error messages
        let errorMessage = text;
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorData.message || text;
        } catch (parseError) {
          // If it's not JSON, use the text as error message
          // Handle common tunnel errors
          if (text.includes('Tunnel Unavailable') || text.includes('503')) {
            errorMessage = 'El túnel del servidor no está disponible. Por favor, verifica que localtunnel esté ejecutándose.';
          } else {
            errorMessage = text || `Error del servidor: ${response.status}`;
          }
        }
        throw new Error(errorMessage);
      }

      // Parse JSON only if response is OK
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Response text:', text);
        throw new Error('Respuesta inválida del servidor');
      }

      if (!data.success) {
        throw new Error(data.error || 'Error en el inicio de sesión');
      }

      // Save token and user
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));

      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async register(username, email, password, name) {
    try {
      const response = await fetch(`${getBaseUrl()}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          email,
          password,
          name,
        }),
      });

      // Get response text first to debug
      const text = await response.text();
      console.log('Registration response status:', response.status);
      console.log('Registration response text:', text.substring(0, 500));

      // Check if response is OK before trying to parse JSON
      if (!response.ok) {
        // Try to parse as JSON for structured error messages
        let errorMessage = text;
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorData.message || text;
        } catch (parseError) {
          // If it's not JSON, use the text as error message
          // Handle common tunnel errors
          if (text.includes('Tunnel Unavailable') || text.includes('503')) {
            errorMessage = 'El túnel del servidor no está disponible. Por favor, verifica que localtunnel esté ejecutándose.';
          } else {
            errorMessage = text || `Error del servidor: ${response.status}`;
          }
        }
        throw new Error(errorMessage);
      }

      // Parse JSON only if response is OK
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Response text:', text);
        throw new Error('Respuesta inválida del servidor');
      }

      if (!data.success) {
        throw new Error(data.error || 'Error en el registro');
      }

      // Save token and user
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));

      return data;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  async logout() {
    try {
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      await AsyncStorage.removeItem(USER_KEY);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  async getToken() {
    try {
      return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    } catch (error) {
      console.error('Get token error:', error);
      return null;
    }
  }

  async getUser() {
    try {
      const userJson = await AsyncStorage.getItem(USER_KEY);
      return userJson ? JSON.parse(userJson) : null;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  async isAuthenticated() {
    const token = await this.getToken();
    return token !== null;
  }

  async verifyToken() {
    try {
      const token = await this.getToken();
      if (!token) {
        return false;
      }

      const response = await fetch(`${getBaseUrl()}/auth/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // Check if response is OK before parsing JSON
      if (!response.ok) {
        return false;
      }

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('JSON parse error in verifyToken:', parseError);
        return false;
      }

      return data.success === true;
    } catch (error) {
      console.error('Verify token error:', error);
      return false;
    }
  }
}

export default new AuthService();

