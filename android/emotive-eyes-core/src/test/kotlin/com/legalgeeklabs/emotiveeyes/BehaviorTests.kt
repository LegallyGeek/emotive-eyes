package com.legalgeeklabs.emotiveeyes

import com.legalgeeklabs.emotiveeyes.entities.Expression
import com.legalgeeklabs.emotiveeyes.entities.EyeParams
import com.legalgeeklabs.emotiveeyes.entities.FaceGeometry
import com.legalgeeklabs.emotiveeyes.entities.PartialEyeParams
import com.legalgeeklabs.emotiveeyes.entities.Side
import com.legalgeeklabs.emotiveeyes.entities.Spring
import com.legalgeeklabs.emotiveeyes.entities.Vec2
import com.legalgeeklabs.emotiveeyes.entities.computeEyeGeometry
import com.legalgeeklabs.emotiveeyes.entities.criticalDamping
import com.legalgeeklabs.emotiveeyes.entities.resolveParams
import com.legalgeeklabs.emotiveeyes.entities.stepSpring
import com.legalgeeklabs.emotiveeyes.features.animateface.RandomSource
import com.legalgeeklabs.emotiveeyes.features.reportstatus.StatusInput
import com.legalgeeklabs.emotiveeyes.features.reportstatus.StatusTracker
import com.legalgeeklabs.emotiveeyes.interfaces.EyesController
import com.legalgeeklabs.emotiveeyes.interfaces.SpecException
import com.legalgeeklabs.emotiveeyes.interfaces.SpecParser
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RuntimeSpecTest {
    @Test
    fun realRuntimeFilesParse() {
        val face = SpecParser.parseFaceSpec(specText("runtime/face.json"))
        val motion = SpecParser.parseMotionSpec(specText("runtime/motion.json"))
        val status = SpecParser.parseStatusSpec(specText("runtime/status.json"))
        assertEquals(240.0, motion.substepHz)
        val expressionCount = specJson("runtime/face.json").getValue("expressions").obj().size
        assertEquals(expressionCount, face.expressions.size)
        assertTrue("neutral" in face.expressions)
        assertEquals("angry", status.expressionFor["error"])
    }

    @Test
    fun blinkSpecIsValidated() {
        val motion = specText("runtime/motion.json")

        fun rejects(mutated: String) = assertFailsWith<SpecException> { SpecParser.parseMotionSpec(mutated) }
        rejects(motion.replace("\"anchor\": 0,", "\"anchor\": 0, \"closeMs\": 70,"))
        rejects(motion.replace("\"anchor\": 0,", "\"anchor\": 1.5,"))
        rejects(motion.replace("\"style\": \"narrow\"", "\"style\": \"nope\""))
        rejects(motion.replace("\"levelTo\": 0.15", "\"levelTo\": 1"))
        rejects(motion.replace("\"height\": 1,", "\"height\": 0.9,"))
        rejects(motion.replace("\"ms\": 20", "\"ms\": 0"))
    }

    @Test
    fun parserRejectsBadInput() {
        assertFailsWith<SpecException> { SpecParser.parseMotionSpec("{}") }
        assertFailsWith<SpecException> { SpecParser.parseFaceSpec("not json") }
        val face = specText("runtime/face.json")
        assertFailsWith<SpecException> {
            SpecParser.parseFaceSpec(face.replace("\"happy\"", "\"happy\": { \"bogus\": 1 }, \"x\""))
        }
        assertFailsWith<SpecException> {
            SpecParser.parseFaceSpec(face.replace("\"roundness\": 0.22", "\"roundness\": \"0.22\""))
        }
    }

    @Test
    fun controllerRejectsDanglingStatusMapping() {
        val face = SpecParser.parseFaceSpec(specText("runtime/face.json"))
        val motion = SpecParser.parseMotionSpec(specText("runtime/motion.json"))
        val status = SpecParser.parseStatusSpec(specText("runtime/status.json").replace("\"focused\"", "\"nope\""))
        assertFailsWith<SpecException> { EyesController(face, motion, status, RandomSource { 0.5 }) }
    }
}

class GeometryBehaviorTest {
    private val face = SpecParser.parseFaceSpec(specText("runtime/face.json"))

    private fun resolved(name: String) =
        face.expressions.getValue(name).let { resolveParams(face.defaults, it, Side.LEFT) }

