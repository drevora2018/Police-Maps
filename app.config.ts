import type { ConfigContext, ExpoConfig } from "expo/config";
import appJson from "./app.json";

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseConfig = ((config ?? appJson.expo) as ExpoConfig) || appJson.expo;
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  return {
    ...baseConfig,
    android: {
      ...baseConfig.android,
      config: {
        ...baseConfig.android?.config,
        ...(googleMapsApiKey
          ? { googleMaps: { apiKey: googleMapsApiKey } }
          : {}),
      },
    },
  };
};
