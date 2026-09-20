const fs = require("fs");
const path = require("path");
const { withDangerousMod, withProjectBuildGradle } = require("@expo/config-plugins");

/**
 * Wires the Mappls map SDK (`mappls-map-react-native`) into the generated
 * Android project.
 *
 * The package ships an `app.plugin.js`, but it points at a `plugin/build` folder
 * that is missing from the published npm package (2.0.3), so listing the
 * package itself in app.json breaks prebuild. This does the two things that
 * plugin would have done:
 *
 *  1. Adds Mappls' Maven repository, where the native SDK artifacts live.
 *  2. Copies the Auth Console credentials (`<appId>.a.olf` and `<appId>.a.conf`)
 *     from `frontend/mappls/` into `android/app/`, where the SDK's Gradle script
 *     looks for them. They are bound to the package name and signing
 *     certificate, and they are gitignored: never commit them.
 */

const MAPPLS_MAVEN = "https://maven.mappls.com/repository/mappls/";
const CREDENTIALS_DIR = "mappls";
const CREDENTIAL_EXTENSIONS = [".a.olf", ".a.conf"];

function withMapplsMaven(config) {
  return withProjectBuildGradle(config, (mod) => {
    const contents = mod.modResults.contents;
    if (contents.includes(MAPPLS_MAVEN)) {
      return mod;
    }
    const allProjectsRepositories = /allprojects\s*\{\s*repositories\s*\{/;
    if (!allProjectsRepositories.test(contents)) {
      throw new Error("[with-mappls-sdk] No allprojects { repositories { } } block in android/build.gradle to add the Mappls repository to.");
    }
    mod.modResults.contents = contents.replace(
      allProjectsRepositories,
      (match) => `${match}\n    maven { url '${MAPPLS_MAVEN}' }`,
    );
    return mod;
  });
}

function withMapplsCredentials(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const source = path.join(mod.modRequest.projectRoot, CREDENTIALS_DIR);
      const target = path.join(mod.modRequest.platformProjectRoot, "app");
      const files = fs.existsSync(source)
        ? fs.readdirSync(source).filter((name) => CREDENTIAL_EXTENSIONS.some((extension) => name.endsWith(extension)))
        : [];

      if (files.length === 0) {
        // A warning, not an error: prebuild should still work on a machine
        // without the credentials. The Gradle build is what fails, and it says why.
        console.warn(`[with-mappls-sdk] No .a.olf / .a.conf files in ${CREDENTIALS_DIR}/. The Android build will fail until they are added.`);
      }
      for (const name of files) {
        fs.copyFileSync(path.join(source, name), path.join(target, name));
      }
      return mod;
    },
  ]);
}

module.exports = function withMapplsSdk(config) {
  return withMapplsCredentials(withMapplsMaven(config));
};
