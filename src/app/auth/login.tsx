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

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Toggles de visibilidad
    const [showPassword, setShowPassword] = useState(false);

    // Expresiones regulares del MVP
    const nombreRegex = /^[A-Za-zÁÉÍÓÚáéíóúÑñ]+(?: [A-Za-zÁÉÍÓÚáéíóúÑñ]+)*$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

}