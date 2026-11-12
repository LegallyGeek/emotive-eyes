package com.legalgeeklabs.emotiveeyes.drivers.android

import android.content.Context
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings

/** Reads and observes the system "remove animations" setting. */
public object SystemMotionSettings {
    /** True when the system animator duration scale is 0 (animations removed). */
    public fun isReducedMotion(context: Context): Boolean =
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

    /** Calls [onChange] on the main thread whenever the setting changes; call the result to stop. */
    public fun observe(
        context: Context,
        onChange: () -> Unit,
    ): () -> Unit {
        val observer =
            object : ContentObserver(Handler(Looper.getMainLooper())) {
                override fun onChange(selfChange: Boolean) = onChange()
            }
        val resolver = context.contentResolver
        resolver.registerContentObserver(
            Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
            false,
            observer,
        )
        return { resolver.unregisterContentObserver(observer) }
    }
}
