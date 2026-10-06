import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { WorkoutSessionId, WorkoutTemplateId } from "../domain";

export type RootStackParamList = {
  Welcome: undefined;
  Dashboard: undefined;
  WorkoutDetail: { templateId: WorkoutTemplateId };
  ActiveWorkout: { sessionId: WorkoutSessionId };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
