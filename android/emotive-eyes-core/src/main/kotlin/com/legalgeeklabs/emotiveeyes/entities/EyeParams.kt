package com.legalgeeklabs.emotiveeyes.entities

/** Which eye of the face; "left" is the eye on the viewer's left. */
public enum class Side { LEFT, RIGHT }

/**
 * The nine numeric parameters that fully describe one eye (see spec/SPEC.md, "Eye parameters").
 * Springs may overshoot freely; clamping happens only in [computeEyeGeometry].
 */
public data class EyeParams(
    val offsetX: Double,
    val offsetY: Double,
    val scaleX: Double,
    val scaleY: Double,
    val roundness: Double,
    val upperLid: Double,
    val upperLidTilt: Double,
    val lowerLid: Double,
    val lowerLidBend: Double,
) {
    /** Values in canonical order, matching [KEYS]. */
    public fun toList(): List<Double> =
        listOf(offsetX, offsetY, scaleX, scaleY, roundness, upperLid, upperLidTilt, lowerLid, lowerLidBend)

    public companion object {
        /** Parameter names in canonical order. */
        public val KEYS: List<String> =
            listOf(
                "offsetX",
                "offsetY",
                "scaleX",
                "scaleY",
                "roundness",
                "upperLid",
                "upperLidTilt",
                "lowerLid",
                "lowerLidBend",
            )

        /** Builds params from values in canonical order. */
        public fun fromList(v: List<Double>): EyeParams {
            require(v.size == KEYS.size) { "expected ${KEYS.size} values, got ${v.size}" }
            return EyeParams(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8])
        }
    }
}

/** Both eyes' parameters, one frame of animation or one expression target. */
public data class FaceParams(
    val left: EyeParams,
    val right: EyeParams,
) {
    /** The parameters of [side]. */
    public operator fun get(side: Side): EyeParams = if (side == Side.LEFT) left else right
}

/** A partial override of [EyeParams]; `null` fields are left to the next layer of resolution. */
public data class PartialEyeParams(
    val offsetX: Double? = null,
    val offsetY: Double? = null,
    val scaleX: Double? = null,
    val scaleY: Double? = null,
    val roundness: Double? = null,
    val upperLid: Double? = null,
    val upperLidTilt: Double? = null,
    val lowerLid: Double? = null,
    val lowerLidBend: Double? = null,
)

/** An expression preset: shared overrides plus optional per-side overrides. */
public data class Expression(
    val shared: PartialEyeParams = PartialEyeParams(),
    val left: PartialEyeParams? = null,
    val right: PartialEyeParams? = null,
)

/** Resolves one side: `defaults <- expression.shared <- expression[side]`. */
public fun resolveParams(
    defaults: EyeParams,
    expression: Expression,
    side: Side,
): EyeParams {
    val sideOverride = if (side == Side.LEFT) expression.left else expression.right

    fun pick(
        field: (PartialEyeParams) -> Double?,
        fallback: Double,
    ): Double = sideOverride?.let(field) ?: field(expression.shared) ?: fallback
    return EyeParams(
        offsetX = pick({ it.offsetX }, defaults.offsetX),
        offsetY = pick({ it.offsetY }, defaults.offsetY),
        scaleX = pick({ it.scaleX }, defaults.scaleX),
        scaleY = pick({ it.scaleY }, defaults.scaleY),
        roundness = pick({ it.roundness }, defaults.roundness),
        upperLid = pick({ it.upperLid }, defaults.upperLid),
        upperLidTilt = pick({ it.upperLidTilt }, defaults.upperLidTilt),
        lowerLid = pick({ it.lowerLid }, defaults.lowerLid),
        lowerLidBend = pick({ it.lowerLidBend }, defaults.lowerLidBend),
    )
}

private fun clampRange(
    v: Double,
    lo: Double,
    hi: Double,
): Double = minOf(hi, maxOf(lo, v))

/** Applies the geometry-time clamps; returns a new object. */
public fun clampParams(p: EyeParams): EyeParams =
    EyeParams(
        offsetX = p.offsetX,
        offsetY = p.offsetY,
        scaleX = maxOf(0.0, p.scaleX),
        scaleY = maxOf(0.0, p.scaleY),
        roundness = maxOf(0.0, p.roundness),
        upperLid = clampRange(p.upperLid, 0.0, 1.0),
        upperLidTilt = clampRange(p.upperLidTilt, -45.0, 45.0),
        lowerLid = clampRange(p.lowerLid, 0.0, 1.0),
        lowerLidBend = clampRange(p.lowerLidBend, -1.0, 1.0),
    )
