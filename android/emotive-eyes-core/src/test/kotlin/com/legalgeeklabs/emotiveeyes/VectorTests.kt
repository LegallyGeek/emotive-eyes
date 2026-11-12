package com.legalgeeklabs.emotiveeyes

import com.legalgeeklabs.emotiveeyes.entities.BlinkKeyframe
import com.legalgeeklabs.emotiveeyes.entities.EyeAnchor
import com.legalgeeklabs.emotiveeyes.entities.EyeGeometry
import com.legalgeeklabs.emotiveeyes.entities.FaceParams
import com.legalgeeklabs.emotiveeyes.entities.Layout
import com.legalgeeklabs.emotiveeyes.entities.Side
import com.legalgeeklabs.emotiveeyes.entities.Spring
import com.legalgeeklabs.emotiveeyes.entities.SpringOverride
import com.legalgeeklabs.emotiveeyes.entities.Vec2
import com.legalgeeklabs.emotiveeyes.entities.blinkSample
import com.legalgeeklabs.emotiveeyes.entities.computeEyeGeometry
import com.legalgeeklabs.emotiveeyes.entities.stepSpring
import com.legalgeeklabs.emotiveeyes.features.animateface.FaceAnimator
import com.legalgeeklabs.emotiveeyes.features.animateface.RandomSource
import com.legalgeeklabs.emotiveeyes.features.reportstatus.StatusInput
import com.legalgeeklabs.emotiveeyes.features.reportstatus.StatusTracker
import com.legalgeeklabs.emotiveeyes.interfaces.SpecParser
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.TestFactory
import kotlin.test.assertEquals
import kotlin.test.assertNull

class GeometryVectorTest {
    private val file = specJson("vectors/geometry.json")

    private fun layout(o: JsonObject): Layout {
        val eyes = o.getValue("eyes").obj()

        fun anchor(side: String) =
            eyes.getValue(side).obj().let { EyeAnchor(it.getValue("x").num(), it.getValue("y").num()) }
        return Layout(
            o.getValue("width").num(),
            o.getValue("height").num(),
            o.getValue("eyeWidth").num(),
            o.getValue("eyeHeight").num(),
            o.getValue("lidOverscan").num(),
            anchor("left"),
            anchor("right"),
        )
    }

    private fun assertGeometry(
        expected: JsonObject,
        actual: EyeGeometry,
        name: String,
    ) {
        val eye = expected.getValue("eye").obj()
        assertClose(eye.getValue("left").num(), actual.eye.left, "$name.eye.left")
        assertClose(eye.getValue("top").num(), actual.eye.top, "$name.eye.top")
        assertClose(eye.getValue("right").num(), actual.eye.right, "$name.eye.right")
        assertClose(eye.getValue("bottom").num(), actual.eye.bottom, "$name.eye.bottom")
        assertClose(eye.getValue("radius").num(), actual.eye.radius, "$name.eye.radius")
        val lid = expected.getValue("upperLid").arr()
        assertEquals(lid.size, actual.upperLid.size)
        lid.forEachIndexed { i, e ->
            assertClose(point(e).x, actual.upperLid[i].x, "$name.upperLid[$i].x")
            assertClose(point(e).y, actual.upperLid[i].y, "$name.upperLid[$i].y")
        }
        val low = expected.getValue("lowerLid").obj()
        listOf(
            "start" to actual.lowerLid.start,
            "edgeLeft" to actual.lowerLid.edgeLeft,
            "control" to actual.lowerLid.control,
            "edgeRight" to actual.lowerLid.edgeRight,
            "end" to actual.lowerLid.end,
        ).forEach { (key, got) ->
            assertClose(point(low.getValue(key)).x, got.x, "$name.lowerLid.$key.x")
            assertClose(point(low.getValue(key)).y, got.y, "$name.lowerLid.$key.y")
        }
    }

    @TestFactory
    fun geometryCases(): List<DynamicTest> {
        val layout = layout(file.getValue("layout").obj())
        return file.getValue("cases").arr().map { c ->
            val case = c.obj()
            val name = case.getValue("name").str()
            dynamicTest(name) {
                val expected = case.getValue("expected").obj()
                assertGeometry(
                    expected.getValue("left").obj(),
                    computeEyeGeometry(eyeParams(case.getValue("left").obj()), layout, Side.LEFT),
                    "$name.left",
                )
                assertGeometry(
                    expected.getValue("right").obj(),
                    computeEyeGeometry(eyeParams(case.getValue("right").obj()), layout, Side.RIGHT),
                    "$name.right",
                )
            }
        }
    }
}

class SpringVectorTest {
    @TestFactory
    fun springCases(): List<DynamicTest> =
        specJson("vectors/spring.json").getValue("cases").arr().map { c ->
            val case = c.obj()
            val name = case.getValue("name").str()
            dynamicTest(name) {
                val start = case.getValue("start").obj()
                val spring = Spring(start.getValue("value").num())
                spring.velocity = start.getValue("velocity").num()
                spring.target = case.getValue("target").num()
                val h = 1 / case.getValue("substepHz").num()
                val stiffness = case.getValue("stiffness").num()
                val damping = case.getValue("damping").num()
                val expected = case.getValue("expected").arr()
                assertEquals(case.getValue("steps").num().toInt(), expected.size)
                expected.forEachIndexed { i, e ->
                    stepSpring(spring, stiffness, damping, h)
                    assertClose(e.obj().getValue("value").num(), spring.value, "$name[$i].value")
                    assertClose(e.obj().getValue("velocity").num(), spring.velocity, "$name[$i].velocity")
                }
            }
        }
}

