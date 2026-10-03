import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';
import { startSmsCollector } from './src/lib/smsCollector';

export default function App(): React.ReactElement {
  useEffect(() => {
    const stop = startSmsCollector();
    return stop;
  }, []);

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <RootNavigator />
    </>
  );
}
