const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");

const UPI_PACKAGES = [
  "com.google.android.apps.nbu.paisa.user",
  "com.phonepe.app",
  "net.one97.paytm",
  "in.org.npci.upiapp",
  "in.amazon.mShop.android.shopping",
];

const MODULE_SOURCE = (packageName) => `package ${packageName}

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class UpiIntentModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "UpiIntentLauncher"

  @ReactMethod
  fun openUpiApp(upiUri: String, packageName: String, promise: Promise) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(upiUri)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    if (intent.resolveActivity(reactApplicationContext.packageManager) == null) {
      promise.resolve(false)
      return
    }

    try {
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (_: ActivityNotFoundException) {
      promise.resolve(false)
    } catch (error: Exception) {
      promise.reject("UPI_APP_OPEN_FAILED", error.message, error)
    }
  }
}
`;

const PACKAGE_SOURCE = (packageName) => `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class UpiIntentPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(UpiIntentModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<in Nothing, in Nothing>> = emptyList()
}
`;

function withUpiQueries(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    manifest.queries = manifest.queries ?? [{}];
    const queries = manifest.queries[0];
    queries.package = queries.package ?? [];

    for (const packageName of UPI_PACKAGES) {
      const exists = queries.package.some(
        (entry) => entry?.$?.["android:name"] === packageName,
      );
      if (!exists) {
        queries.package.push({ $: { "android:name": packageName } });
      }
    }

    queries.intent = queries.intent ?? [];
    const hasUpiQuery = queries.intent.some((entry) =>
      entry?.data?.some((data) => data?.$?.["android:scheme"] === "upi"),
    );
    if (!hasUpiQuery) {
      queries.intent.push({
        action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
        data: [{ $: { "android:scheme": "upi" } }],
      });
    }

    return androidConfig;
  });
}

function withUpiPackageRegistration(config) {
  return withMainApplication(config, (mainApplicationConfig) => {
    let contents = mainApplicationConfig.modResults.contents;
    if (contents.includes("add(UpiIntentPackage())")) {
      return mainApplicationConfig;
    }

    const packageBlock = /PackageList\(this\)\.packages\.apply\s*\{([\s\S]*?)\n\s*\}/;
    if (!packageBlock.test(contents)) {
      throw new Error("Could not find the React Native package list in MainApplication.kt");
    }

    contents = contents.replace(
      packageBlock,
      (match, body) => match.replace(body, `${body}\n              add(UpiIntentPackage())`),
    );
    mainApplicationConfig.modResults.contents = contents;
    return mainApplicationConfig;
  });
}

function withUpiNativeSources(config) {
  return withDangerousMod(config, ["android", async (androidConfig) => {
    const packageName = androidConfig.android?.package;
    if (!packageName) {
      throw new Error("android.package is required for the UPI intent launcher");
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
    fs.writeFileSync(path.join(sourceDir, "UpiIntentModule.kt"), MODULE_SOURCE(packageName));
    fs.writeFileSync(path.join(sourceDir, "UpiIntentPackage.kt"), PACKAGE_SOURCE(packageName));
    return androidConfig;
  }]);
}

module.exports = function withUpiIntentLauncher(config) {
  config = withUpiQueries(config);
  config = withUpiPackageRegistration(config);
  return withUpiNativeSources(config);
};