class BlinkVectorTest {
    @TestFactory
    fun blinkCases(): List<DynamicTest> =
        specJson("vectors/blink.json").getValue("cases").arr().map { c ->
            val case = c.obj()
            val name = case.getValue("name").str()
            dynamicTest(name) {
                val keyframes =
                    case.getValue("keyframes").arr().map {
                        val k = it.obj()
                        BlinkKeyframe(k.getValue("height").num(), k.getValue("width").num(), k.getValue("ms").num())
                    }
                val gap = case.getValue("doubleBlinkGapMs").num()
                val isDouble = case.getValue("isDouble").bool()
                for (s in case.getValue("samples").arr()) {
                    val t = s.obj().getValue("tMs").num()
                    val got = blinkSample(t, keyframes, gap, isDouble)
                    assertClose(s.obj().getValue("height").num(), got.height, "$name@$t.height")
                    assertClose(s.obj().getValue("width").num(), got.width, "$name@$t.width")
                }
            }
        }
}

class StatusVectorTest {
    private val file = specJson("vectors/status.json")

    @TestFactory
    fun statusSequences(): List<DynamicTest> {
        val spec = SpecParser.parseStatusSpec(file.getValue("status").toString())
        return file.getValue("sequences").arr().map { s ->
            val seq = s.obj()
            val name = seq.getValue("name").str()
            dynamicTest(name) {
                val tracker = StatusTracker(spec)
                val expected = seq.getValue("expected").arr()
                seq.getValue("updates").arr().forEachIndexed { i, update ->
                    val inputs =
                        update.arr().map {
                            val o = it.obj()
                            val d = o["direction"]?.takeIf { v -> v !is JsonNull }?.obj()
                            StatusInput(
                                o.getValue("id").str(),
                                o.getValue("status").str(),
                                d?.let { v -> Vec2(v.getValue("x").num(), v.getValue("y").num()) },
                            )
                        }
                    val want = expected[i].obj()
                    val got = tracker.update(inputs)
                    assertEquals(want.getValue("expression").str(), got.expression, "$name[$i].expression")
                    val g = want.getValue("glance")
                    if (g is JsonNull) {
                        assertNull(got.glance, "$name[$i].glance")
                    } else {
                        assertClose(g.obj().getValue("x").num(), checkNotNull(got.glance).x, "$name[$i].glance.x")
                        assertClose(g.obj().getValue("y").num(), checkNotNull(got.glance).y, "$name[$i].glance.y")
                    }
                }
            }
        }
    }
}

class AnimatorVectorTest {
    private class ScriptedRandom(
        private val values: List<Double>,
    ) : RandomSource {
        var consumed = 0

        override fun next(): Double {
            check(consumed < values.size) { "random source exhausted after $consumed draws" }
            return values[consumed++]
        }
    }

    private fun faceParams(o: JsonObject) =
        FaceParams(eyeParams(o.getValue("left").obj()), eyeParams(o.getValue("right").obj()))

    private fun override(o: JsonObject?) = o?.let { SpringOverride(it["stiffness"]?.num(), it["damping"]?.num()) }

    @TestFactory
    fun animatorCases(): List<DynamicTest> =
        specJson("vectors/animator.json").getValue("cases").arr().map { c ->
            val case = c.obj()
            val name = case.getValue("name").str()
            dynamicTest(name) {
                val random = ScriptedRandom(case.getValue("randoms").arr().map { it.num() })
                val flags = case.getValue("flags").obj()
                val animator =
                    FaceAnimator(
                        SpecParser.parseMotionSpec(case.getValue("motion").toString()),
                        random,
                        faceParams(case.getValue("initial").obj()),
                        flags.getValue("blinking").bool(),
                        flags.getValue("idleGaze").bool(),
                        flags.getValue("reducedMotion").bool(),
                    )
                val ops = case.getValue("ops").arr()
                val expected = case.getValue("expected").arr()
                assertEquals(ops.size, expected.size)
                ops.forEachIndexed { i, opElement ->
                    val op = opElement.obj()
                    var frame: FaceParams? = null
                    when (val kind = op.getValue("op").str()) {
                        "step" -> frame = animator.step(op.getValue("dt").num())
                        "setTarget" -> animator.setTarget(faceParams(op))
                        "blink" -> animator.blink(op["anchor"]?.num())
                        "setBlinkStyle" -> animator.setBlinkStyle(op.getValue("name").str())
                        "glance" -> animator.glance(Vec2(op.getValue("x").num(), op.getValue("y").num()))
                        "setBlinking" -> animator.setBlinking(op.getValue("value").bool())
                        "setIdleGaze" -> animator.setIdleGaze(op.getValue("value").bool())
                        "setReducedMotion" -> animator.setReducedMotion(op.getValue("value").bool())
                        "setSprings" -> {
                            val s = op.getValue("springs").obj()
                            animator.setSprings(override(s["expression"]?.obj()), override(s["gaze"]?.obj()))
                        }
                        else -> error("unknown op $kind")
                    }
                    val want = expected[i].obj()
                    val label = "$name[op $i ${op.getValue("op").str()}]"
                    val got = frame ?: animator.frame()
                    assertEyeParamsClose(eyeParams(want.getValue("left").obj()), got.left, "$label.left")
                    assertEyeParamsClose(eyeParams(want.getValue("right").obj()), got.right, "$label.right")
                    assertEquals(want.getValue("settled").bool(), animator.isSettled(), "$label.settled")
                    assertCloseOrNull(
                        want.getValue("msUntilNextEvent"),
                        animator.msUntilNextEvent(),
                        "$label.msUntilNextEvent",
                    )
                    assertEquals(
                        want.getValue("randomsConsumed").num().toInt(),
                        random.consumed,
                        "$label.randomsConsumed",
                    )
                }
            }
        }
}
