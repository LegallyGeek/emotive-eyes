package com.legalgeeklabs.emotiveeyes.drivers.android

import android.content.Context
import com.legalgeeklabs.emotiveeyes.entities.FaceSpec
import com.legalgeeklabs.emotiveeyes.entities.MotionSpec
import com.legalgeeklabs.emotiveeyes.entities.StatusSpec
import com.legalgeeklabs.emotiveeyes.interfaces.SpecParser

/** The three parsed runtime specs the eyes need. */
public class EyesSpec(
    public val face: FaceSpec,
    public val motion: MotionSpec,
    public val status: StatusSpec,
) {
    public companion object {
        /**
         * Loads the shared `face.json`, `motion.json` and `status.json` packaged as assets by this module.
         *
         * @throws com.legalgeeklabs.emotiveeyes.interfaces.SpecException if a file is invalid
         */
        public fun fromAssets(context: Context): EyesSpec {
            fun read(name: String) =
                context.assets
                    .open(name)
                    .bufferedReader()
                    .use { it.readText() }
            return EyesSpec(
                face = SpecParser.parseFaceSpec(read("face.json")),
                motion = SpecParser.parseMotionSpec(read("motion.json")),
                status = SpecParser.parseStatusSpec(read("status.json")),
            )
        }
    }
}
