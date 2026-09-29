const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");

/**
 * The Aadhaar App check, on Android.
 *
 * <p>Opening a session charges the owner, so the app must know the Aadhaar App
 * is on this phone BEFORE it asks for one (owner's rule, 2026-09-27: the
 * Aadhaar App must be on the tenant's own device, never a second phone).
 *
 * <p>Android 11 package visibility hides other apps unless they are declared,
 * so the package goes into the manifest's <queries>. Same shape as the UPI
 * launcher next door: a small Kotlin module written at prebuild and registered
 * in MainApplication. Needs a dev-build rebuild, never runs in Expo Go.
 */
const AADHAAR_APP_PACKAGE = "in.gov.uidai.pehchaan";

const MODULE_SOURCE = (packageName) => `package ${packageName}

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AadhaarAppModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AadhaarApp"

  /** Whether UIDAI's Aadhaar App is installed on this phone. */
  @ReactMethod
  fun isInstalled(promise: Promise) {
    val packageManager = reactApplicationContext.packageManager
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        packageManager.getPackageInfo(PACKAGE, PackageManager.PackageInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(PACKAGE, 0)
      }
      promise.resolve(true)
    } catch (_: PackageManager.NameNotFoundException) {
      promise.resolve(false)
    }
  }

  /** Opens the Aadhaar App at its own start screen. Free: no session is involved. */
  @ReactMethod
  fun open(promise: Promise) {
    val intent = reactApplicationContext.packageManager.getLaunchIntentForPackage(PACKAGE)
    if (intent == null) {
      promise.resolve(false)
      return
    }
    start(intent, promise)
  }

  /**
   * Opens a session link straight in the Aadhaar App. Resolves false when the
   * Aadhaar App does not take the link, so the caller can hand it to the
   * browser instead.
   */
  @ReactMethod
  fun openLink(url: String, promise: Promise) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply { setPackage(PACKAGE) }
    if (intent.resolveActivity(reactApplicationContext.packageManager) == null) {
      promise.resolve(false)
      return
    }
    start(intent, promise)
  }

  /**
   * Whether Developer options is on. The Aadhaar App refuses to run while it
   * is (seen 2026-09-27), so the tenant is asked to turn it off before a paid
   * session opens. Readable without any permission.
   */
  @ReactMethod
  fun isDeveloperModeOn(promise: Promise) {
    val on = Settings.Global.getInt(
      reactApplicationContext.contentResolver,
      Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
      0,
    ) != 0
    promise.resolve(on)
  }

  /** Opens Developer options, where its own switch turns it off. Falls back to Settings. */
  @ReactMethod
  fun openDeveloperSettings(promise: Promise) {
    for (action in listOf(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS, Settings.ACTION_SETTINGS)) {
      try {
        launch(Intent(action))
        promise.resolve(true)
        return
      } catch (_: ActivityNotFoundException) {
        // Try the next one.
      } catch (error: Exception) {
        promise.reject("SETTINGS_OPEN_FAILED", error.message, error)
        return
      }
    }
    promise.resolve(false)
  }

  /**
   * Started from the current activity when there is one, so finishing in the
   * Aadhaar App comes back here rather than to the home screen.
   */
  private fun start(intent: Intent, promise: Promise) {
    try {
      launch(intent)
      promise.resolve(true)
    } catch (_: ActivityNotFoundException) {
      promise.resolve(false)
    } catch (error: Exception) {
      promise.reject("AADHAAR_APP_OPEN_FAILED", error.message, error)
    }
  }

  private fun launch(intent: Intent) {
    val activity = reactApplicationContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
    }
  }

  companion object {
    private const val PACKAGE = "${AADHAAR_APP_PACKAGE}"
  }
}
`;

const PACKAGE_SOURCE = (packageName) => `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AadhaarAppPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(AadhaarAppModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<in Nothing, in Nothing>> = emptyList()
}
`;

function withAadhaarAppQuery(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    manifest.queries = manifest.queries ?? [{}];
    const queries = manifest.queries[0];
    queries.package = queries.package ?? [];
    const exists = queries.package.some(
      (entry) => entry?.$?.["android:name"] === AADHAAR_APP_PACKAGE,
    );
    if (!exists) {
      queries.package.push({ $: { "android:name": AADHAAR_APP_PACKAGE } });
    }
    return androidConfig;
  });
}

function withAadhaarAppRegistration(config) {
  return withMainApplication(config, (mainApplicationConfig) => {
    let contents = mainApplicationConfig.modResults.contents;
    if (contents.includes("add(AadhaarAppPackage())")) {
      return mainApplicationConfig;
    }

    const packageBlock = /PackageList\(this\)\.packages\.apply\s*\{([\s\S]*?)\n\s*\}/;
    if (!packageBlock.test(contents)) {
      throw new Error("Could not find the React Native package list in MainApplication.kt");
    }

    contents = contents.replace(
      packageBlock,
      (match, body) => match.replace(body, `${body}\n              add(AadhaarAppPackage())`),
    );
    mainApplicationConfig.modResults.contents = contents;
    return mainApplicationConfig;
  });
}

function withAadhaarAppSources(config) {
  return withDangerousMod(config, ["android", async (androidConfig) => {
    const packageName = androidConfig.android?.package;
    if (!packageName) {
      throw new Error("android.package is required for the Aadhaar App check");
    }

    const sourceDir = path.join(
      androidConfig.modRequest.platformProjectRoot,
      "app",
      "src",
      "main",
      "java",
      ...packageName.split("."),
    );
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "AadhaarAppModule.kt"), MODULE_SOURCE(packageName));
    fs.writeFileSync(path.join(sourceDir, "AadhaarAppPackage.kt"), PACKAGE_SOURCE(packageName));
    return androidConfig;
  }]);
}

module.exports = function withAadhaarApp(config) {
  config = withAadhaarAppQuery(config);
  config = withAadhaarAppRegistration(config);
  return withAadhaarAppSources(config);
};
