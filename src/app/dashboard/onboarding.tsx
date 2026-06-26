import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

export default function OnboardingScreen() {
  const router = useRouter();

  // Estados del usuario (recuperados de la metadata)
  const [userName, setUserName] = useState('');
  const [userCurrency, setUserCurrency] = useState('MXN');
  const [userId, setUserId] = useState<string | null>(null);

  // Estados del flujo
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Datos del Paso 1: Workspace
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceType, setWorkspaceType] = useState<'personal' | 'business'>('personal');

  // Datos del Paso 2: Cuenta Inicial
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'bank' | 'cash'>('bank');
  const [initialBalance, setInitialBalance] = useState('');

  // 1. Obtener los datos del usuario al cargar la pantalla
  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        if (user.user_metadata) {
          // Tomamos el nombre y la moneda que guardamos en el registro
          setUserName(user.user_metadata.full_name?.split(' ')[0] || 'Usuario');
          setUserCurrency(user.user_metadata.currency || 'MXN');
        }
      }
    };
    fetchUserData();
  }, []);

  // 2. Lógica para completar el Onboarding
  const handleCompleteOnboarding = async () => {
    setGlobalError(null);

    // Validaciones del paso 2
    if (!accountName.trim()) {
      setGlobalError('Dale un nombre a tu cuenta.');
      return;
    }
    const balanceNum = parseFloat(initialBalance);
    if (isNaN(balanceNum) || balanceNum < 0) {
      setGlobalError('Ingresa un saldo inicial válido (puede ser 0).');
      return;
    }

    setIsLoading(true);

    try {
      // A. Crear el Workspace
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({
          owner_id: userId,
          name: workspaceName.trim(),
          workspace_type: workspaceType,
          currency: userCurrency, // Usamos la moneda del registro
        })
        .select('id')
        .single();

      if (workspaceError) throw new Error('Error al crear el Workspace: ' + workspaceError.message);

      const workspaceId = workspace.id;

      // B. Añadir al usuario como miembro del workspace
      const { error: memberError } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: workspaceId,
          user_id: userId,
          role: 'owner'
        });

      if (memberError) throw new Error('Error al asignarte al Workspace.');

      // C. Crear la cuenta, el check-in inicial y el snapshot usando tu RPC
      const { error: accountError } = await supabase.rpc('create_account_with_initial_balance', {
        p_workspace_id: workspaceId,
        p_name: accountName.trim(),
        p_account_type: accountType,
        p_initial_balance: balanceNum,
        p_include_in_checkin: true,
        p_currency: userCurrency
      });

      if (accountError) throw new Error('Error al crear la cuenta inicial: ' + accountError.message);

      // Todo exitoso -> Redirigir al Dashboard
      router.replace('./dashboard'); // Asumiendo que esta será tu ruta del dashboard
      
    } catch (error: any) {
      setGlobalError(error.message || 'Ocurrió un error inesperado.');
      setIsLoading(false);
    }
  };

  // Renderizado del Paso 1: Configurar Workspace
  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>¡Hola, {userName}!</Text>
      <Text style={styles.subtitle}>Vamos a configurar tu primer espacio de trabajo.</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>¿Qué tipo de finanzas manejarás aquí?</Text>
        <View style={styles.rowButtons}>
          <TouchableOpacity 
            style={[styles.typeButton, workspaceType === 'personal' && styles.typeButtonActive]}
            onPress={() => setWorkspaceType('personal')}
          >
            <Feather name="user" size={24} color={workspaceType === 'personal' ? '#FFF' : '#9CA3AF'} />
            <Text style={[styles.typeButtonText, workspaceType === 'personal' && styles.typeButtonTextActive]}>
              Personales
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.typeButton, workspaceType === 'business' && styles.typeButtonActive]}
            onPress={() => setWorkspaceType('business')}
          >
            <Feather name="briefcase" size={24} color={workspaceType === 'business' ? '#FFF' : '#9CA3AF'} />
            <Text style={[styles.typeButtonText, workspaceType === 'business' && styles.typeButtonTextActive]}>
              Negocio
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Nombre del espacio</Text>
        <View style={styles.inputWrapper}>
          <Feather name="layout" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder={workspaceType === 'personal' ? "Ej. Finanzas Personales" : "Ej. Barbería Central"}
            placeholderTextColor="#6B7280"
            value={workspaceName}
            onChangeText={setWorkspaceName}
            autoCapitalize="words"
          />
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.primaryButton, !workspaceName.trim() && styles.primaryButtonDisabled]}
        onPress={() => setStep(2)}
        disabled={!workspaceName.trim()}
      >
        <Text style={styles.primaryButtonText}>Continuar</Text>
        <Feather name="arrow-right" size={20} color="#FFF" style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </View>
  );

  // Renderizado del Paso 2: Configurar Primera Cuenta
  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <TouchableOpacity onPress={() => setStep(1)} style={styles.backButton}>
        <Feather name="arrow-left" size={24} color="#9CA3AF" />
      </TouchableOpacity>

      <Text style={styles.title}>Añade tu primera cuenta</Text>
      <Text style={styles.subtitle}>¿Dónde está el dinero con el que operas {workspaceType === 'personal' ? 'tu día a día' : 'tu negocio'}?</Text>

      {globalError && (
        <View style={styles.errorAlert}>
          <Feather name="alert-triangle" size={18} color="#FCA5A5" />
          <Text style={styles.errorAlertText}>{globalError}</Text>
        </View>
      )}

      <View style={styles.formGroup}>
        <Text style={styles.label}>Tipo de cuenta</Text>
        <View style={styles.rowButtons}>
          <TouchableOpacity 
            style={[styles.typeButton, accountType === 'bank' && styles.typeButtonActive]}
            onPress={() => setAccountType('bank')}
          >
            <Feather name="credit-card" size={24} color={accountType === 'bank' ? '#FFF' : '#9CA3AF'} />
            <Text style={[styles.typeButtonText, accountType === 'bank' && styles.typeButtonTextActive]}>
              Banco
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.typeButton, accountType === 'cash' && styles.typeButtonActive]}
            onPress={() => setAccountType('cash')}
          >
            <Feather name="dollar-sign" size={24} color={accountType === 'cash' ? '#FFF' : '#9CA3AF'} />
            <Text style={[styles.typeButtonText, accountType === 'cash' && styles.typeButtonTextActive]}>
              Efectivo / Caja
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Nombre de la cuenta</Text>
        <View style={styles.inputWrapper}>
          <Feather name="edit-2" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder={accountType === 'bank' ? "Ej. BBVA Débito" : "Ej. Caja Registradora"}
            placeholderTextColor="#6B7280"
            value={accountName}
            onChangeText={setAccountName}
            autoCapitalize="words"
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Saldo Actual ({userCurrency})</Text>
        <View style={styles.inputWrapper}>
          <Text style={styles.currencyPrefix}>$</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor="#6B7280"
            value={initialBalance}
            onChangeText={setInitialBalance}
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={styles.helpText}>No te preocupes, podrás editar esto más tarde en tu Check-In.</Text>
      </View>

      <TouchableOpacity 
        style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
        onPress={handleCompleteOnboarding}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#0F172A" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Ir al Dashboard</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {step === 1 ? renderStep1() : renderStep2()}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Dark Fintech
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 40,
  },
  stepContainer: {
    flex: 1,
  },
  backButton: {
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#0b9387', // Finbalance Teal
    lineHeight: 24,
    fontWeight: '500',
    marginBottom: 40,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: 12,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    height: 100,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#334155',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  typeButtonActive: {
    borderColor: '#0b9387',
    backgroundColor: 'rgba(11, 147, 135, 0.15)',
  },
  typeButtonText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  currencyPrefix: {
    fontSize: 18,
    color: '#9CA3AF',
    marginRight: 8,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    height: '100%',
  },
  helpText: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 8,
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
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#0b9387',
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  primaryButtonDisabled: {
    backgroundColor: '#0b938780',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});