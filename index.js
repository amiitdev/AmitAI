/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import scheduleTask from './src/lib/scheduleTask';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

/**
 * Runs a scheduled prompt with the app closed (AlarmManager → HeadlessJsTaskService).
 * Must be registered at module scope, before React starts, or the native side
 * has nothing to invoke.
 */
AppRegistry.registerHeadlessTask('AmitScheduleTask', () => scheduleTask);
