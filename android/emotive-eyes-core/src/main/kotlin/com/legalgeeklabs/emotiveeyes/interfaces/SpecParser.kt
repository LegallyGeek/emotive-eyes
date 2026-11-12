package com.legalgeeklabs.emotiveeyes.interfaces

import com.legalgeeklabs.emotiveeyes.entities.BlinkSpec
import com.legalgeeklabs.emotiveeyes.entities.Expression
import com.legalgeeklabs.emotiveeyes.entities.EyeAnchor
import com.legalgeeklabs.emotiveeyes.entities.EyeParams
import com.legalgeeklabs.emotiveeyes.entities.FaceSpec
import com.legalgeeklabs.emotiveeyes.entities.GlanceSpec
import com.legalgeeklabs.emotiveeyes.entities.Interval
import com.legalgeeklabs.emotiveeyes.entities.Layout
import com.legalgeeklabs.emotiveeyes.entities.MotionSpec
import com.legalgeeklabs.emotiveeyes.entities.PartialEyeParams
import com.legalgeeklabs.emotiveeyes.entities.SaccadeSpec
import com.legalgeeklabs.emotiveeyes.entities.SpringConstants
import com.legalgeeklabs.emotiveeyes.entities.SpringsSpec
import com.legalgeeklabs.emotiveeyes.entities.StatusSpec
import com.legalgeeklabs.emotiveeyes.entities.Vec2
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Thrown for any invalid spec input; the message names the offending path. */
public class SpecException(
    message: String,
) : RuntimeException(message)

/**
 * Parses and validates the three runtime spec files (`face.json`, `motion.json`, `status.json`).
 * Unknown keys, non-numeric values and out-of-range values are rejected with [SpecException].
 */
public object SpecParser {
    private val allowedKeys =
        setOf("offsetX", "offsetY", "scaleX", "scaleY", "roundness", "upperLid") +
            setOf("upperLidTilt", "lowerLid", "lowerLidBend")

    /** Parses `face.json`. */
    public fun parseFaceSpec(json: String): FaceSpec {
        val root = root(json, "face")
        onlyKeys(root, setOf("layout", "defaults", "expressions"), "face")
        val l = obj(root["layout"], "face.layout")
        onlyKeys(l, setOf("width", "height", "eyeWidth", "eyeHeight", "lidOverscan", "eyes"), "face.layout")
        val eyes = obj(l["eyes"], "face.layout.eyes")
        onlyKeys(eyes, setOf("left", "right"), "face.layout.eyes")
        val layout =
            Layout(
                width = num(l["width"], "face.layout.width", min = 0.0, exclusiveMin = true),
                height = num(l["height"], "face.layout.height", min = 0.0, exclusiveMin = true),
                eyeWidth = num(l["eyeWidth"], "face.layout.eyeWidth", min = 0.0, exclusiveMin = true),
                eyeHeight = num(l["eyeHeight"], "face.layout.eyeHeight", min = 0.0, exclusiveMin = true),
                lidOverscan = num(l["lidOverscan"], "face.layout.lidOverscan", min = 0.0),
                leftEye = anchor(eyes["left"], "face.layout.eyes.left"),
                rightEye = anchor(eyes["right"], "face.layout.eyes.right"),
            )

        val d = partialParams(root["defaults"], "face.defaults")
        val defaults =
            EyeParams(
                offsetX = d.offsetX ?: missing("face.defaults.offsetX"),
                offsetY = d.offsetY ?: missing("face.defaults.offsetY"),
                scaleX = d.scaleX ?: missing("face.defaults.scaleX"),
                scaleY = d.scaleY ?: missing("face.defaults.scaleY"),
                roundness = d.roundness ?: missing("face.defaults.roundness"),
                upperLid = d.upperLid ?: missing("face.defaults.upperLid"),
                upperLidTilt = d.upperLidTilt ?: missing("face.defaults.upperLidTilt"),
                lowerLid = d.lowerLid ?: missing("face.defaults.lowerLid"),
                lowerLidBend = d.lowerLidBend ?: missing("face.defaults.lowerLidBend"),
            )

        val expressions = LinkedHashMap<String, Expression>()
        for ((name, value) in obj(root["expressions"], "face.expressions")) {
            expressions[name] = expression(value, "face.expressions.$name")
        }
        return FaceSpec(layout, defaults, expressions)
    }

