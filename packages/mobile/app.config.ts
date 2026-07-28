import appJson from "./app.json";

const androidMapsApiKey = process.env.ANDROID_GOOGLE_MAPS_API_KEY;

/** SDK key is injected only while creating an Android native build. */
export default {
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    config: androidMapsApiKey ? { googleMaps: { apiKey: androidMapsApiKey } } : undefined,
  },
};
