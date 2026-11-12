plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.legalgeeklabs.emotiveeyes.compose"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.all {
            it.systemProperty(
                "emotiveeyes.specDir",
                rootProject.projectDir.parentFile
                    .resolve("spec")
                    .absolutePath,
            )
        }
    }

    sourceSets {
        // Shared runtime spec JSON ships as assets (face.json, motion.json, status.json).
        getByName("main").assets.directories.add(
            rootProject.projectDir.parentFile
                .resolve("spec/runtime")
                .absolutePath,
        )
    }
}

kotlin {
    jvmToolchain(17)
    explicitApi()
}

dependencies {
    api(project(":emotive-eyes-core"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.kotlinx.coroutines.android)
    testImplementation(kotlin("test-junit"))
    testImplementation("junit:junit:4.13.2")
}
