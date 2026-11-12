package com.legalgeeklabs.emotiveeyes.drivers.android

import com.legalgeeklabs.emotiveeyes.features.animateface.RandomSource
import kotlin.random.Random

/** A [RandomSource] backed by [Random]; pass a seeded one for reproducible runs. */
public class KotlinRandomSource(
    private val random: Random = Random.Default,
) : RandomSource {
    override fun next(): Double = random.nextDouble()
}
