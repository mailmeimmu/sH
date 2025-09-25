# Smart Home By Nafisa Tabasum

## Environment Setup

- Set the Gemini key before launching Expo:
  ```bash
  export EXPO_PUBLIC_GEMINI_API_KEY="your-google-gemini-key"
  ```
- Optionally specify the model/version if your project uses something other than the default `models/gemini-1.5-flash-8b` on `v1`:
  ```bash
  export EXPO_PUBLIC_GEMINI_MODEL="models/gemini-1.5-flash-8b"
  export EXPO_PUBLIC_GEMINI_API_VERSION="v1"
  ```
- Configure the backend base URL if you need remote device control:
  ```bash
  export EXPO_PUBLIC_API_BASE="https://your-server.example.com"
  ```
- Ensure the device IDs served by the backend align with the mapping inside `ROOM_DEVICE_ID_MAP` in `app/(tabs)/voice.tsx`.

You can place these variables in an `.env` file and load them with `dotenv`-compatible tooling or your shell profile.