    @Test
    fun angryDropsInnerCornerOnBothEyes() {
        val p = resolved("angry")
        val left = computeEyeGeometry(p, face.layout, Side.LEFT).upperLid
        val right = computeEyeGeometry(p, face.layout, Side.RIGHT).upperLid
        assertTrue(left[2].y > left[3].y, "left eye inner (right) edge lower")
        assertTrue(right[3].y > right[2].y, "right eye inner (left) edge lower")
    }

    @Test
    fun sadDropsOuterCorner() {
        val g = computeEyeGeometry(resolved("sad"), face.layout, Side.LEFT).upperLid
        assertTrue(g[3].y > g[2].y)
    }

    @Test
    fun happyLowerLidPeakIsHalfTheBend() {
        val p = resolved("glee")
        val g = computeEyeGeometry(p, face.layout, Side.LEFT)
        val eh = face.layout.eyeHeight * p.scaleY
        val lowY = g.eye.bottom - eh * p.lowerLid
        assertEquals(lowY - eh * p.lowerLidBend, g.lowerLid.control.y, 1e-12)
    }

    @Test
    fun upperLidQuadStaysConvexAtZeroLidWithTilt() {
        val p = resolved("neutral").copy(upperLid = 0.0, upperLidTilt = 30.0)
        val q = computeEyeGeometry(p, face.layout, Side.LEFT).upperLid
        val crosses =
            q.indices.map { i ->
                val a = q[i]
                val b = q[(i + 1) % 4]
                val c = q[(i + 2) % 4]
                (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
            }
        assertTrue(crosses.all { it >= 0 } || crosses.all { it <= 0 }, "cross products $crosses")
    }

    @Test
    fun radiusAndLidsAreClamped() {
        val p = resolved("neutral").copy(roundness = 99.0, upperLid = 5.0, lowerLid = -3.0, scaleX = -1.0)
        val g = computeEyeGeometry(p, face.layout, Side.LEFT)
        assertEquals(0.0, g.eye.radius)
        val q = resolved("neutral").copy(roundness = 99.0, upperLid = 5.0)
        val r = computeEyeGeometry(q, face.layout, Side.LEFT)
        assertEquals(minOf(r.eye.right - r.eye.left, r.eye.bottom - r.eye.top) / 2, r.eye.radius, 1e-12)
        assertEquals(r.eye.bottom, r.upperLid[2].y, 1e-12)
    }

    @Test
    fun partialOverridesResolvePerSide() {
        val e = Expression(PartialEyeParams(upperLid = 0.2), left = PartialEyeParams(upperLid = 0.5), right = null)
        assertEquals(0.5, resolveParams(face.defaults, e, Side.LEFT).upperLid)
        assertEquals(0.2, resolveParams(face.defaults, e, Side.RIGHT).upperLid)
    }
}

class SpringBehaviorTest {
    private fun run(damping: Double): Pair<Double, Double> {
        val s = Spring(0.0)
        s.target = 1.0
        var peak = 0.0
        repeat(2400) {
            stepSpring(s, 220.0, damping, 1.0 / 240)
            peak = maxOf(peak, s.value)
        }
        return peak to s.value
    }

    @Test
    fun underdampedOvershootsButCriticalDoesNot() {
        assertTrue(run(16.0).first > 1.001)
        assertTrue(run(criticalDamping(220.0)).first <= 1.0 + 1e-9)
        assertEquals(1.0, run(16.0).second, 1e-6)
    }
}

class StatusBehaviorTest {
    private val spec = SpecParser.parseStatusSpec(specText("runtime/status.json"))

    @Test
    fun baselineThenGlanceAndErrors() {
        val t = StatusTracker(spec)
        val dir = Vec2(1.0, 0.0)
        assertNull(t.update(listOf(StatusInput("a", "ok", dir))).glance)
        val r = t.update(listOf(StatusInput("a", "error", dir)))
        assertEquals("angry", r.expression)
        assertNotNull(r.glance)
        assertFailsWith<IllegalArgumentException> { t.update(listOf(StatusInput("a", "bogus"))) }
        assertFailsWith<IllegalArgumentException> { t.update(listOf(StatusInput("a", "ok"), StatusInput("a", "ok"))) }
        assertEquals("neutral", t.update(emptyList()).expression)
    }
}

class ControllerBehaviorTest {
    private fun controller(random: RandomSource = RandomSource { 0.5 }) =
        EyesController(
            SpecParser.parseFaceSpec(specText("runtime/face.json")),
            SpecParser.parseMotionSpec(specText("runtime/motion.json")),
            SpecParser.parseStatusSpec(specText("runtime/status.json")),
            random,
            blinking = false,
            idleGaze = false,
        )

