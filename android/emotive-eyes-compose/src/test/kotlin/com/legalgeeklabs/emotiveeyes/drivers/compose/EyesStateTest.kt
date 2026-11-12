package com.legalgeeklabs.emotiveeyes.drivers.compose

import com.legalgeeklabs.emotiveeyes.drivers.android.EyesSpec
import com.legalgeeklabs.emotiveeyes.features.animateface.RandomSource
import com.legalgeeklabs.emotiveeyes.interfaces.SpecParser
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EyesStateTest {
    private var nanos = 0L

    private fun spec(): EyesSpec {
        val dir = File(checkNotNull(System.getProperty("emotiveeyes.specDir")))

        fun read(name: String) = File(dir, "runtime/$name").readText()
        return EyesSpec(
            SpecParser.parseFaceSpec(read("face.json")),
            SpecParser.parseMotionSpec(read("motion.json")),
            SpecParser.parseStatusSpec(read("status.json")),
        )
    }

    private fun eyeHeight(state: EyesState) =
        state.geometry.left.eye
            .let { it.bottom - it.top }

    // Regression guard: a command after idle time must not integrate that idle time against its new target.
    @Test
    fun commandAfterIdleDoesNotCompleteTransitionInstantly() {
        val spec = spec()
        val rest = spec.face.layout.eyeHeight
        val target =
            rest *
                checkNotNull(
                    spec.face.expressions
                        .getValue("surprised")
                        .shared.scaleY,
                )
        val state = EyesState(spec, random = RandomSource { 0.99 }, nanoClock = { nanos })
        nanos += 1_000_000_000L // 1 s idle while "sleeping"
        state.setExpression("surprised")
        assertEquals(rest, eyeHeight(state), 1e-9)
        nanos += 20_000_000L
        state.setExpression("surprised") // catch-up step of 20 ms toward the target
        val h = eyeHeight(state)
        assertTrue(h > rest && h < target - 1.0, "mid-transition height was $h (rest $rest, target $target)")
    }
}
