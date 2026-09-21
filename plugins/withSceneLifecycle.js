const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

/**
 * Adopts the UIScene life cycle on iOS.
 *
 * iOS 27 asserts at launch unless an app adopts scenes: UIKit runs
 * `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` and traps with EXC_BREAKPOINT
 * before any of our code runs. A binary built against an older SDK is exempt, which is why this
 * only began crashing when the build moved to Xcode 27 — the app itself was never at fault, and
 * waiting for a toolchain that still lets us skip it only postpones this.
 *
 * Expo 57 already ships both halves of the answer, `ExpoAppSceneDelegate` and
 * `SceneEventForwarder`, but nothing in the SDK turns them on: the generated AppDelegate still
 * builds the window itself and no scene manifest is emitted. This plugin connects them.
 *
 * It lives here rather than in `ios/` because that directory is generated and gitignored — an
 * edit made there is correct until the next prebuild and then silently gone.
 */

/** Marks an already-patched AppDelegate, so a non-clean prebuild does not apply this twice. */
const MARKER = "// rekordo:scene-lifecycle";

/**
 * Declaring the manifest is what actually clears the assert; the rest of this file is about the
 * app still working afterwards. One scene only: Rekordo has a single window and no iPad
 * multi-window support to speak of.
 */
const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            // Spelled without a module prefix because the class carries an explicit
            // `@objc(SceneDelegate)` name below. `$(PRODUCT_MODULE_NAME).SceneDelegate` would
            // also resolve, but it breaks the moment the product name changes.
            UISceneDelegateClassName: "SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });

/**
 * Under the scene life cycle the window belongs to the scene, not the application: UIKit hands
 * the app delegate no window to attach to, and `UIScreen.main.bounds` is deprecated in that
 * world. So the app delegate keeps ownership of the factory and hands it over, which is exactly
 * the contract `ExpoReactNativeFactoryProvider` describes.
 */
const withSceneDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    let contents = cfg.modResults.contents;

    contents = contents.replace(
      "class AppDelegate: ExpoAppDelegate {",
      `class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider { ${MARKER}`,
    );

    // Starting React Native here as well as in the scene delegate would mount the app twice, into
    // a window that is never shown. The factory and delegate are still built here: the scene
    // delegate reads them back through the protocol once UIKit gives it a window scene.
    const startsReactNative = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow[\s\S]*?#endif\n/;
    if (!startsReactNative.test(contents)) {
      throw new Error(
        "withSceneLifecycle: the generated AppDelegate no longer starts React Native the way " +
          "this plugin expects. Check whether the Expo SDK now adopts scenes on its own — if it " +
          "does, delete this plugin rather than teaching it the new shape.",
      );
    }
    contents = contents.replace(startsReactNative, "");

    // Kept in AppDelegate.swift rather than a file of its own so that no entry has to be added to
    // the Xcode project: patching project.pbxproj from a plugin is the fragile part of this job,
    // and a second class in one file costs nothing.
    contents += `
/**
 * The window, under iOS 27's scene life cycle.
 *
 * Everything worth having is inherited: \`ExpoAppSceneDelegate\` builds the window from the
 * connecting scene, starts React Native into it, rebuilds the launch options that
 * \`Linking.getInitialURL()\` expects from a cold-start URL, and re-feeds life-cycle, URL,
 * user-activity and quick-action events back to the app delegate — which matters because UIKit
 * stops calling the app delegate's versions once scenes are adopted.
 */
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {}
`;

    cfg.modResults.contents = contents;
    return cfg;
  });

module.exports = (config) => withSceneDelegate(withSceneManifest(config));
