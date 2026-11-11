# My Krisper for iPhone

The App Store version of My Krisper. It is a [Capacitor](https://capacitorjs.com) app that bundles the same `crisper/index.html` the website serves at guide.simplykrisp.com/krisper. That means there's one app to maintain, and fixes to the page ship to the website and the next app build together.

```
app/
  capacitor.config.json   app id com.simplykrisp.krisper, name "Simply Krisp"
  scripts/build-www.mjs   copies crisper/index.html + icons into www/ for the app
  src/native.js           the native parts (links, sign-in, push)
  ios/                    the Xcode project (Swift Package Manager, no CocoaPods)
```

## What the app does beyond the website

- **Push notifications.** People get the same reminders the emails send: "Eat these first", "Before you shop" and the Krisp sachet reminder. The app asks for permission once, the first time the fridge is on screen. Tapping a "Before you shop" notification opens the fridge check.
- **Sign-in links open the app.** Magic-link emails (`https://guide.simplykrisp.com/krisper?k=…`) open the app when it's installed. This uses universal links, served from `/.well-known/apple-app-site-association`.
- **Sign in with Simply Krisp** runs in a Safari sheet and returns to the app through `simplykrisp://krisper?k=…`.
- **Store, recipe and help links** open in a Safari sheet over the app, so people stay in the app.
- **Receipt photos** use the iPhone camera or photo library. The permission text is in `Info.plist`.
- **App look.** There is no website menu, footer or "Add to Home Screen" prompt, the status bar is green, and the layout is iPhone-only and portrait-only.
- **Account deletion** is under Settings. Apple requires it, and it already existed.

## Build (needs a Mac with Xcode 16+, or a cloud Mac)

```bash
cd app
npm install
npm run sync        # build www/ and copy it into the iOS project
npm run open        # opens Xcode
```

In Xcode, select the **App** target. Under **Signing & Capabilities**, pick the Simply Krisp team. Then:

- Run on your iPhone: plug it in, choose it as the destination and press Run. For push to work from Xcode, build with `npm run build:dev && npx cap sync ios`. That registers the phone with Apple's sandbox push server.
- TestFlight: run **Product → Archive**, then **Distribute App → App Store Connect → Upload**. The build appears in App Store Connect → TestFlight about 10–20 minutes later. Add testers by email.

Every pull request that touches `app/` is compiled on a GitHub Mac runner (`.github/workflows/ios-build.yml`). Check that run first if Xcode complains.

## One-time setup after the Apple Developer account is approved

1. **App ID.** In developer.apple.com → Identifiers, create `com.simplykrisp.krisper`. Turn on **Push Notifications** and **Associated Domains**. If you use automatic signing, Xcode can also create it for you.
2. **Push key.** In Keys, click +, choose **Apple Push Notifications service (APNs)** and download the `.p8` file. Apple only lets you download it once.
3. **Vercel env vars** (Production) for the simplykrisp-produce-guide project:
   - `APNS_KEY`: the full text of the `.p8` file
   - `APNS_KEY_ID`: the Key ID shown next to the key
   - `APNS_TEAM_ID`: your Team ID (Membership details)
   - Optional: `APNS_BUNDLE_ID`. The default is `com.simplykrisp.krisper`.

   `APNS_TEAM_ID` also fills in the universal-link file. Until it's set, push stays off and the app still works.
4. **App Store Connect.** Create the app (name, bundle ID, SKU) and set up:
   - Privacy policy URL: https://simplykrisp.com/policies/privacy-policy
   - Support URL
   - Category: Food & Drink
   - Age rating
   - App Privacy answers: you collect an email address, purchase history (receipts) and a device ID (push token). None of it is used for tracking.
5. **Review notes.** Give Apple a test account. Create one, then paste its sign-in link (`https://guide.simplykrisp.com/krisper?k=…`) into the review notes. Explain that the app reads grocery receipts and reminds people to eat produce before it spoils.

## Check that it's working

- Universal links: `curl https://guide.simplykrisp.com/.well-known/apple-app-site-association`. The `appIDs` value should start with your Team ID, not `TEAMID`.
- Push: once phones are registered, the daily cron run's response includes `push: N` (the number of notifications sent).

## Local testing in a browser

```bash
node dev/server.mjs                 # API on :3000 (from the repo root)
cd app && npm run build:local       # www/ pointed at localhost:3000
cd www && python3 -m http.server 5174
```

Without the native shell, `native.js` does nothing. The page still behaves like the app: no install prompt and no website menu.

## Later

- A home-screen widget showing what to eat today. This needs WidgetKit and an App Group.
- The Knot SDK for connecting store accounts, once the Knot account is live.
