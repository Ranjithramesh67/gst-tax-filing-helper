package com.gstflow.client

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactInstanceManager
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader
import com.gstflow.client.sms.SmsReaderPackage
import java.io.File

class MainApplication : Application(), ReactApplication {

    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> =
                PackageList(this).packages.apply {
                    // Registers the SMS reader native module.
                    add(SmsReaderPackage())
                }

            override fun getJSMainModuleName(): String = "index"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            // When a remote bundle URL is configured, fetch the latest JS over HTTPS
            // instead of talking to a (unreachable) Metro dev server. Enables updating
            // the running app's JavaScript without reinstalling the APK.
            override fun createReactInstanceManager(): ReactInstanceManager {
                val builder = getBaseReactInstanceManagerBuilder()
                if (BuildConfig.DEBUG && BuildConfig.JS_BUNDLE_URL.isNotEmpty()) {
                    builder.setJSBundleLoader(
                        NetworkBundleLoader(
                            BuildConfig.JS_BUNDLE_URL,
                            File(cacheDir, "gstflow-js.bundle"),
                        )
                    )
                }
                return builder.build()
            }

            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
        }

    override val reactHost: ReactHost
        get() = getDefaultReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()
        SoLoader.init(this, false)
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            load()
        }
    }
}