    @Test
    fun settlesOnTargetAndWinnerTakesAll() {
        val c = controller()
        assertTrue(c.isSettled())
        c.setStatuses(listOf(StatusInput("a", "ok")))
        c.setExpression("sleepy")
        repeat(300) { c.step(16.6) }
        assertTrue(c.isSettled())
        assertFailsWith<IllegalArgumentException> { c.setExpression("nope") }
    }

    @Test
    fun interruptedTransitionKeepsContinuity() {
        val c = controller()
        c.setExpression("surprised")
        val before =
            c
                .step(100.0)
                .left.eye.top
        c.setExpression("sleepy")
        val after =
            c
                .step(1.0)
                .left.eye.top
        assertTrue(kotlin.math.abs(after - before) < 2.0)
    }

    @Test
    fun adHocExpressionResolvesLikePreset() {
        val c = controller()
        c.setExpression(Expression(PartialEyeParams(scaleX = 0.5)))
        repeat(600) { c.step(16.6) }
        val g = c.step(0.0).left.eye
        assertEquals(c.layout.eyeWidth / 2, g.right - g.left, 0.01)
        assertEquals(EyeParams.KEYS.size, 9)
    }

    @Test
    fun glanceMovesGazeUnderReducedMotion() {
        val c = controller()
        c.setReducedMotion(true)
        val before =
            c
                .step(0.0)
                .left.eye.left
        c.glance(Vec2(1.0, 0.0))
        repeat(30) { c.step(16.6) }
        assertTrue(
            c
                .step(0.0)
                .left.eye.left > before + 1.0,
        )
    }

    // Time at which the narrow table first reaches its minimum height.
    private val closedMs: Double =
        SpecParser.parseMotionSpec(specText("runtime/motion.json")).blink.styles.getValue("narrow").let { table ->
            val minHeight = table.minOf { it.height }
            table.takeWhile { it.height != minHeight }.sumOf { it.ms } + table.first { it.height == minHeight }.ms
        }

    private fun blinkClosed(
        style: String?,
        anchor: Double? = null,
        expression: String? = null,
    ): FaceGeometry {
        val c = controller()
        style?.let(c::setBlinkStyle)
        expression?.let {
            c.setExpression(it)
            repeat(300) { c.step(16.6) }
        }
        c.blink(anchor)
        c.step(closedMs + 5.0) // just inside the closed hold
        return c.step(0.0)
    }

    @Test
    fun blinkAnchorMovesTheClosedLine() {
        fun centre(anchor: Double?): Double = blinkClosed(null, anchor).left.eye.let { (it.top + it.bottom) / 2 }
        val high = centre(-0.5)
        val mid = centre(null)
        val low = centre(0.5)
        assertTrue(high < mid && mid < low, "high=$high mid=$mid low=$low")
        assertFailsWith<IllegalArgumentException> { controller().blink(1.5) }
    }

    @Test
    fun narrowKeepsEyesSeparateAndWideMergesThem() {
        val narrow = blinkClosed("narrow")
        val wide = blinkClosed("wide")
        assertTrue(narrow.left.eye.bottom - narrow.left.eye.top < 5.0, "closed line is thin")
        assertEquals(narrow.left.eye.right - narrow.left.eye.left, narrow.right.eye.right - narrow.right.eye.left, 1e-9)
        assertTrue(narrow.left.eye.right < narrow.right.eye.left, "narrow eyes stay apart")
        assertTrue(wide.left.eye.right > wide.right.eye.left, "wide eyes overlap into one line")
    }

    @Test
    fun closedBlinkLevelsAsymmetricExpressionAndClearsLids() {
        val g = blinkClosed("narrow", expression = "skeptic")
        assertEquals(g.left.eye.top, g.right.eye.top, 1e-9)
        assertEquals(g.left.eye.bottom, g.right.eye.bottom, 1e-9)
        val angry = blinkClosed("narrow", expression = "angry")
        assertEquals(angry.left.upperLid[2].y, angry.left.upperLid[3].y, 1e-9, "tilt removed")
    }

    @Test
    fun blinkStyleSwitchTakesEffectAtNextBlinkAndUnknownThrows() {
        val c = controller()
        c.blink()
        c.step(60.0)
        val before = c.step(0.0).left.eye
        c.setBlinkStyle("wide")
        assertEquals(before, c.step(0.0).left.eye, "blink in progress is unaffected")
        assertFailsWith<IllegalArgumentException> { c.setBlinkStyle("nope") }
    }
}
