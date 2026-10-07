import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from "@react-navigation/native-stack";

import { ActiveWorkoutScreen } from "../screens/ActiveWorkoutScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { ProgressionScreen } from "../screens/ProgressionScreen";
import { SessionDetailScreen } from "../screens/SessionDetailScreen";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { WorkoutDetailScreen } from "../screens/WorkoutDetailScreen";
import { colors } from "../theme";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.accent,
  },
};

const headerScreenOptions: NativeStackNavigationOptions = {
  headerShown: true,
  title: "",
  headerShadowVisible: false,
  headerTintColor: colors.accent,
  headerStyle: { backgroundColor: colors.background },
  animation: "slide_from_right",
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Welcome"
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen
          name="WorkoutDetail"
          component={WorkoutDetailScreen}
          options={headerScreenOptions}
        />
        <Stack.Screen
          name="ActiveWorkout"
          component={ActiveWorkoutScreen}
          options={{ animation: "slide_from_right" }}
        />
        <Stack.Screen
          name="History"
          component={HistoryScreen}
          options={headerScreenOptions}
        />
        <Stack.Screen
          name="SessionDetail"
          component={SessionDetailScreen}
          options={headerScreenOptions}
        />
        <Stack.Screen
          name="Progression"
          component={ProgressionScreen}
          options={headerScreenOptions}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
