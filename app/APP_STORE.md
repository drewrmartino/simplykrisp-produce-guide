# Getting My Krisper into the App Store

Step by step, on your own Mac, from an approved Apple Developer account to "Submit for Review". Do the parts in order. Part 1 is done once per Mac. Parts 2–4 are done once per app. Parts 5–8 are repeated for every release.

What's already in the repo, so you don't need to build it:

- Capacitor iPhone project (`app/ios`), bundle ID `com.simplykrisp.krisper`, iPhone-only and portrait
- Push notifications, universal sign-in links, Safari-sheet store links and camera/photo access
- In-app account deletion, an AI-reader consent step before the first receipt photo, and an offline notice
- Privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`) and `ITSAppUsesNonExemptEncryption = NO`, so there's no export-compliance question on each upload

---

## Part 1. Set up the Mac (once, about an hour, mostly downloads)

1. **Update macOS if your Mac can.** Apple menu → About This Mac shows the model. Any Apple silicon Mac (M1 or later), plus a few 2019–2020 Intel models, can run macOS Tahoe ([Apple's list](https://support.apple.com/en-us/122867)). System Settings → General → Software Update → **Upgrade Now** under macOS Tahoe. Then update to the latest Tahoe (26.6 or later), because current Xcode (27.x) needs it.
2. **Install Xcode.**
   - **On Tahoe 26.6+:** install Xcode from the Mac App Store.
   - **Staying on Sequoia (15.6 or later):** the App Store shows Xcode as unavailable because it only offers the newest version. Instead, go to [developer.apple.com/download/all](https://developer.apple.com/download/all/?q=Xcode%2026.3), sign in, search **Xcode 26.3**, expand it and download `Xcode_26.3.xip` (about 3 GB). Double-click the `.xip` to unpack it and drag `Xcode.app` into Applications. Xcode 26.3 includes the iOS 26.2 SDK, which Apple accepts for uploads until April 2027. After that you'll need Tahoe and Xcode 27.
     If your iPhone runs iOS 27, Xcode 26.3 may not be able to run the app directly on it (Part 5). Install it through TestFlight instead (Part 7).
   - Open Xcode once, accept the license, and when it asks which platforms to install, tick **iOS**.
3. **Sign in to Xcode.** Xcode → Settings → Accounts → **+** → Apple Account. Use the Apple ID you enrolled with. You should see the Simply Krisp team listed (organization) once enrollment is approved.
4. **Install the command-line tools** Terminal needs. Open Terminal (Spotlight → "Terminal") and run:

   ```bash
   xcode-select --install          # says "already installed" if Xcode did it
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

   When Homebrew finishes, it prints two "Next steps" lines that start with `echo` and `eval`. Copy and run them so `brew` works in new Terminal windows.

5. **Install Node 22 and the GitHub CLI**:

   ```bash
   brew install node@22 gh
   brew link --overwrite node@22
   node -v                          # should print v22.x
   gh auth login                    # GitHub.com → HTTPS → log in with a browser
   ```

6. **Get the code**:

   ```bash
   mkdir -p ~/Code && cd ~/Code
   gh repo clone drewrmartino/simplykrisp-produce-guide
   cd simplykrisp-produce-guide/app
   npm install
   ```

## Part 2. Apple Developer website (once, 10 minutes)

