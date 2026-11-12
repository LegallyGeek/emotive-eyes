package com.legalgeeklabs.emotiveeyes.entities

import kotlin.math.sqrt

/** A mutable scalar spring; [target] is where it is heading. */
public class Spring(
    public var value: Double,
) {
    /** Current velocity in units per second. */
    public var velocity: Double = 0.0

    /** Resting position the spring is pulled toward. */
    public var target: Double = value
}

/** Damping (s^-1) that makes a unit-mass spring of [stiffness] critically damped. */
public fun criticalDamping(stiffness: Double): Double = 2 * sqrt(stiffness)

/**
 * Advances [spring] one semi-implicit Euler substep of [h] seconds; the operation order is normative.
 */
public fun stepSpring(
    spring: Spring,
    stiffness: Double,
    damping: Double,
    h: Double,
) {
    val a = stiffness * (spring.target - spring.value) - damping * spring.velocity
    spring.velocity = spring.velocity + a * h
    spring.value = spring.value + spring.velocity * h
}