    /** Parses `motion.json`. */
    public fun parseMotionSpec(json: String): MotionSpec {
        val root = root(json, "motion")
        onlyKeys(
            root,
            setOf("substepHz", "maxStepMs", "settleEpsilon", "springs", "blink", "saccade", "glance"),
            "motion",
        )
        val sp = obj(root["springs"], "motion.springs")
        onlyKeys(sp, setOf("expression", "gaze"), "motion.springs")
        val b = obj(root["blink"], "motion.blink")
        onlyKeys(
            b,
            setOf(
                "closeMs",
                "holdMs",
                "openMs",
                "minScale",
                "intervalMs",
                "doubleBlinkChance",
                "doubleBlinkGapMs",
            ),
            "motion.blink",
        )
        val sc = obj(root["saccade"], "motion.saccade")
        onlyKeys(sc, setOf("intervalMs", "amplitude"), "motion.saccade")
        val g = obj(root["glance"], "motion.glance")
        onlyKeys(g, setOf("holdMs", "offset"), "motion.glance")

        return MotionSpec(
            substepHz = num(root["substepHz"], "motion.substepHz", min = 0.0, exclusiveMin = true),
            maxStepMs = num(root["maxStepMs"], "motion.maxStepMs", min = 0.0, exclusiveMin = true),
            settleEpsilon = num(root["settleEpsilon"], "motion.settleEpsilon", min = 0.0, exclusiveMin = true),
            springs =
                SpringsSpec(
                    expression = springConstants(sp["expression"], "motion.springs.expression"),
                    gaze = springConstants(sp["gaze"], "motion.springs.gaze"),
                ),
            blink =
                BlinkSpec(
                    closeMs = num(b["closeMs"], "motion.blink.closeMs", min = 0.0),
                    holdMs = num(b["holdMs"], "motion.blink.holdMs", min = 0.0),
                    openMs = num(b["openMs"], "motion.blink.openMs", min = 0.0),
                    minScale = num(b["minScale"], "motion.blink.minScale", min = 0.0, max = 1.0),
                    intervalMs = interval(b["intervalMs"], "motion.blink.intervalMs"),
                    doubleBlinkChance = num(b["doubleBlinkChance"], "motion.blink.doubleBlinkChance", 0.0, 1.0),
                    doubleBlinkGapMs = num(b["doubleBlinkGapMs"], "motion.blink.doubleBlinkGapMs", min = 0.0),
                ),
            saccade =
                SaccadeSpec(
                    intervalMs = interval(sc["intervalMs"], "motion.saccade.intervalMs"),
                    amplitude = xy(sc["amplitude"], "motion.saccade.amplitude"),
                ),
            glance =
                GlanceSpec(
                    holdMs = num(g["holdMs"], "motion.glance.holdMs", min = 0.0),
                    offset = xy(g["offset"], "motion.glance.offset"),
                ),
        )
    }

    /** Parses `status.json`. */
    public fun parseStatusSpec(json: String): StatusSpec {
        val root = root(json, "status")
        onlyKeys(root, setOf("severity", "expressionFor", "emptyExpression"), "status")
        val raw = root["severity"]
        if (raw !is JsonArray || raw.isEmpty()) fail("status.severity", "expected a non-empty array")
        val severity =
            raw.mapIndexed { i, e ->
                val s = (e as? JsonPrimitive)?.takeIf { it.isString }?.content
                if (s.isNullOrEmpty()) fail("status.severity[$i]", "expected a non-empty string")
                s
            }
        if (severity.toSet().size != severity.size) fail("status.severity", "duplicate entries")

        val map = obj(root["expressionFor"], "status.expressionFor")
        val expressionFor = LinkedHashMap<String, String>()
        for (name in severity) {
            expressionFor[name] = string(map[name], "status.expressionFor.$name")
        }
        onlyKeys(map, severity.toSet(), "status.expressionFor")
        return StatusSpec(severity, expressionFor, string(root["emptyExpression"], "status.emptyExpression"))
    }

