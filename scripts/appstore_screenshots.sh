#!/bin/bash
# App Store screenshot helper — run this on a Mac with Xcode installed.
#
# Boots the iOS Simulator, forces a clean/authentic status bar (9:41, full
# battery, full signal — the standard Apple marketing look), builds + installs
# the app, then walks you through each required device size letting you
# navigate to each screen and press Enter to capture it.
#
# This exists because Apple rejected a submission for "non-iOS status bar
# images" in the screenshots — that happens when screenshots come from a
# browser/web mobile-emulation view instead of the real Simulator. Screenshots
# taken by THIS script always have an authentic iOS status bar.
#
# Usage:
#   chmod +x scripts/appstore_screenshots.sh
#   ./scripts/appstore_screenshots.sh
#
# Requires: Xcode + Command Line Tools, CocoaPods, Node/npm.

set -e
cd "$(dirname "$0")/.."

BUNDLE_ID="com.binghanem.letsmeet"
SCHEME="App"
WORKSPACE="ios/App/App.xcworkspace"
OUT_DIR="appstore-screenshots/$(date +%Y%m%d-%H%M%S)"

# Device -> the App Store Connect size category it satisfies. Edit this list
# if Apple's required sizes change — check App Store Connect > your version >
# Previews and Screenshots for the exact list currently required.
DEVICES=(
  "iPhone 16 Pro Max:6.9-inch"
  "iPhone 11 Pro Max:6.5-inch"
)

echo "== 1/5  Install npm dependencies =="
npm install --legacy-peer-deps

echo "== 2/5  Build web app =="
npm run build

echo "== 3/5  Add iOS platform + sync (mirrors Codemagic CI) =="
npx cap add ios 2>/dev/null || true
npx cap sync ios

echo "== 4/5  Install CocoaPods =="
(cd ios/App && pod install)

mkdir -p "$OUT_DIR"
echo "Screenshots will be saved under: $OUT_DIR"
echo ""

for entry in "${DEVICES[@]}"; do
  DEVICE_NAME="${entry%%:*}"
  SIZE_LABEL="${entry##*:}"
  SAFE_NAME=$(echo "$DEVICE_NAME" | tr ' ' '_')
  DEVICE_DIR="$OUT_DIR/${SIZE_LABEL}_${SAFE_NAME}"
  mkdir -p "$DEVICE_DIR"

  echo "=================================================================="
  echo "Device: $DEVICE_NAME  ($SIZE_LABEL)"
  echo "=================================================================="

  UDID=$(xcrun simctl list devices available | awk -v name="$DEVICE_NAME" '
    $0 ~ name { match($0, /\(([0-9A-F-]+)\)/, a); print a[1]; exit }' )

  if [ -z "$UDID" ]; then
    echo "  Simulator \"$DEVICE_NAME\" not found/installed. Skipping."
    echo "  (Xcode > Settings > Platforms, or Simulator > File > Open Simulator > download it.)"
    continue
  fi

  echo "  Booting simulator ($UDID)..."
  xcrun simctl boot "$UDID" 2>/dev/null || true
  open -a Simulator --args -CurrentDeviceUDID "$UDID"
  sleep 6

  echo "  Forcing a clean, authentic status bar (9:41, full battery/signal)..."
  xcrun simctl status_bar "$UDID" override \
    --time "9:41" \
    --batteryState charged \
    --batteryLevel 100 \
    --cellularMode active \
    --cellularBars 4 \
    --wifiMode active \
    --wifiBars 3

  echo "  Building the app for this simulator (this can take a few minutes)..."
  xcodebuild build \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Release \
    -sdk iphonesimulator \
    -destination "id=$UDID" \
    -derivedDataPath build/DerivedData \
    | xcpretty 2>/dev/null || xcodebuild build \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Release \
    -sdk iphonesimulator \
    -destination "id=$UDID" \
    -derivedDataPath build/DerivedData

  APP_PATH=$(find build/DerivedData -name "App.app" -path "*iphonesimulator*" | head -1)
  if [ -z "$APP_PATH" ]; then
    echo "  Could not find built .app — skipping this device."
    continue
  fi

  echo "  Installing + launching the app..."
  xcrun simctl install "$UDID" "$APP_PATH"
  xcrun simctl launch "$UDID" "$BUNDLE_ID"
  sleep 2

  n=1
  echo ""
  echo "  Navigate to the screen you want in the Simulator window, then come"
  echo "  back here and press Enter to capture it. Type 'done' + Enter to move"
  echo "  on to the next device."
  while true; do
    read -p "  [$DEVICE_NAME] Screenshot $n — press Enter to capture (or 'done'): " ans
    if [ "$ans" = "done" ]; then break; fi
    FILE="$DEVICE_DIR/screenshot_$(printf '%02d' $n).png"
    xcrun simctl io "$UDID" screenshot "$FILE"
    echo "  Saved: $FILE"
    n=$((n+1))
  done

  xcrun simctl shutdown "$UDID" 2>/dev/null || true
done

echo ""
echo "== 5/5  Done =="
echo "All screenshots saved under: $OUT_DIR"
echo "Upload them in App Store Connect > your version > Previews and Screenshots"
echo "> 'View All Sizes in Media Manager' for each required device size."