Go to [developer.apple.com/account](https://developer.apple.com/account) and sign in.

1. **Find your Team ID.** Membership details → Team ID (10 characters, such as `AB12CD34EF`). Write it down.
2. **Create the App ID.** Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App.
   - Description: `My Krisper`
   - Bundle ID: Explicit, `com.simplykrisp.krisper`
   - Capabilities: tick **Push Notifications** and **Associated Domains**
   - Continue → Register
3. **Create the push key.** Keys → **+**.
   - Name: `Krisper push`
   - Tick **Apple Push Notifications service (APNs)**. If it asks you to configure it, choose Sandbox & Production.
   - Continue → Register → **Download**. You get a file like `AuthKey_XXXXXXXXXX.p8`. Apple only lets you download it once, so save it somewhere safe (a password manager works). The 10 characters after `AuthKey_` are the **Key ID**.

## Part 3. Turn on push and universal links on the server (once, 5 minutes)

In [Vercel](https://vercel.com) → project **simplykrisp-produce-guide** → Settings → Environment Variables, add these for **Production**:

| Name | Value |
|---|---|
| `APNS_KEY` | Open the `.p8` file in TextEdit and paste all of it, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |
| `APNS_KEY_ID` | The Key ID from Part 2, step 3 |
| `APNS_TEAM_ID` | The Team ID from Part 2, step 1 |

Then Deployments → the latest production deployment → ⋯ → **Redeploy**.

Check it in Terminal:

```bash
curl https://guide.simplykrisp.com/.well-known/apple-app-site-association
```

The `appIDs` value should read `YOURTEAMID.com.simplykrisp.krisper`, not `TEAMID.…`. Until this is right, tapping a sign-in link in Mail opens Safari instead of the app.

## Part 4. Create the app in App Store Connect (once, 20 minutes)

Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com).

1. **Agreements first.** Business (or "Agreements, Tax, and Banking") → accept any agreement marked pending. My Krisper is free, so you don't need the Paid Apps agreement, banking or tax forms unless you later sell something through Apple.
2. **Apps → + → New App**:
   - Platform: iOS
   - Name: `My Krisper by Simply Krisp`. The name has to be unique in the App Store, so if it's taken, try `My Krisper: Produce Tracker`. The icon label on the phone stays "Simply Krisp".
   - Primary language: English (U.S.)
   - Bundle ID: pick `com.simplykrisp.krisper` from the list
   - SKU: `krisper-ios`
   - User access: Full Access
3. **App Information** (left sidebar):
   - Subtitle (30 characters): `Store produce. Waste less.`
   - Category: Primary **Food & Drink**, Secondary **Lifestyle**
   - Age Rating → Edit: answer **No / None** to everything (no user-to-user chat, no social media, no unrestricted web, no mature content). It should come out **4+**. If it asks about an unrestricted web browser: the Safari sheets only open Simply Krisp pages and the links you tap, so answer No.
   - Content rights: "No, it does not contain, show, or access third-party content"
4. **Pricing and Availability**: Price **Free**, all countries (or just the United States to start).
5. **App Privacy** → Privacy Policy URL `https://simplykrisp.com/policies/privacy-policy` → Get Started → "Yes, we collect data". Tick exactly these, all **Linked to the user**, **Not used for tracking**:

   | Apple category | Data type | Purposes | Why |
   |---|---|---|---|
   | Contact Info | Email Address | App Functionality, Developer's Advertising or Marketing | Sign-in links and reminders. Tips and offers only if they tick the box. |
   | Contact Info | Name | App Functionality | Optional first name for the greeting |
   | Purchases | Purchase History | App Functionality | Grocery receipts and orders |
   | User Content | Customer Support | App Functionality | In-app feedback form |
   | User Content | Other User Content | App Functionality | The produce they add, eat or toss |
   | Identifiers | Device ID | App Functionality | Push notification token |

   Don't tick **Photos**. Apple counts data as collected only when it's kept longer than it takes to handle the request, and receipt photos are read and discarded. These answers match `PrivacyInfo.xcprivacy`. If you change one, change the other.

   Before you publish this, check that the Shopify privacy policy mentions the My Krisper app: receipts, push notifications, and that receipt photos are read by Google Gemini and discarded. Apple compares the policy to the app.

## Part 5. Run it on your iPhone (each release, 10 minutes)

1. Get the latest code and build the app's web files:

   ```bash
   cd ~/Code/simplykrisp-produce-guide
   git pull
   cd app
   npm install
   npm run build:dev && npx cap sync ios   # dev build = push works when run from Xcode
   npm run open                            # opens Xcode
   ```

2. In Xcode's left sidebar click the blue **App** project → under Targets click **App** → **Signing & Capabilities** tab:
   - Tick **Automatically manage signing**
   - Team: **Simply Krisp LLC** (your organization, not "Personal Team")
   - It should show Push Notifications and Associated Domains with no red errors. If it says a capability is missing, click **+ Capability** and add it.
3. Plug your iPhone into the Mac with a cable. On the phone, tap **Trust**. The first time, turn on Settings → Privacy & Security → **Developer Mode** and restart the phone when it asks.
4. At the top of Xcode, click the device menu next to "App" and choose your iPhone. Press **▶ Run** (⌘R). The first build takes a few minutes.
5. Test on the phone:
   - Create an account, add produce by hand, and paste a receipt
   - Snap a receipt: the "How should we read your receipt?" card should appear once
   - Allow notifications when asked
   - Turn on Airplane Mode: the "You're offline" bar should appear. Turn it off and the fridge should reload.
   - Sign out, tap **Email me a sign-in link** on the first screen, then tap the link in Mail. It should open the app, not Safari.
   - Delete the account under Settings (use a throwaway email for this one)

## Part 6. Upload a build (each release, 15 minutes)

1. Build the production version. This is important: the dev build points push at Apple's sandbox.

   ```bash
   cd ~/Code/simplykrisp-produce-guide/app
   npm run sync
   ```

2. In Xcode, set the version under the **General** tab of the App target:
   - **Version**: `1.0` for the first release (what people see)
   - **Build**: `1`. Increase it on every upload, even for the same version (1, 2, 3…). App Store Connect rejects a repeated build number.
3. In the device menu at the top choose **Any iOS Device (arm64)**.
4. **Product → Archive**. When it finishes, the Organizer window opens.
5. Select the new archive → **Distribute App** → **App Store Connect** → **Distribute**. Leave the default options, including automatic signing. Xcode switches push to production for you.
6. Wait for the email "has completed processing" (10–30 minutes). If Apple emails an "ITMS-" warning or error instead, forward it or paste it into a new Perplexity task.

## Part 7. TestFlight (optional, recommended for the first release)

App Store Connect → your app → **TestFlight**:

- **Internal testing**: + next to Internal Testing → add yourself and anyone on your App Store Connect team. Builds are available right away in the TestFlight app on their phones.
- **External testers** (CSA partners, friends): create a group, add emails or turn on a public link. The first external build gets a short Beta App Review, usually within a day.

Live with it for a few days of real grocery trips before you submit.

## Part 8. Listing and submit (first release, about an hour)

App Store Connect → your app → **iOS App 1.0** (under Distribution):

1. **Screenshots.** Apple needs 3–10 iPhone screenshots at the 6.9-inch size (1320 × 2868 pixels). The easiest way to get them:
   - In Xcode choose **iPhone 17 Pro Max** (or the largest "Pro Max" in the simulator list) and press Run
   - Sign in, add a realistic trip of produce, and press **⌘S** in the Simulator on each screen. The files save to your Desktop at the right size.
   - Suggested five: kitchen map, use-first list, adding a receipt, impact dashboard, and a produce storage tip
   - Starting April 2027, Apple also requires iPhone Duo screenshots.
2. **Promotional text** (170 characters, can change anytime): `Know where every fruit and vegetable goes, what to eat first, and how much you saved from the trash.`
3. **Description**: lead with reducing waste, not the sachet. For example:

   > My Krisper tells you where to store the produce you just bought, which items to eat first, and how much you ate versus tossed.
   >
   > • Snap a receipt, forward an order email or add items by hand
   > • A kitchen map puts each item in the right spot: fridge shelf, crisper drawers, counter or pantry
   > • "Eat these first" reminders before things go soft
   > • A weekly fridge check and a before-you-shop list
   > • See your estimated food, money and CO₂ saved
   >
   > Free, from Simply Krisp.

4. **Keywords** (100 characters, commas, no spaces): `produce,food waste,fridge,grocery,storage,crisper,vegetables,fruit,leftovers,meal,kitchen,fresh`
5. **Support URL**: `https://guide.simplykrisp.com/krisper` (or your contact page). **Marketing URL**: `https://guide.simplykrisp.com`
6. **Build**: click **+** and pick the build from Part 6.
7. **App Review Information**:
   - Sign-in required: **No**. Reviewers can create an account with any email inside the app, and it works right away.
   - Contact: your name, email and phone in `+1 801…` format (Apple rejects a phone number without the country code)
   - Notes (paste and edit):

     > My Krisper is a free produce-storage and food-waste tool from Simply Krisp. Create an account with any email on the first screen (no password, no verification needed). To see a full fridge right away, use this test account sign-in link: https://guide.simplykrisp.com/krisper?k=PASTE_KEY
     >
     > Native features: push reminders ("Eat these first", "Before you shop"), receipt capture with the camera, universal sign-in links, and an offline notice. Before the first receipt photo, the app asks whether to send it to Google Gemini or read it on the device (guideline 5.1.2(i)). Account deletion: Settings → Delete my Krisper.
     >
     > Simply Krisp sachets are physical goods sold through our Shopify store, opened in a Safari sheet (guideline 3.1.3(e)).

     To get the test-account link, create an account in the app with an address like `appreview@simplykrisp.com`, add 8–10 items, then Settings → copy your sign-in link.
8. **Version Release**: choose **Manually release this version**, so you control launch day.
9. **Add for Review → Submit**. Review usually takes 1–2 days. You'll get an email either way.

## If Apple rejects it

- **4.2 Minimum Functionality** ("repackaged website"): reply in Resolution Center and list the native features in the notes above. If they hold firm, the next step is the home-screen widget in the README's "Later" list.
- **2.1 Information Needed**: they want more on how something works. Answer in Resolution Center; you don't need a new build.
- **5.1.1 / 5.1.2 privacy**: usually means the privacy policy doesn't mention something the app does. Update the policy, then reply.

Anything else: copy the full rejection message into a Perplexity task along with this repo.

## Each later release

```bash
cd ~/Code/simplykrisp-produce-guide && git pull && cd app && npm install && npm run sync && npm run open
```

Raise **Build** (and **Version** if it's a feature release) → Product → Archive → Distribute → in App Store Connect click **+** next to iOS App, choose the new version, pick the build → Submit.

Changes to `crisper/index.html` reach the website right away but reach the app only through a new build like this.
