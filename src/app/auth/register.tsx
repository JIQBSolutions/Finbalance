import React, { useState, useEffect } from 'react';
import {
  View,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase'; // Asegúrate de que esta ruta apunte a tu cliente de Supabase
import { FinbalanceLogo } from '../../components/FinbalanceLogo';

export default function RegisterScreen() {
  const router = useRouter();

  // Estados del formulario (Basados en el MVP original)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [currency, setCurrency] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Toggles de visibilidad
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Estados de proceso y errores
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});

  // Lógica de fuerza de contraseña
  const [passwordScore, setPasswordScore] = useState(0);

  // Expresiones regulares del MVP
  const nombreRegex = /^[A-Za-zÁÉÍÓÚáéíóúÑñ]+(?: [A-Za-zÁÉÍÓÚáéíóúÑñ]+)*$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Evaluar fuerza de la contraseña (Lógica exacta del MVP)
  useEffect(() => {
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/(?=.*[a-z])/.test(password)) strength += 25;
    if (/(?=.*[A-Z])/.test(password)) strength += 25;
    if (/(?=.*\d)/.test(password)) strength += 25;
    setPasswordScore(strength);
  }, [password]);

  const getPasswordStrengthColor = () => {
    if (passwordScore <= 25) return '#EF4444'; // bg-red-500
    if (passwordScore <= 50) return '#EAB308'; // bg-yellow-500
    if (passwordScore <= 75) return '#3B82F6'; // bg-blue-500
    return '#10B981'; // bg-green-500
  };

  const getPasswordStrengthLabel = () => {
    if (passwordScore <= 25) return 'Débil';
    if (passwordScore <= 50) return 'Regular';
    if (passwordScore <= 75) return 'Buena';
    return 'Fuerte';
  };

  const validateForm = () => {
    const errors: { [key: string]: string } = {};

    // Validación Nombre (Lógica MVP)
    if (!fullName) errors.fullName = 'El nombre es obligatorio.';
    else if (fullName.startsWith(' ')) errors.fullName = 'El nombre no puede comenzar con espacios.';
    else if (fullName.length > 75) errors.fullName = 'El nombre no puede exceder los 75 caracteres.';
    else if (!nombreRegex.test(fullName) || fullName.endsWith(' ')) errors.fullName = 'Nombre inválido. Evita usar números, símbolos o espacios al final.';

    // Validación Correo
    if (!email) errors.email = 'El correo es obligatorio.';
    else if (!emailRegex.test(email.trim())) errors.email = 'Correo electrónico no válido.';

    // Validación País
    if (!country.trim()) errors.country = 'Selecciona tu país.';

    // Validación Ciudad (Lógica MVP)
    if (!city.trim()) errors.city = 'La ciudad es obligatoria.';
    else if (city.length > 50) errors.city = 'La ciudad no puede exceder los 50 caracteres.';
    else if (!nombreRegex.test(city) || city.endsWith(' ')) errors.city = 'Nombre inválido. Evita números o símbolos.';

    // Validación Moneda
    if (!currency.trim()) errors.currency = 'Selecciona tu moneda.';

    // Validación Contraseña
    if (!password) errors.password = 'La contraseña es obligatoria.';
    else if (password.length < 8) errors.password = 'La contraseña debe tener al menos 8 caracteres.';

    // Validación Confirmación
    if (!confirmPassword) errors.confirmPassword = 'Confirma tu contraseña.';
    else if (password !== confirmPassword) errors.confirmPassword = 'Las contraseñas no coinciden.';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    setGlobalError(null);
    if (!validateForm()) {
      setGlobalError('Por favor, corrige los errores antes de continuar.');
      return;
    }

    setIsLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      
      // Guardamos el usuario en Supabase con sus metadatos del MVP
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            country: country.trim(),
            city: city.trim(),
            currency: currency.trim().toUpperCase(),
          },
        },
      });

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('User already exists')) {
          setGlobalError('Este correo ya está registrado.');
        } else if (error.message.includes('weak_password')) {
          setGlobalError('La contraseña es demasiado débil.');
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          setGlobalError('No pudimos crear tu cuenta. Revisa tu conexión.');
        } else {
          setGlobalError('Ocurrió un error: ' + error.message);
        }
        setIsLoading(false);
        return;
      }

      // Registro exitoso -> Redirigir a onboarding
      router.replace('./dashboard/onboarding');
      
    } catch (err) {
      setGlobalError('Ocurrió un error inesperado al procesar tu solicitud.');
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.logoWrapper}>
            <FinbalanceLogo variant="dark" />
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Crea tu cuenta</Text>
            <Text style={styles.subtitle}>Completa tus datos para comenzar</Text>
          </View>

          {globalError && (
            <View style={styles.errorAlert}>
              <Feather name="alert-triangle" size={18} color="#FCA5A5" />
              <Text style={styles.errorAlertText}>{globalError}</Text>
            </View>
          )}

          <View style={styles.formContainer}>
            
            {/* Nombre Completo */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nombre completo</Text>
              <View style={[styles.inputWrapper, fieldErrors.fullName && styles.inputError]}>
                <Feather name="user" size={20} color="#9CA3AF" style={styles.inputLeftIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Tu nombre"
                  placeholderTextColor="#6B7280"
                  value={fullName}
                  maxLength={75}
                  onChangeText={(text) => {
                    setFullName(text);
                    if (fieldErrors.fullName) setFieldErrors({ ...fieldErrors, fullName: '' });
                  }}
                  autoCapitalize="words"
                />
                {fieldErrors.fullName ? <Feather name="alert-circle" size={18} color="#EF4444" /> : null}
              </View>
              {fieldErrors.fullName && <Text style={styles.errorText}>{fieldErrors.fullName}</Text>}
            </View>

            {/* Correo Electrónico */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Correo electrónico</Text>
              <View style={[styles.inputWrapper, fieldErrors.email && styles.inputError]}>
                <Feather name="mail" size={20} color="#9CA3AF" style={styles.inputLeftIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="tu@email.com"
                  placeholderTextColor="#6B7280"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: '' });
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              {fieldErrors.email && <Text style={styles.errorText}>{fieldErrors.email}</Text>}
            </View>

            {/* Fila: País y Ciudad */}
            <View style={styles.row}>
              {/* País */}
              <View style={[styles.inputGroup, { flex: 1, marginRight: 12 }]}>
                <Text style={styles.label}>País</Text>
                <View style={[styles.inputWrapper, fieldErrors.country && styles.inputError]}>
                  <Feather name="map" size={18} color="#9CA3AF" style={styles.inputLeftIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Ej. MX"
                    placeholderTextColor="#6B7280"
                    value={country}
                    onChangeText={(text) => {
                      setCountry(text);
                      if (fieldErrors.country) setFieldErrors({ ...fieldErrors, country: '' });
                    }}
                  />
                </View>
                {fieldErrors.country && <Text style={styles.errorText}>{fieldErrors.country}</Text>}
              </View>

              {/* Ciudad */}
              <View style={[styles.inputGroup, { flex: 1.5 }]}>
                <Text style={styles.label}>Ciudad</Text>
                <View style={[styles.inputWrapper, fieldErrors.city && styles.inputError]}>
                  <Feather name="map-pin" size={18} color="#9CA3AF" style={styles.inputLeftIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Tu ciudad"
                    placeholderTextColor="#6B7280"
                    value={city}
                    maxLength={50}
                    onChangeText={(text) => {
                      setCity(text);
                      if (fieldErrors.city) setFieldErrors({ ...fieldErrors, city: '' });
                    }}
                  />
                </View>
                {fieldErrors.city && <Text style={styles.errorText}>{fieldErrors.city}</Text>}
              </View>
            </View>

            {/* Moneda */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Moneda Principal</Text>
              <View style={[styles.inputWrapper, fieldErrors.currency && styles.inputError]}>
                <Feather name="dollar-sign" size={18} color="#9CA3AF" style={styles.inputLeftIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Ej. MXN, USD"
                  placeholderTextColor="#6B7280"
                  value={currency}
                  autoCapitalize="characters"
                  maxLength={3}
                  onChangeText={(text) => {
                    setCurrency(text);
                    if (fieldErrors.currency) setFieldErrors({ ...fieldErrors, currency: '' });
                  }}
                />
              </View>
              {fieldErrors.currency && <Text style={styles.errorText}>{fieldErrors.currency}</Text>}
            </View>

            {/* Contraseña */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Contraseña</Text>
              <View style={[styles.inputWrapper, fieldErrors.password && styles.inputError]}>
                <Feather name="lock" size={20} color="#9CA3AF" style={styles.inputLeftIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#6B7280"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: '' });
                  }}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={20} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
              
              {/* Barra de Fuerza de Contraseña (Diseño MVP adaptado) */}
              {password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBarBackground}>
                    <View 
                      style={[
                        styles.strengthBarFill, 
                        { width: `${passwordScore}%`, backgroundColor: getPasswordStrengthColor() }
                      ]} 
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: getPasswordStrengthColor() }]}>
                    {getPasswordStrengthLabel()}
                  </Text>
                </View>
              )}
              {fieldErrors.password && <Text style={styles.errorText}>{fieldErrors.password}</Text>}
            </View>

            {/* Confirmar Contraseña */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirmar contraseña</Text>
              <View style={[styles.inputWrapper, fieldErrors.confirmPassword && styles.inputError]}>
                <Feather name="lock" size={20} color="#9CA3AF" style={styles.inputLeftIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#6B7280"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (fieldErrors.confirmPassword) setFieldErrors({ ...fieldErrors, confirmPassword: '' });
                  }}
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                  <Feather name={showConfirmPassword ? "eye-off" : "eye"} size={20} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
              {fieldErrors.confirmPassword ? (
                <Text style={styles.errorText}>{fieldErrors.confirmPassword}</Text>
              ) : confirmPassword.length > 0 && password === confirmPassword ? (
                <Text style={styles.successText}>Las contraseñas coinciden</Text>
              ) : null}
            </View>

          </View>

          {/* Botones de acción */}
          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
              onPress={handleRegister}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#0F172A" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Continuar</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginPrompt}>
              <Text style={styles.loginText}>¿Ya tienes una cuenta? </Text>
              <TouchableOpacity onPress={() => router.push('./auth/login')}>
                <Text style={styles.loginLink}>Inicia sesión</Text>
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Slate 900 (Dark Fintech)
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#0b9387', // Teal Finbalance adaptado para subtítulo
    lineHeight: 24,
    fontWeight: '500',
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  errorAlertText: {
    color: '#FCA5A5',
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 18,
  },
  formContainer: {
    gap: 20,
    marginBottom: 40,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E2E8F0', // Slate 200
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B', // Slate 800
    borderWidth: 1,
    borderColor: '#334155', // Slate 700
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  inputLeftIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    height: '100%',
  },
  eyeIcon: {
    padding: 4,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    marginLeft: 4,
    marginTop: 2,
  },
  successText: {
    color: '#34D399',
    fontSize: 13,
    marginLeft: 4,
    marginTop: 2,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 12,
  },
  strengthBarBackground: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 45,
  },
  footer: {
    marginTop: 'auto',
  },
  primaryButton: {
    backgroundColor: '#0b9387', // Verde Finbalance
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  primaryButtonDisabled: {
    backgroundColor: '#0b938780',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loginPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    color: '#94A3B8',
    fontSize: 15,
  },
  loginLink: {
    color: '#0b9387',
    fontSize: 15,
    fontWeight: '700',
  },
});