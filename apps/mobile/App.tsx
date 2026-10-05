import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RootNavigator from './src/navigation/RootNavigator';
import { startSmsCollector } from './src/lib/smsCollector';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function App(): React.ReactElement {
  useEffect(() => {
    const stop = startSmsCollector();
    return stop;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar barStyle="dark-content" />
      <RootNavigator />
    </QueryClientProvider>
  );
}
