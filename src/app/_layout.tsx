import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      {/* StatusBar controla la barra superior del teléfono (batería, hora, señal). 
        'dark' pone los iconos oscuros para contrastar con nuestro fondo claro. 
      */}
      <StatusBar style="dark" />
      
      {/* El Stack es el contenedor principal de navegación. 
        Al poner headerShown: false, quitamos la barra superior gris que 
        React Native pone por defecto, dándonos control total del diseño.
      */}
      <Stack screenOptions={{ headerShown: false }}>
        
        {/* Pantalla de Bienvenida (nuestro index.tsx) */}
        <Stack.Screen 
          name="index" 
          options={{
            animation: 'fade', // Transición suave
          }} 
        />
        
        {/* Aquí registraremos el grupo de autenticación (Login/Registro)
          que construiremos en la Fase 1 de tu Roadmap.
        */}
        <Stack.Screen 
          name="(auth)" 
          options={{
            animation: 'slide_from_right',
          }} 
        />

        {/* Más adelante, aquí registraremos las rutas del Dashboard 
          y los Workspaces.
        */}
      </Stack>
    </>
  );
}