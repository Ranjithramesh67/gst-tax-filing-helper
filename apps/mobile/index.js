// Installs `crypto.getRandomValues` on the global object. Must be imported
// before anything that uses crypto-js (it captures `global.crypto` at load
// time) so secure random numbers work under Hermes.
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