    private fun fail(
        path: String,
        problem: String,
    ): Nothing = throw SpecException("$path: $problem")

    private fun missing(path: String): Nothing = fail(path, "missing")

    private fun root(
        json: String,
        path: String,
    ): JsonObject {
        val element =
            try {
                Json.parseToJsonElement(json)
            } catch (e: SerializationException) {
                throw SpecException("$path: invalid JSON (${e.message})")
            }
        return obj(element, path)
    }

    private fun obj(
        v: JsonElement?,
        path: String,
    ): JsonObject = v as? JsonObject ?: fail(path, "expected an object")

    private fun string(
        v: JsonElement?,
        path: String,
    ): String = (v as? JsonPrimitive)?.takeIf { it.isString }?.content ?: fail(path, "missing or not a string")

    private fun onlyKeys(
        o: JsonObject,
        allowed: Set<String>,
        path: String,
    ) {
        for (key in o.keys) {
            if (key !in allowed) fail("$path.$key", "unknown key (allowed: ${allowed.joinToString(", ")})")
        }
    }

    private fun num(
        v: JsonElement?,
        path: String,
        min: Double = Double.NEGATIVE_INFINITY,
        max: Double = Double.POSITIVE_INFINITY,
        exclusiveMin: Boolean = false,
    ): Double {
        val prim = v as? JsonPrimitive
        val d = if (prim == null || prim.isString) null else prim.content.toDoubleOrNull()
        if (d == null || !d.isFinite()) fail(path, "expected a finite number")
        if (if (exclusiveMin) d <= min else d < min) fail(path, "must be ${if (exclusiveMin) ">" else ">="} $min")
        if (d > max) fail(path, "must be <= $max")
        return d
    }

    private fun interval(
        v: JsonElement?,
        path: String,
    ): Interval {
        if (v !is JsonArray || v.size != 2) fail(path, "expected [min, max]")
        val lo = num(v[0], "$path[0]", min = 0.0)
        val hi = num(v[1], "$path[1]", min = 0.0)
        if (lo > hi) fail(path, "min must be <= max")
        return Interval(lo, hi)
    }

    private fun xy(
        v: JsonElement?,
        path: String,
    ): Vec2 {
        val o = obj(v, path)
        onlyKeys(o, setOf("x", "y"), path)
        return Vec2(num(o["x"], "$path.x"), num(o["y"], "$path.y"))
    }

    private fun anchor(
        v: JsonElement?,
        path: String,
    ): EyeAnchor = xy(v, path).let { EyeAnchor(it.x, it.y) }

    private fun springConstants(
        v: JsonElement?,
        path: String,
    ): SpringConstants {
        val o = obj(v, path)
        onlyKeys(o, setOf("stiffness", "damping"), path)
        return SpringConstants(
            stiffness = num(o["stiffness"], "$path.stiffness", min = 0.0, exclusiveMin = true),
            damping = num(o["damping"], "$path.damping", min = 0.0),
        )
    }

    private fun partialParams(
        v: JsonElement?,
        path: String,
    ): PartialEyeParams {
        val o = obj(v, path)
        onlyKeys(o, allowedKeys, path)

        fun n(key: String): Double? = o[key]?.let { num(it, "$path.$key") }
        return PartialEyeParams(
            offsetX = n("offsetX"),
            offsetY = n("offsetY"),
            scaleX = n("scaleX"),
            scaleY = n("scaleY"),
            roundness = n("roundness"),
            upperLid = n("upperLid"),
            upperLidTilt = n("upperLidTilt"),
            lowerLid = n("lowerLid"),
            lowerLidBend = n("lowerLidBend"),
        )
    }

    private fun expression(
        v: JsonElement?,
        path: String,
    ): Expression {
        val o = obj(v, path)
        val shared = JsonObject(o.filterKeys { it != "left" && it != "right" })
        return Expression(
            shared = partialParams(shared, path),
            left = o["left"]?.let { partialParams(it, "$path.left") },
            right = o["right"]?.let { partialParams(it, "$path.right") },
        )
    }
}
