plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation(libs.kotlinx.serialization.json)
    testImplementation(kotlin("test"))
}

val specDir = rootProject.projectDir.parentFile.resolve("spec")

tasks.test {
    useJUnitPlatform()
    systemProperty("emotiveeyes.specDir", specDir.absolutePath)
    inputs.dir(specDir)
}
